import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as report } from '../functions/api/report.js';
import { onRequestGet as area } from '../functions/api/area.js';
import { onRequestGet as official, onRequestOptions } from '../functions/api/official.js';
import { d1, kv, assets, cdcFetch } from './helpers/cloudflare.mjs';
import { stateLevel } from '../src/server/area.js';

const ORIGIN = 'https://flufollower.com';
const US = { country: 'US', regionCode: 'CA', postalCode: '92101', asn: 7922 };
let env;
let realFetch;
let turnstileOk;

beforeEach(() => {
  env = { DB: d1(), OFFICIAL_CACHE: kv(), ASSETS: assets(), TURNSTILE_SECRET: 'secret', FEATURE_REPORT: 'true' };
  turnstileOk = true;
  realFetch = globalThis.fetch;
  const cdc = cdcFetch();
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('challenges.cloudflare.com')) {
      const token = init.body.get('response');
      return Response.json({ success: turnstileOk && token === 'good-token' });
    }
    return cdc(url, init);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ctx = (request) => ({ request, env, waitUntil() {} });

function post(body, { cf = US, headers = {}, form = false, host = ORIGIN } = {}) {
  const req = new Request(`${host}/api/report`, {
    method: 'POST',
    headers: form
      ? { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html', 'cf-connecting-ip': '203.0.113.5', ...headers }
      : { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.5', origin: host, ...headers },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  });
  Object.defineProperty(req, 'cf', { value: cf });
  return report(ctx(req));
}

function get(path, cf = US, headers = {}) {
  const req = new Request(`${ORIGIN}${path}`, { headers });
  Object.defineProperty(req, 'cf', { value: cf });
  return path.startsWith('/api/official') ? official(ctx(req)) : area(ctx(req));
}

const valid = { feeling: 'sick', fever: true, cough: true, consent: true, zip: '92101', 'cf-turnstile-response': 'good-token' };
const rows = () => env.DB.q('SELECT * FROM reports');

// --- POST /api/report ------------------------------------------------------- //

test('a valid report is stored without PII and answered with 202 + the area payload', async () => {
  const res = await post(valid);
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.area.location.county_fips, '06073');
  assert.equal(body.area.location.county_name, 'San Diego County');

  const [r] = rows();
  assert.equal(rows().length, 1);
  assert.equal(r.state, 'CA');
  assert.equal(r.county_fips, '06073');
  assert.equal(r.zip3, '921');
  assert.equal(r.ili, 1);
  assert.match(r.created_day, /^\d{4}-\d{2}-\d{2}$/, 'a day, not a timestamp');
  assert.match(r.iso_week, /^\d{4}-W\d{2}$/);
  assert.match(r.ip_hash, /^[0-9a-f]{64}$/);
  const stored = JSON.stringify(r);
  assert.doesNotMatch(stored, /203\.0\.113\.5/, 'no raw IP');
  assert.doesNotMatch(stored, /92101/, 'no ZIP5');
  assert.doesNotMatch(stored, /T\d{2}:\d{2}/, 'no time of day');
  assert.equal(r.quarantined, 0);
});

test('missing or failed Turnstile → 403, nothing stored', async () => {
  const { 'cf-turnstile-response': _, ...noToken } = valid;
  assert.equal((await post(noToken)).status, 403);
  assert.equal((await post({ ...valid, 'cf-turnstile-response': 'forged' })).status, 403);
  turnstileOk = false;
  assert.equal((await post(valid)).status, 403);
  assert.equal(rows().length, 0);
});

test('without a Turnstile secret the endpoint fails closed (503)', async () => {
  delete env.TURNSTILE_SECRET;
  const res = await post(valid);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'not_configured');
  assert.equal(rows().length, 0);
});

test('a filled honeypot is accepted and silently dropped', async () => {
  const res = await post({ ...valid, website: 'http://spam.example' });
  assert.equal(res.status, 202);
  assert.equal(rows().length, 0);
});

test('rate limited after 5 reports a day from one connection (3 per hour first)', async () => {
  const statuses = [];
  for (let i = 0; i < 4; i += 1) statuses.push((await post(valid)).status);
  assert.deepEqual(statuses, [202, 202, 202, 429], '4th within the hour is refused');
  assert.equal(rows().length, 3);
  const body = await (await post(valid)).json();
  assert.equal(body.error, 'rate_limited');
});

test('non-US visitors get 403 us_only with the US-only message', async () => {
  const res = await post(valid, { cf: { country: 'CA', postalCode: 'M5V' } });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { ok: false, error: 'us_only', message: 'FluFollower is US-only for now.' });
  assert.equal(rows().length, 0);
});

test('no consent → 422 consent_required', async () => {
  const res = await post({ ...valid, consent: false });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'consent_required');
  assert.equal(rows().length, 0);
});

test('FEATURE_REPORT=false → 503 and nothing stored', async () => {
  env.FEATURE_REPORT = 'false';
  const res = await post(valid);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'reporting_paused');
  assert.equal(rows().length, 0);
});

