import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATEGORIES,
  DOCUMENTED_ED_GAPS,
  EPIDEMIC_TREND_URL,
  MAX_REPORT_AGE_DAYS,
  MIN_STATES_WITH_ESTIMATES,
  compareDirections,
  fetchEpidemicTrend,
  inBand,
  parseEpidemicTrend,
  planEpidemicTrend,
  publicEpidemicTrend,
  resolveEpidemicTrend,
} from '../build/lib/epidemic-trend.mjs';
import { states } from '../src/scripts/states-data.js';

// A faithful subset (national + 51 state rows + 3 substate rows) of CDC's
// rt-map/1.0.0 COVID-19 release dated 2026-10-07; values are untouched.
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/cdc/covid-19-rt-map.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-10-09T12:00:00Z');

// --- the real release parses to what CDC published ------------------------- //

test('the October 7 release parses: dates, 51 state estimates, national category', () => {
  const r = parseEpidemicTrend(fixture(), { now: NOW });
  assert.equal(r.ok, true);
  const d = r.data;
  assert.equal(d.reportDate, '2026-10-07');
  assert.equal(d.trainingDataEnd, '2026-10-06');
  assert.equal(d.upstreamSchema, 'rt-map/1.0.0');
  assert.equal(Object.keys(d.states).length, 51);
  assert.deepEqual(d.rejected, []);
  assert.deepEqual(d.notEstimated, {});
  assert.equal(d.national.category, 'not_changing');
  assert.equal(d.national.label, 'Not changing');
});

test('Wyoming, Connecticut and Iowa carry CDC’s own numbers, unrounded', () => {
  const d = parseEpidemicTrend(fixture(), { now: NOW }).data;
  assert.deepEqual(d.states.WY, { category: 'likely_growing', label: 'Likely growing', direction: 'up', pGrowing: 0.782, median: 1.0219, lower95: 0.9649, upper95: 1.0695 });
  assert.deepEqual(d.states.CT, { category: 'declining', label: 'Declining', direction: 'down', pGrowing: 0.028, median: 0.9045, lower95: 0.8213, upper95: 1.0019 });
  assert.equal(d.states.IA.category, 'likely_growing');
  assert.equal(d.states.SD.category, 'likely_growing');
});

test('the category counts match CDC’s release (4 / 8 / 25 / 6 / 8)', () => {
  const d = parseEpidemicTrend(fixture(), { now: NOW }).data;
  const tally = {};
  for (const e of Object.values(d.states)) tally[e.category] = (tally[e.category] || 0) + 1;
  assert.deepEqual(tally, { growing: 4, likely_growing: 8, not_changing: 25, likely_declining: 6, declining: 8 });
  const named = (cat) => Object.keys(d.states).filter((a) => d.states[a].category === cat).sort();
  assert.deepEqual(named('growing'), ['ME', 'MN', 'MT', 'WI']);
  assert.deepEqual(named('likely_growing'), ['AK', 'IA', 'MI', 'RI', 'SD', 'TN', 'UT', 'WY']);
});

test('substate rows, and the fixture’s not-estimated substate rows, are ignored', () => {
  const p = fixture();
  assert.ok(p.rows.some((r) => r.location_type === 'hsa' && r.not_estimated === true), 'fixture should include a not-estimated substate row');
  const d = parseEpidemicTrend(p, { now: NOW }).data;
  assert.equal(Object.keys(d.states).length, 51);
  assert.deepEqual(d.notEstimated, {});
});

