import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNsspEd,
  normalizeNsspAri,
  normalizeNhsn,
  normalizeNwssWval,
  normalizeNwssSite,
  normalizeDelphiFluview,
  epiweekToSaturday,
  weekEndingSaturday,
  countyFipsByName,
  MAX_WVAL,
} from '../workers/ingest/src/normalize.js';
import { runSource, sourceDefs, epiweek } from '../workers/ingest/src/pull.js';
import { runIngest, writeKvForStates, authorized } from '../workers/ingest/src/index.js';
import worker from '../workers/ingest/src/index.js';
import { dailyMaintenance, rebuildAggregates, purgeOldReports, quarantineAnomalies } from '../workers/ingest/src/maintenance.js';
import { upsertOfficial, upsertStatements, loadOfficialRows, docsFromRows, sqlLiteral } from '../src/server/official-store.js';
import { mergeDocs, docFromRows, wvalMethodVersion, OFFICIAL_TTL_SECONDS } from '../src/server/sources.js';
import { d1, kv, fixture } from './helpers/cloudflare.mjs';

const AT = '2026-10-09T18:00:00.000Z';
const NOW = new Date(AT);

// --- Normalizers on recorded fixtures (test/fixtures/cdc) ------------------ //

test('NSSP ED (vutn-jzwm): state, pathogen, percent of visits, week ending', () => {
  const rows = normalizeNsspEd(fixture('vutn-jzwm'), AT);
  assert.equal(rows.length, 6);
  const caFlu = rows.find((r) => r.geo_id === 'CA' && r.pathogen === 'influenza');
  assert.deepEqual(caFlu, {
    source: 'nssp_ed', geo_level: 'state', geo_id: 'CA', pathogen: 'influenza', metric: 'pct_ed_visits',
    value: 0.7, level_label: null, week_ending: '2026-09-26', fetched_at: AT, method_version: null,
  });
  assert.equal(rows.find((r) => r.geo_id === 'NY' && r.pathogen === 'rsv').value, 0, 'a published 0.0 stays 0');
});

test('NSSP ARI (f3zz-zga5): CDC label kept; "Data Unavailable" and territories dropped', () => {
  const raw = fixture('f3zz-zga5');
  const rows = normalizeNsspAri(raw, AT);
  assert.ok(rows.length >= 40 && rows.length <= 51);
  assert.ok(rows.every((r) => r.level_label !== 'Data Unavailable'));
  assert.ok(!rows.some((r) => ['GU', 'PR', 'VI'].includes(r.geo_id)));
  const al = rows.find((r) => r.geo_id === 'AL');
  assert.equal(al.level_label, 'Low');
  assert.equal(al.value, 1);
});

test('NHSN levels (vdzy-6i9v): admissions and rate per 100k with the CDC level; USA row skipped', () => {
  const rows = normalizeNhsn(fixture('vdzy-6i9v'), AT, 'nhsn_levels');
  assert.ok(rows.every((r) => r.geo_id === 'CA'));
  const rate = rows.find((r) => r.pathogen === 'influenza' && r.metric === 'admissions_per_100k');
  assert.equal(rate.value, 0.99);
  assert.equal(rate.level_label, 'Very Low');
  assert.equal(rows.find((r) => r.pathogen === 'influenza' && r.metric === 'admissions').value, 386);
});

test('NHSN HRD final and preliminary (ua7e-t2fy, mpgq-jmmr) normalize to their own sources', () => {
  const fin = normalizeNhsn(fixture('ua7e-t2fy'), AT, 'nhsn_hrd');
  const pre = normalizeNhsn(fixture('mpgq-jmmr'), AT, 'nhsn_hrd_prelim');
  assert.ok(fin.length && fin.every((r) => r.source === 'nhsn_hrd'));
  assert.ok(pre.some((r) => r.week_ending === '2026-10-03'), 'preliminary runs a week ahead');
});