test('cross-origin posts are refused', async () => {
  const res = await post(valid, { headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } });
  assert.equal(res.status, 403);
});

test('a no-JS form post gets a server-rendered HTML result page', async () => {
  const res = await post({ feeling: 'fine', consent: 'on', zip: '94612', 'cf-turnstile-response': 'good-token' }, { form: true });
  assert.equal(res.status, 202);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'none'/);
  const html = await res.text();
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Alameda County, CA/);
  assert.match(html, /class="usmap"/, 'static US map instead of the globe');
  assert.match(html, /Not medical advice/);
  assert.match(html, /\/assets\/styles\.test\.css/);
  assert.equal(rows()[0].feeling, 'fine');
});

test('a no-JS post without Turnstile explains why, in HTML', async () => {
  const res = await post({ feeling: 'fine', consent: 'on' }, { form: true });
  assert.equal(res.status, 403);
  assert.match(await res.text(), /JavaScript/);
});

test('reports sent to a preview deployment never feed real aggregates', async () => {
  const res = await post(valid, { host: 'https://abc123.flufollower.pages.dev' });
  assert.equal(res.status, 202);
  assert.equal(rows()[0].quarantined, 1);
});

// --- GET /api/area ---------------------------------------------------------- //

test('/api/area?zip= returns the documented shape, with per-source week_ending and fetched_at', async () => {
  const res = await get('/api/area?zip=94612');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=900');
  const p = await res.json();
  assert.deepEqual(Object.keys(p.location).sort(), ['county_fips', 'county_name', 'source', 'state', 'state_name']);
  assert.equal(p.location.county_fips, '06001');
  for (const [key, src] of Object.entries(p.official)) {
    assert.match(src.week_ending, /^\d{4}-\d{2}-\d{2}$/, `${key} week_ending`);
    assert.ok(Date.parse(src.fetched_at), `${key} fetched_at`);
  }
  assert.ok(p.official.nhsn_levels && p.official.nwss_wval && p.official.nssp_ed && p.official.nssp_ari);
  assert.equal(p.highlights.wastewater_flu.level_label, 'Moderate');
  assert.equal(p.highlights.nhsn_flu.level_label, 'Very Low');
  assert.equal(p.community.suppressed, true);
  assert.equal(p.community.n, null, 'n < 5 → no counts');
  assert.equal(typeof p.meaning, 'string');
  assert.doesNotMatch(p.meaning, /outbreak/i);
  assert.equal(p.level.kind, 'sample');
  assert.match(p.meaning, /illustrative sample data/);
  assert.doesNotMatch(p.meaning, /this week's CDC data/);
});

test('state fallback preserves its observation period, sample kind and unknown missing score', async () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const request = new Request(ORIGIN + '/api/area?zip=94612');
  const fromSnapshot = (snap) => stateLevel({ ASSETS: { fetch: async () => Response.json(snap) } }, request, 'CA', now);
  const sample = await fromSnapshot({ kind: 'sample', weekEnding: '2026-10-03', states: { CA: { edCombinedSeries: [0.2, 0.3], weekEnding: '2026-09-26' } } });
  assert.equal(sample.kind, 'sample');
  assert.equal(sample.week_ending, '2026-09-26', 'state observation date takes precedence over snapshot date');
  assert.equal(sample.provenance.kind, 'sample');
  const missing = await fromSnapshot({ kind: 'live', weekEnding: '2026-10-03', states: { CA: {} } });
  assert.equal(missing.level, null);
  assert.equal(missing.label, 'No data');
});