test('CDC’s five bands are contiguous from 0 to 1 and each fixture probability sits in its own band', () => {
  const bands = Object.values(CATEGORIES).map((c) => [c.min, c.max]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(bands, [[0, 0.1], [0.1, 0.25], [0.25, 0.75], [0.75, 0.9], [0.9, 1]]);
  for (const r of fixture().rows.filter((x) => x.category)) assert.equal(inBand(r.category, r.p_growing), true, `${r.fips} ${r.category} ${r.p_growing}`);
});

test('band edges tolerate three-place rounding but not a different category', () => {
  assert.equal(inBand('likely_growing', 0.9005), true);
  assert.equal(inBand('growing', 0.8985), true);
  assert.equal(inBand('likely_growing', 0.91), false);
  assert.equal(inBand('declining', 0.5), false);
  assert.equal(inBand('nonsense', 0.5), false);
  assert.equal(inBand('growing', 'x'), false);
});

// --- payload-level rejection ----------------------------------------------- //

const mutate = (fn) => { const p = fixture(); fn(p); return p; };
const rejects = [
  ['null', null, 'not-an-object'],
  ['an array', [], 'not-an-object'],
  ['another schema', mutate((p) => { p.schema = 'rt-map/2.0.0'; }), 'unsupported-schema'],
  ['a missing schema', mutate((p) => { delete p.schema; }), 'unsupported-schema'],
  ['another disease', mutate((p) => { p.disease = 'influenza'; }), 'wrong-disease'],
  ['an unavailable status', mutate((p) => { p.status = 'unavailable'; }), 'status-not-available'],
  ['a non-date report_date', mutate((p) => { p.report_date = 'Oct 7'; }), 'invalid-dates'],
  ['an impossible calendar date', mutate((p) => { p.report_date = '2026-02-31'; }), 'invalid-dates'],
  ['training data ending after the report', mutate((p) => { p.training_data_end = '2026-10-08'; }), 'training-end-after-report'],
  ['a report from the future', mutate((p) => { p.report_date = '2026-10-20'; p.training_data_end = '2026-10-19'; }), 'future-report'],
  ['no rows array', mutate((p) => { p.rows = {}; }), 'rows-missing'],
];
for (const [name, payload, reason] of rejects) {
  test(`rejects ${name}`, () => {
    const r = parseEpidemicTrend(payload, { now: NOW });
    assert.equal(r.ok, false);
    assert.equal(r.reason, reason);
  });
}

test('rejects a stale report: older than the age limit is withheld, at the limit is accepted', () => {
  const stale = new Date(Date.parse('2026-10-07T00:00:00Z') + (MAX_REPORT_AGE_DAYS + 1) * 86_400_000);
  const atLimit = new Date(Date.parse('2026-10-07T00:00:00Z') + MAX_REPORT_AGE_DAYS * 86_400_000);
  assert.equal(parseEpidemicTrend(fixture(), { now: stale }).reason, 'stale-report');
  assert.equal(parseEpidemicTrend(fixture(), { now: atLimit }).ok, true);
});

test('rejects duplicate state rows rather than choosing one', () => {
  const p = fixture();
  p.rows.push({ ...p.rows.find((r) => r.fips === '56') });
  assert.deepEqual(parseEpidemicTrend(p, { now: NOW }), { ok: false, reason: 'duplicate-state-rows', detail: 'WY' });
});

test('a release that estimates too few states is malformed, not quiet', () => {
  const p = fixture();
  let kept = 0;
  p.rows = p.rows.filter((r) => r.location_type !== 'state' || (kept += 1) < MIN_STATES_WITH_ESTIMATES);
  const r = parseEpidemicTrend(p, { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too-few-states');
});

// --- row-level rejection: a bad row is dropped, never shown ---------------- //

test('a state whose category contradicts its own probability is dropped, others survive', () => {
  const p = fixture();
  p.rows.find((r) => r.fips === '56').p_growing = 0.31; // "likely growing" at 31% is not a thing
  const r = parseEpidemicTrend(p, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.data.states.WY, undefined);
  assert.equal(Object.keys(r.data.states).length, 50);
  assert.deepEqual(r.data.rejected, [{ fips: '56', reason: 'category-probability-mismatch' }]);
});

test('malformed rows are dropped with a reason', () => {
  const cases = [
    ['unknown category', (r) => { r.category = 'surging'; }, 'unknown-category'],
    ['string probability', (r) => { r.p_growing = '0.78'; }, 'non-numeric'],
    ['NaN median', (r) => { r.median = NaN; }, 'non-numeric'],
    ['probability above 1', (r) => { r.p_growing = 1.2; }, 'probability-out-of-range'],
    ['interval that excludes the median', (r) => { r.lower_95 = 1.05; }, 'interval-invalid'],
    ['non-positive lower bound', (r) => { r.lower_95 = 0; }, 'interval-invalid'],
  ];
  for (const [name, change, reason] of cases) {
    const p = fixture();
    change(p.rows.find((r) => r.fips === '09'));
    const r = parseEpidemicTrend(p, { now: NOW });
    assert.equal(r.ok, true, name);
    assert.equal(r.data.states.CT, undefined, name);
    assert.deepEqual(r.data.rejected, [{ fips: '09', reason }], name);
  }
});

test('unknown jurisdictions and non-object rows are rejected without throwing', () => {
  const p = fixture();
  p.rows.push({ fips: '99', location_type: 'state', category: 'declining', median: 0.9, lower_95: 0.8, upper_95: 1, p_growing: 0.05 }, 7, null);
  const r = parseEpidemicTrend(p, { now: NOW });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.rejected.map((x) => x.reason).sort(), ['row-not-an-object', 'row-not-an-object', 'unknown-jurisdiction']);
});

test('a state CDC did not estimate is recorded as such and never as a category', () => {
  const p = fixture();
  const idx = p.rows.findIndex((r) => r.fips === '04');
  p.rows[idx] = { fips: '04', location_type: 'state', not_estimated: true, not_estimated_detail: 'low_data', category: null, median: null, lower_95: null, upper_95: null, p_growing: null };
  const j = p.rows.findIndex((r) => r.fips === '05');
  p.rows[j] = { fips: '05', location_type: 'state', not_estimated: true, not_estimated_detail: '<script>', category: null };
  const r = parseEpidemicTrend(p, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.data.states.AZ, undefined);
  assert.deepEqual(r.data.notEstimated, { AZ: 'low_data', AR: 'other' }, 'free text from upstream never survives');
  const k = p.rows.findIndex((x) => x.fips === '06');
  p.rows[k] = { ...p.rows[k], not_estimated: true };
  assert.deepEqual(parseEpidemicTrend(p, { now: NOW }).data.rejected, [{ fips: '06', reason: 'contradictory-row' }]);
});

test('the national row is optional and must itself be valid', () => {
  const noNational = mutate((p) => { p.rows = p.rows.filter((r) => r.location_type !== 'national'); });
  assert.equal(parseEpidemicTrend(noNational, { now: NOW }).data.national, null);
  const bad = mutate((p) => { p.rows.find((r) => r.location_type === 'national').p_growing = 0.9; });
  const r = parseEpidemicTrend(bad, { now: NOW });
  assert.equal(r.data.national, null);
  assert.deepEqual(r.data.rejected, [{ fips: '00000', reason: 'category-probability-mismatch' }]);
});

// --- fetching: transient failures retry, content problems do not ----------- //

function reply(body, { status = 200, url = EPIDEMIC_TREND_URL, length } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (k) => (k.toLowerCase() === 'content-length' && length !== undefined ? String(length) : null) },
    text: async () => text,
  };
}
const noSleep = { sleep: async () => {}, now: NOW };
const sequence = (...steps) => {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  impl.calls = calls;
  return impl;
};