test('NWSS WVAL (atcp-73re): WastewaterSCAN rows are dropped before anything else', () => {
  const raw = fixture('atcp-73re');
  assert.ok(raw.some((r) => /WastewaterSCAN/.test(r.source)), 'fixture really contains WastewaterSCAN rows');
  const scanOnly = raw.filter((r) => /WastewaterSCAN/.test(r.source));
  assert.equal(normalizeNwssWval(scanOnly, AT).length, 0, 'WastewaterSCAN alone yields nothing');
});

test('NWSS WVAL: county FIPS from names, median site, CDC category, method version, site count', () => {
  const rows = normalizeNwssWval(fixture('atcp-73re'), AT);
  const alameda = rows.filter((r) => r.geo_id === '06001' && r.pathogen === 'influenza');
  assert.equal(alameda.find((r) => r.metric === 'wval').level_label, 'Moderate');
  assert.equal(alameda.find((r) => r.metric === 'site_count').value, 1);
  assert.ok(rows.every((r) => r.geo_level === 'county' && /^06\d{3}$/.test(r.geo_id)));
  assert.ok(rows.every((r) => r.method_version === 'wval-2026-08-14'));
  assert.ok(!rows.some((r) => r.geo_id === '06073'), 'San Diego has only a joint WastewaterSCAN site');
});

test('NWSS WVAL: multi-county sites count toward each county; absurd values are dropped', () => {
  const base = { state_territory: 'California', source: 'State_Territory', week_end: '2026-09-26', pathogen_target: 'Influenza A virus' };
  const rows = normalizeNwssWval(
    [
      { ...base, site: 'A', counties_served: 'Los Angeles, Ventura', site_wval: '4', site_wval_category: 'Low' },
      { ...base, site: 'B', counties_served: 'Ventura', site_wval: '9', site_wval_category: 'Moderate' },
      { ...base, site: 'C', counties_served: 'Ventura', site_wval: '2663522980784095400000', site_wval_category: 'Very High' },
    ],
    AT
  );
  const wval = (fips) => rows.find((r) => r.geo_id === fips && r.metric === 'wval');
  assert.equal(wval('06037').value, 4);
  assert.equal(wval('06111').value, 4, 'median site of {4, 9} (lower middle)');
  assert.equal(rows.find((r) => r.geo_id === '06111' && r.metric === 'site_count').value, 2, 'the outlier site is not counted');
  assert.ok(MAX_WVAL < 1e6);
});

test('WVAL method version splits at 2026-08-14', () => {
  assert.equal(wvalMethodVersion('2026-08-08'), 'wval-pre-2026-08-14');
  assert.equal(wvalMethodVersion('2026-08-15'), 'wval-2026-08-14');
});

test('NWSS site samples (ymmh-divb): WastewaterSCAN rows dropped, comma FIPS lists split', () => {
  const raw = fixture('ymmh-divb');
  assert.ok(raw.some((r) => r.source === 'WastewaterSCAN'));
  const rows = normalizeNwssSite(raw, AT);
  const scanOnly = normalizeNwssSite(raw.filter((r) => r.source === 'WastewaterSCAN'), AT);
  assert.equal(scanOnly.length, 0);
  assert.ok(rows.length > 0 && rows.every((r) => /^\d{5}$/.test(r.geo_id)));
  const multi = normalizeNwssSite([{ source: 'State_Territory', county_fips: '06075, 06081', pcr_target: 'fluav', pcr_target_avg_conc: '100', sample_collect_date: '2026-09-29' }], AT);
  assert.deepEqual(multi.map((r) => r.geo_id).sort(), ['06075', '06081']);
  assert.equal(multi[0].week_ending, '2026-10-03');
});