test('new retrieval cannot make an old state observation current', async () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const snapshot = { kind: 'live', generatedAt: now.toISOString(), weekEnding: '2026-10-03', states: { CA: {
    edCombinedSeries: [0.2, 0.3],
    provenance: { kind: 'live', observationPeriod: { weekEnding: '2026-09-05' } },
  } } };
  const level = await stateLevel({ ASSETS: { fetch: async () => Response.json(snapshot) } }, new Request(ORIGIN), 'CA', now);
  assert.equal(level.week_ending, '2026-09-05');
  assert.equal(level.age_days, 34);
  assert.equal(level.stale, true);
});

test('/api/area without a ZIP uses request.cf and is cached privately', async () => {
  const res = await get('/api/area');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, max-age=900');
  const p = await res.json();
  assert.equal(p.location.source, 'ip');
  assert.equal(p.location.county_fips, '06073');
});

test('/api/area from abroad without a ZIP → 403 us_only', async () => {
  const res = await get('/api/area', { country: 'FR' });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'us_only');
});

test('/api/area serves the community block from daily aggregates (n >= 5 shows n)', async () => {
  const day = new Date().toISOString().slice(0, 10);
  env.DB.raw.prepare("INSERT INTO report_aggregates_daily VALUES (?, '06001', 'CA', 7, 3, 2, 1, 0)").run(day);
  const p = await (await get('/api/area?zip=94612')).json();
  assert.equal(p.community.suppressed, false);
  assert.equal(p.community.n, 7);
  assert.equal(p.community.pct_ili, null);
});

test('/api/area reuses the KV document instead of re-pulling CDC', async () => {
  await get('/api/area?zip=94612');
  const calls = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (u, i) => (calls.push(String(u)), before(u, i));
  await get('/api/area?zip=94612');
  globalThis.fetch = before;
  assert.equal(calls.filter((u) => u.includes('data.cdc.gov')).length, 0);
});

test('/api/area with a bad ZIP → 422; an unknown ZIP → 404', async () => {
  assert.equal((await get('/api/area?zip=12')).status, 422);
  assert.equal((await get('/api/area?zip=00000')).status, 404);
});

test('/api/area renders HTML for a no-JS GET form', async () => {
  const res = await get('/api/area?zip=94612', US, { Accept: 'text/html' });
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Alameda County, CA/);
});

// --- GET /api/official ------------------------------------------------------ //

test('/api/official is official-only, CORS-open and cached 15 minutes', async () => {
  const res = await get('/api/official?state=CA&county=06001');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=900');
  const o = await res.json();
  assert.equal(o.state, 'CA');
  assert.equal(o.county_name, 'Alameda County');
  assert.ok(o.official.state.nhsn_levels.week_ending);
  assert.ok(o.official.county.nwss_wval.fetched_at);
  assert.match(o.attribution, /CDC/);
  assert.equal('community' in o, false);
});

test('/api/official validates its parameters', async () => {
  assert.equal((await get('/api/official?state=ZZ')).status, 400);
  assert.equal((await get('/api/official?state=CA&county=36061')).status, 400, 'county outside the state');
  assert.equal(onRequestOptions().status, 204);
});

test('a request that finds another pull in progress backs off without releasing that pull\'s lock', async () => {
  const { refreshState } = await import('../src/server/area.js');
  await env.OFFICIAL_CACHE.put('pull-lock:CA', '1', { expirationTtl: 60 });
  const docs = await refreshState(env, 'CA');
  assert.equal(docs, null, 'backs off');
  assert.equal(await env.OFFICIAL_CACHE.get('pull-lock:CA'), '1', 'the other pull still holds its lock');
});

test('a pull that took the lock releases it when done', async () => {
  const { refreshState } = await import('../src/server/area.js');
  const docs = await refreshState(env, 'CA');
  assert.ok(docs && docs.size > 0);
  assert.equal(await env.OFFICIAL_CACHE.get('pull-lock:CA'), null);
});