test('a good response is validated and stamped with its retrieval time and URL', async () => {
  const fetchImpl = sequence(reply(fixture()));
  const r = await fetchEpidemicTrend({ fetchImpl, ...noSleep });
  assert.equal(r.ok, true);
  assert.equal(r.data.retrievedAt, NOW.toISOString());
  assert.equal(r.data.sourceUrl, EPIDEMIC_TREND_URL);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, EPIDEMIC_TREND_URL);
  assert.equal(fetchImpl.calls[0].init.headers.Accept, 'application/json');
});

test('a 503, then a network error, then success: retried with backoff', async () => {
  const waits = [];
  const fetchImpl = sequence(reply('x', { status: 503 }), new TypeError('fetch failed'), reply(fixture()));
  const r = await fetchEpidemicTrend({ fetchImpl, now: NOW, sleep: async (ms) => waits.push(ms) });
  assert.equal(r.ok, true);
  assert.equal(fetchImpl.calls.length, 3);
  assert.deepEqual(waits, [2000, 5000]);
});

test('persistent 5xx reports the HTTP error after the last attempt', async () => {
  const fetchImpl = sequence(reply('x', { status: 502 }));
  const r = await fetchEpidemicTrend({ fetchImpl, ...noSleep });
  assert.deepEqual(r, { ok: false, reason: 'http-error', detail: 'HTTP 502' });
  assert.equal(fetchImpl.calls.length, 3);
});