test('Delphi fluview: epiweeks become MMWR Saturdays', () => {
  const rows = normalizeDelphiFluview(fixture('delphi-fluview'), AT);
  assert.deepEqual(rows.map((r) => r.week_ending), ['2026-09-12', '2026-09-19', '2026-09-26']);
  assert.equal(epiweekToSaturday(202601), '2026-01-10');
  assert.equal(epiweekToSaturday(202553), '2026-01-03');
  assert.equal(epiweek(new Date('2026-09-26T00:00:00Z')), '202638');
  assert.equal(epiweek(new Date('2026-01-01T00:00:00Z')), '202553');
  assert.equal(weekEndingSaturday('2026-09-27'), '2026-10-03');
});

test('county names resolve within their state, tolerant of punctuation', () => {
  assert.equal(countyFipsByName('06', 'San Diego'), '06073');
  assert.equal(countyFipsByName('29', 'St. Louis'), countyFipsByName('29', 'Saint Louis'));
  assert.equal(countyFipsByName('06', 'Nowhere'), null);
});

// --- Pull gating and independence ----------------------------------------- //

test('a pull that is thin, malformed or failing contributes nothing', async () => {
  const def = sourceDefs(NOW).find((d) => d.key === 'nssp_ed');
  const thin = await runSource(def, { fetchImpl: async () => Response.json(fixture('vutn-jzwm')), now: NOW });
  assert.equal(thin.ok, false);
  assert.match(thin.reason, /minimum 40/);
  const down = await runSource(def, { fetchImpl: async () => new Response('busy', { status: 503 }), now: NOW });
  assert.deepEqual([down.ok, down.rows.length, down.reason], [false, 0, 'HTTP 503']);
  const junk = await runSource(def, { fetchImpl: async () => Response.json({ error: true }), now: NOW });
  assert.equal(junk.ok, false);
  const thrown = await runSource(def, { fetchImpl: async () => { throw new Error('reset'); }, now: NOW });
  assert.equal(thrown.ok, false);
});

test('flagged sources are off by default and on with their flag', () => {
  const keys = (env) => sourceDefs(NOW, env).map((d) => d.key);
  assert.ok(!keys({}).includes('nwss_site') && !keys({}).includes('delphi_ili'));
  assert.ok(keys({ NWSS_SITE: 'true' }).includes('nwss_site'));
  const delphi = sourceDefs(NOW, { DELPHI_FLUVIEW: 'true', DELPHI_API_KEY: 'k' }).find((d) => d.key === 'delphi_ili');
  assert.match(delphi.url, /api_key=k/);
  assert.match(delphi.url, /regions=al%2Cak/);
});

test('the SODA app token is sent when configured', async () => {
  let headers;
  const def = sourceDefs(NOW).find((d) => d.key === 'nssp_ari');
  await runSource(def, { env: { SODA_APP_TOKEN: 'tok' }, fetchImpl: async (u, init) => ((headers = init.headers), Response.json(fixture('f3zz-zga5'))), now: NOW });
  assert.equal(headers['X-App-Token'], 'tok');
});

// --- D1 last-good + KV documents ------------------------------------------- //

const stateRows = (week, value) =>
  ['CA', 'NY'].map((geo) => ({ source: 'nhsn_levels', geo_level: 'state', geo_id: geo, pathogen: 'influenza', metric: 'admissions_per_100k', value, level_label: 'Low', week_ending: week, fetched_at: AT, method_version: null }));

test('upserts are idempotent and only rewrite changed rows; literals are escaped', async () => {
  const db = d1();
  await upsertOfficial(db, stateRows('2026-09-26', 1.1));
  await upsertOfficial(db, stateRows('2026-09-26', 1.1));
  assert.equal(db.q('SELECT COUNT(*) AS n FROM official_snapshots')[0].n, 2);
  await upsertOfficial(db, stateRows('2026-09-26', 1.4));
  assert.equal(db.q("SELECT value FROM official_snapshots WHERE geo_id = 'CA'")[0].value, 1.4);
  assert.equal(sqlLiteral("O'Brien"), "'O''Brien'");
  assert.equal(sqlLiteral(NaN), 'NULL');
  assert.equal(upsertStatements(new Array(600).fill(stateRows('2026-09-26', 1)[0])).length, 3);
});

test('last-good retention: a failed pull leaves the previous week in D1 and in the KV document', async () => {
  const env = { DB: d1(), OFFICIAL_CACHE: kv() };
  await upsertOfficial(env.DB, stateRows('2026-09-26', 1.1));
  // Every source fails this run.
  const summary = await runIngest(env, { fetchImpl: async () => new Response('down', { status: 500 }), now: NOW });
  assert.ok(Object.values(summary.sources).every((s) => !s.ok));
  assert.equal(summary.rows, 0);
  assert.equal(env.DB.q('SELECT COUNT(*) AS n FROM official_snapshots')[0].n, 2, 'nothing deleted or overwritten');
  const doc = JSON.parse(env.OFFICIAL_CACHE.store.get('official:state:CA'));
  assert.equal(doc.sources.nhsn_levels.week_ending, '2026-09-26');
  assert.equal(env.OFFICIAL_CACHE.ttl.get('official:state:CA'), OFFICIAL_TTL_SECONDS);
  assert.ok(JSON.parse(env.OFFICIAL_CACHE.store.get('ingest:last')).finished_at);
});

test('KV documents: latest week readings plus a series that never crosses the WVAL method change', () => {
  const r = (week, value) => ({ source: 'nwss_wval', geo_level: 'county', geo_id: '06001', pathogen: 'influenza', metric: 'wval', value, level_label: 'Low', week_ending: week, fetched_at: AT, method_version: wvalMethodVersion(week) });
  const doc = docFromRows('county', '06001', [r('2026-08-01', 9), r('2026-08-08', 8), r('2026-08-22', 3), r('2026-08-29', 4)], NOW);
  const entry = doc.sources.nwss_wval;
  assert.equal(entry.week_ending, '2026-08-29');
  assert.deepEqual(entry.series['influenza:wval'].map((p) => p.week_ending), ['2026-08-22', '2026-08-29']);
});

test('merging never rolls a source back to an older week, and keeps sources a pull lacked', () => {
  const stored = { sources: { a: { week_ending: '2026-09-26', v: 1 }, b: { week_ending: '2026-09-26', v: 2 } } };
  const fresh = { updated_at: 'x', sources: { a: { week_ending: '2026-09-19', v: 9 }, c: { week_ending: '2026-09-26', v: 3 } } };
  const merged = mergeDocs(stored, fresh);
  assert.equal(merged.sources.a.v, 1);
  assert.equal(merged.sources.b.v, 2);
  assert.equal(merged.sources.c.v, 3);
});

test('per-state KV rebuild writes the state and its counties from D1', async () => {
  const env = { DB: d1(), OFFICIAL_CACHE: kv() };
  await upsertOfficial(env.DB, [...stateRows('2026-09-26', 1), ...normalizeNwssWval(fixture('atcp-73re'), AT)]);
  const written = await writeKvForStates(env, ['CA'], NOW);
  assert.ok(written > 10);
  assert.ok(env.OFFICIAL_CACHE.store.has('official:state:CA'));
  assert.ok(env.OFFICIAL_CACHE.store.has('official:county:06001'));
  assert.ok(!env.OFFICIAL_CACHE.store.has('official:state:NY'), 'only the requested state');
  assert.ok(env.OFFICIAL_CACHE.ops < 1000, 'one state stays far under the KV per-invocation cap');
  const rows = await loadOfficialRows(env.DB, ['CA'], NOW);
  assert.equal(docsFromRows(rows, NOW).size, 1);
});

// --- Worker HTTP surface ---------------------------------------------------- //