test('a 404 is final: one attempt, no retry', async () => {
  const fetchImpl = sequence(reply('x', { status: 404 }));
  const r = await fetchEpidemicTrend({ fetchImpl, ...noSleep });
  assert.deepEqual(r, { ok: false, reason: 'http-error', detail: 'HTTP 404' });
  assert.equal(fetchImpl.calls.length, 1);
});

test('429 is transient', async () => {
  const fetchImpl = sequence(reply('x', { status: 429 }), reply(fixture()));
  assert.equal((await fetchEpidemicTrend({ fetchImpl, ...noSleep })).ok, true);
});

test('a hung request is aborted by the timeout and reported, not hung', async () => {
  const fetchImpl = (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const r = await fetchEpidemicTrend({ fetchImpl, attempts: 1, timeoutMs: 15, ...noSleep });
  assert.deepEqual(r, { ok: false, reason: 'network-error', detail: 'timed out after 15 ms' });
});

test('content problems are final: invalid JSON, stale, oversized and foreign hosts', async () => {
  const bad = sequence(reply('<html>blocked</html>'));
  assert.deepEqual(await fetchEpidemicTrend({ fetchImpl: bad, ...noSleep }), { ok: false, reason: 'invalid-json' });
  assert.equal(bad.calls.length, 1);

  const stale = sequence(reply(fixture()));
  const old = await fetchEpidemicTrend({ fetchImpl: stale, attempts: 3, sleep: async () => {}, now: new Date('2026-12-01T00:00:00Z') });
  assert.equal(old.reason, 'stale-report');
  assert.equal(stale.calls.length, 1, 'stale content is not retried');

  const big = sequence(reply(fixture(), { length: 50 * 1024 * 1024 }));
  assert.deepEqual(await fetchEpidemicTrend({ fetchImpl: big, ...noSleep }), { ok: false, reason: 'payload-too-large' });

  const foreign = sequence(reply(fixture(), { url: 'https://captive.example.net/login' }));
  const f = await fetchEpidemicTrend({ fetchImpl: foreign, ...noSleep });
  assert.deepEqual(f, { ok: false, reason: 'unexpected-host', detail: 'captive.example.net' });
  const subdomain = sequence(reply(fixture(), { url: 'https://www.cdc.gov/wcms/vizdata/x.json' }));
  assert.equal((await fetchEpidemicTrend({ fetchImpl: subdomain, ...noSleep })).ok, true);
});

test('fetchEpidemicTrend never throws, even without a usable fetch', async () => {
  const r = await fetchEpidemicTrend({ fetchImpl: undefined, attempts: 1, ...noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'network-error');
});

// --- build policy ---------------------------------------------------------- //

test('EPIDEMIC_TREND=off and offline builds skip the network entirely', async () => {
  const fetchImpl = sequence(reply(fixture()));
  const off = await resolveEpidemicTrend({ env: { EPIDEMIC_TREND: 'off' }, fetchImpl, ...noSleep });
  assert.deepEqual([off.status, off.data], ['skipped', null]);
  const offline = await resolveEpidemicTrend({ env: { LIVE_PRERENDER: 'off' }, fetchImpl, ...noSleep });
  assert.deepEqual([offline.status, offline.data], ['skipped', null]);
  assert.match(offline.reason, /offline/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('a typo in EPIDEMIC_TREND fails loudly; there is no require mode', async () => {
  await assert.rejects(resolveEpidemicTrend({ env: { EPIDEMIC_TREND: 'require' }, ...noSleep }), /EPIDEMIC_TREND must be "auto" or "off"/);
});

test('a failed fetch is reported as unavailable with no data, and does not throw — even under LIVE_PRERENDER=require', async () => {
  const fetchImpl = sequence(reply('x', { status: 403 }));
  const r = await resolveEpidemicTrend({ env: { LIVE_PRERENDER: 'require' }, fetchImpl, ...noSleep });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.data, null);
  assert.match(r.reason, /http-error \(HTTP 403\)/);
});

test('a good fetch resolves to data and a human-readable reason', async () => {
  const r = await resolveEpidemicTrend({ env: {}, fetchImpl: sequence(reply(fixture())), ...noSleep });
  assert.equal(r.status, 'ok');
  assert.equal(r.reason, 'report 2026-10-07, data through 2026-10-06');
});

// --- planning: what may a page show? --------------------------------------- //

const LIVE = { live: true, kind: 'live' };
function modelsWith(edByAbbr = {}) {
  const models = new Map();
  for (const st of states) {
    const ed = st.abbr in edByAbbr ? edByAbbr[st.abbr] : { status: 'available', contributes: true };
    models.set(st.abbr, { signals: { pathogens: { covid: { provenance: { metrics: ed ? { edVisits: ed } : {} } } } } });
  }
  return models;
}
const parsed = () => ({ ...parseEpidemicTrend(fixture(), { now: NOW }).data, retrievedAt: NOW.toISOString(), sourceUrl: EPIDEMIC_TREND_URL });

test('no plan without data, and none for a sample snapshot', () => {
  assert.equal(planEpidemicTrend(null, { models: modelsWith(), provenance: LIVE }), null);
  assert.equal(planEpidemicTrend(parsed(), { models: modelsWith(), provenance: { live: false, kind: 'sample' } }), null);
  assert.equal(planEpidemicTrend(parsed(), { models: modelsWith() }), null);
});

test('Iowa and South Dakota are withheld on CDC’s own documented ED gaps, even if ED rows existed', () => {
  const plan = planEpidemicTrend(parsed(), { models: modelsWith(), provenance: LIVE });
  for (const abbr of ['IA', 'SD']) {
    const d = plan.byState.get(abbr);
    assert.equal(d.status, 'withheld', abbr);
    assert.equal(d.reason, 'documented-ed-gap', abbr);
    assert.equal(d.gap, DOCUMENTED_ED_GAPS[abbr]);
  }
});

test('a state with no current ED observation is withheld; Wyoming and Connecticut are shown', () => {
  const plan = planEpidemicTrend(parsed(), {
    models: modelsWith({ NV: { status: 'missing', contributes: false }, NM: null, NH: { status: 'stale', contributes: false }, VT: { status: 'unavailable' } }),
    provenance: LIVE,
  });
  for (const abbr of ['NV', 'NM', 'NH', 'VT']) assert.deepEqual([plan.byState.get(abbr).status, plan.byState.get(abbr).reason], ['withheld', 'no-ed-series'], abbr);
  assert.equal(plan.byState.get('WY').status, 'shown');
  assert.equal(plan.byState.get('WY').estimate.category, 'likely_growing');
  assert.equal(plan.byState.get('CT').status, 'shown');
});

test('ED data from an earlier week than the index’s other inputs still count as ED data', () => {
  // `contributes: false` with status "available" means the ED observation exists but is dated differently.
  const plan = planEpidemicTrend(parsed(), { models: modelsWith({ OH: { status: 'available', contributes: false } }), provenance: LIVE });
  assert.equal(plan.byState.get('OH').status, 'shown');
});

test('counts cover only states whose category is shown, and add up', () => {
  const plan = planEpidemicTrend(parsed(), { models: modelsWith({ NV: { status: 'missing' } }), provenance: LIVE });
  // 51 estimates − IA − SD (documented) − NV (no ED) = 48 shown.
  assert.equal(plan.counts.shown, 48);
  assert.equal(plan.counts.withheld, 3);
  // NV is "not changing", IA and SD "likely growing": up 12−2, flat 25−1, down 14.
  assert.deepEqual({ up: plan.counts.up, flat: plan.counts.flat, down: plan.counts.down }, { up: 10, flat: 24, down: 14 });
  assert.equal(plan.counts.up + plan.counts.flat + plan.counts.down, plan.counts.shown);
});

test('a state with no record says nothing; a not-estimated state is flagged as that', () => {
  const data = parsed();
  delete data.states.AZ;
  data.notEstimated = { AR: 'low_data' };
  delete data.states.AR;
  const plan = planEpidemicTrend(data, { models: modelsWith(), provenance: LIVE });
  assert.deepEqual(plan.byState.get('AZ'), { status: 'no-record' });
  assert.deepEqual(plan.byState.get('AR'), { status: 'not-estimated', reason: 'low_data' });
  assert.equal(plan.counts.notEstimated, 1);
});

test('documented gaps cite a CDC page and a verification date', () => {
  for (const [abbr, gap] of Object.entries(DOCUMENTED_ED_GAPS)) {
    assert.ok(states.some((s) => s.abbr === abbr), abbr);
    assert.equal(new URL(gap.source).hostname, 'www.cdc.gov');
    assert.match(gap.verified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(gap.text.length > 40);
  }
});

// --- direction comparison -------------------------------------------------- //

test('only opposite directions are a disagreement; flat and unknown never are', () => {
  const m = (key, direction) => ({ key, direction });
  assert.equal(compareDirections('declining', [m('edVisits', 'flat'), m('wastewater', 'up')]).divergent, true);
  assert.deepEqual(compareDirections('declining', [m('edVisits', 'flat'), m('wastewater', 'up')]).opposite.map((x) => x.key), ['wastewater']);
  assert.equal(compareDirections('likely_growing', [m('edVisits', 'down')]).divergent, true);
  assert.equal(compareDirections('likely_growing', [m('edVisits', 'up'), m('wastewater', 'up')]).divergent, false);
  assert.equal(compareDirections('growing', [m('edVisits', 'flat'), m('wastewater', 'unknown')]).divergent, false);
  assert.equal(compareDirections('not_changing', [m('edVisits', 'up'), m('wastewater', 'down')]).divergent, false, 'CDC saying "not changing" is not opposed to either');
  assert.equal(compareDirections('declining', []).divergent, false);
  assert.equal(compareDirections('nonsense', [m('edVisits', 'up')]).divergent, false);
});

// --- the shipped record ---------------------------------------------------- //

test('the public record carries shown estimates, withheld reasons and counts, and no raw upstream rows', () => {
  const plan = planEpidemicTrend(parsed(), { models: modelsWith({ NV: { status: 'missing' } }), provenance: LIVE });
  const out = publicEpidemicTrend(plan);
  assert.equal(out.schema, 'flutrack-epidemic-trends/1');
  assert.equal(out.reportDate, '2026-10-07');
  assert.equal(out.trainingDataEnd, '2026-10-06');
  assert.equal(out.retrievedAt, NOW.toISOString());
  assert.equal(out.source.url, EPIDEMIC_TREND_URL);
  assert.equal(out.source.upstreamSchema, 'rt-map/1.0.0');
  assert.equal(out.national.category, 'not_changing');
  assert.equal(Object.keys(out.states).length, 48);
  assert.deepEqual(out.states.WY, { category: 'likely_growing', label: 'Likely growing', pGrowing: 0.782, median: 1.0219, lower95: 0.9649, upper95: 1.0695 });
  assert.equal(out.states.IA, undefined);
  assert.deepEqual(out.withheld, { IA: 'documented-ed-gap', NV: 'no-ed-series', SD: 'documented-ed-gap' });
  assert.equal(out.counts.shown, 48);
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /fips|percent_visits|threshold_classification|hsa/);
  assert.equal(publicEpidemicTrend(null), null);
});