test('manual endpoints require the INGEST_TOKEN bearer token', async () => {
  const env = { INGEST_TOKEN: 'secret', OFFICIAL_CACHE: kv() };
  const post = (path, auth) => new Request(`https://flutrack-ingest.example/${path}`, { method: 'POST', headers: auth ? { Authorization: `Bearer ${auth}` } : {} });
  assert.equal((await worker.fetch(post('__ingest'), env)).status, 401);
  assert.equal((await worker.fetch(post('__ingest', 'wrong'), env)).status, 401);
  assert.equal(await authorized(post('__ingest', 'secret'), env), true);
  assert.equal(await authorized(post('__ingest', 'secret'), {}), false, 'no token configured → locked');
  const health = await worker.fetch(new Request('https://flutrack-ingest.example/health'), env);
  assert.equal(health.status, 200);
});

test('crons dispatch: pulls on Wed/Fri 18:00, maintenance at 08:00', async () => {
  const seen = [];
  const ctx = { waitUntil: (p) => seen.push(p) };
  await worker.scheduled({ cron: '0 8 * * *' }, { OFFICIAL_CACHE: kv() }, ctx);
  await worker.scheduled({ cron: '17 3 * * *' }, {}, ctx);
  assert.equal(seen.length, 1, 'unknown crons do nothing');
  await Promise.all(seen);
});

// --- Daily maintenance ----------------------------------------------------- //

function insertReport(db, o) {
  const r = { id: crypto.randomUUID(), created_day: '2026-10-08', iso_week: '2026-W41', state: 'CA', county_fips: '06073', zip3: null, feeling: 'sick', ili: 1, test_type: 'none', test_result: null, ip_hash: 'h', quarantined: 0, ...o };
  db.raw
    .prepare('INSERT INTO reports (id, created_day, iso_week, state, county_fips, zip3, feeling, ili, test_type, test_result, ip_hash, quarantined) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(r.id, r.created_day, r.iso_week, r.state, r.county_fips, r.zip3, r.feeling, r.ili, r.test_type, r.test_result, r.ip_hash, r.quarantined);
}

test('purge deletes raw reports older than 90 days and keeps aggregates', async () => {
  const db = d1();
  insertReport(db, { created_day: '2026-07-01' });
  insertReport(db, { created_day: '2026-10-01' });
  db.raw.prepare("INSERT INTO report_aggregates_daily VALUES ('2026-07-01','06073','CA',1,1,1,0,0)").run();
  assert.equal(await purgeOldReports(db, NOW), 1);
  assert.equal(db.q('SELECT COUNT(*) AS n FROM reports')[0].n, 1);
  assert.equal(db.q('SELECT COUNT(*) AS n FROM report_aggregates_daily')[0].n, 1);
});

test('aggregates exclude quarantined reports and count self-reported positives', async () => {
  const db = d1();
  insertReport(db, { test_type: 'home_combo', test_result: 'positive_both', ip_hash: 'a' });
  insertReport(db, { feeling: 'fine', ili: 0, ip_hash: 'b' });
  insertReport(db, { quarantined: 1, ip_hash: 'c' });
  await rebuildAggregates(db, NOW);
  assert.deepEqual(db.q('SELECT n, n_sick, n_ili, n_pos_flu, n_pos_covid FROM report_aggregates_daily')[0], { n: 2, n_sick: 1, n_ili: 1, n_pos_flu: 1, n_pos_covid: 1 });
});

test('anomaly checks quarantine a county-day burst and an over-limit hash', async () => {
  const db = d1();
  for (let i = 0; i < 12; i += 1) insertReport(db, { created_day: '2026-10-09', ip_hash: `h${i}` });
  for (let i = 0; i < 6; i += 1) insertReport(db, { created_day: '2026-10-09', county_fips: '06001', ip_hash: 'same' });
  const q = await quarantineAnomalies(db, NOW);
  assert.ok(q >= 18);
  assert.equal(db.q("SELECT COUNT(*) AS n FROM reports WHERE quarantined = 0")[0].n, 0);
  const summary = await dailyMaintenance({ DB: db, OFFICIAL_CACHE: kv() }, NOW);
  assert.equal(summary.aggregates, 'rebuilt');
});
