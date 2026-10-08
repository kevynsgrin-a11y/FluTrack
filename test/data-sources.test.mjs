import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  excludeNonCommercial,
  DATASETS,
  parseEdRows,
  parseAriRows,
  parseWastewaterRows,
  assembleLiveSignals,
  fetchLiveSignals,
  hasSignalData,
  LIVE_WEEKS,
  MIN_LIVE_STATES,
  shouldRefreshLive,
  BROWSER_REFRESH_AFTER_DAYS,
  MIN_WASTEWATER_SITES,
  STALE_RUN_REPORTS,
} from '../src/scripts/data-sources.js';
import { states } from '../src/scripts/states-data.js';

// The WastewaterSCAN (CC BY-NC 4.0) exclusion is a licensing kill-criterion:
// a monetized site must never surface non-commercially-licensed rows.
const provFields = DATASETS.wastewater.fields.provenance;

test('excludeNonCommercial drops WastewaterSCAN / SCAN / Verily rows', () => {
  const rows = [
    { state: 'CA', wval: 5, data_source: 'NWSS' },
    { state: 'CA', wval: 6, data_source: 'WastewaterSCAN' },
    { state: 'TX', wval: 4, source: 'SCAN' },
    { state: 'NY', wval: 3, provider: 'Verily' },
    { state: 'WA', wval: 7, reporting_source: 'Stanford/Emory' },
    { state: 'FL', wval: 2, source: 'CDC NWSS' },
  ];
  const kept = excludeNonCommercial(rows, provFields);
  const states = kept.map((r) => r.state);
  assert.deepEqual(states, ['CA', 'FL'], 'only public-domain NWSS rows survive');
});

test('excludeNonCommercial keeps rows with no provenance field', () => {
  const rows = [{ state: 'OH', wval: 5 }];
  assert.equal(excludeNonCommercial(rows, provFields).length, 1);
});

test('excludeNonCommercial is case-insensitive', () => {
  const rows = [{ state: 'CA', wval: 5, source: 'wastewaterscan' }];
  assert.equal(excludeNonCommercial(rows, provFields).length, 0);
});

test('dataset registry only points at public-domain CDC resources', () => {
  for (const ds of Object.values(DATASETS)) {
    assert.match(ds.license, /Public Domain/i);
    assert.ok(ds.id && /^[a-z0-9]{4}-[a-z0-9]{4}$/.test(ds.id), `resource id looks valid: ${ds.id}`);
  }
});

// --- Live adapters against the shapes CDC actually publishes --------------- //
// Fixture rows below copy the exact column names and value formats served by
// data.cdc.gov (and the ingest worker's warm copies) in October 2026. The
// previous adapters expected columns none of these datasets carry, so every
// live refresh parsed to nothing; these tests pin the real contract.


/** Saturday week-ending dates, oldest → newest, ending 2026-09-26. */
function weeksEnding(last, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(`${last}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
const WEEKS = weeksEnding('2026-09-26', 14);

/** NSSP ED rows: long format, one row per geography × week × pathogen. */
function edRows(geographies, weeks = WEEKS) {
  const rows = [];
  geographies.forEach((geography, gi) => {
    weeks.forEach((w, wi) => {
      rows.push({ week_end: `${w}T00:00:00.000`, pathogen: 'COVID-19', geography, percent_visits: (0.4 + gi * 0.01).toFixed(1) });
      rows.push({ week_end: `${w}T00:00:00.000`, pathogen: 'Influenza', geography, percent_visits: (0.1 + wi * 0.05).toFixed(2) });
      rows.push({ week_end: `${w}T00:00:00.000`, pathogen: 'RSV', geography, percent_visits: '0.0' });
    });
  });
  return rows;
}

test('parseEdRows pivots the long-format NSSP rows and derives combined = sum of the three', () => {
  const byState = parseEdRows([
    ...edRows(['Maryland']),
    { week_end: '2026-09-26T00:00:00.000', pathogen: 'Influenza', geography: 'United States', percent_visits: '0.3' },
  ]);
  assert.deepEqual([...byState.keys()], ['MD'], 'national row is not mistaken for a state');
  const md = byState.get('MD');
  assert.equal(md.length, WEEKS.length);
  assert.equal(md.at(-1).week, '2026-09-26');
  assert.equal(md.at(-1).covid, 0.4);
  assert.equal(md.at(-1).rsv, 0);
  assert.equal(md.at(-1).combined, Math.round((0.4 + md.at(-1).influenza + 0) * 100) / 100);
  assert.ok(md[0].week < md.at(-1).week, 'oldest first');
});

test('parseEdRows leaves combined unset when a pathogen is missing that week', () => {
  const md = parseEdRows([
    { week_end: '2026-09-26T00:00:00.000', pathogen: 'COVID-19', geography: 'Maryland', percent_visits: '0.4' },
    { week_end: '2026-09-26T00:00:00.000', pathogen: 'Influenza', geography: 'Maryland', percent_visits: '0.2' },
  ]).get('MD');
  assert.ok(Number.isNaN(md[0].combined));
});

test('parseEdRows still reads the wide percent_visits_<pathogen> shape', () => {
  const md = parseEdRows([
    { week_end: '2026-09-26', geography: 'MD', percent_visits_combined: '3.1', percent_visits_influenza: '1.0', percent_visits_covid: '1.5', percent_visits_rsv: '0.4' },
  ]).get('MD');
  assert.equal(md[0].combined, 3.1);
  assert.equal(md[0].influenza, 1);
});

test('parseAriRows reads the published `label` column, including Extremely High and Data Unavailable', () => {
  const byState = parseAriRows([
    { week_end: '2026-09-26T00:00:00.000', geography: 'Alabama', label: 'Low', buildnumber: '2026-10-02 16:03:50.980149' },
    { week_end: '2026-09-26T00:00:00.000', geography: 'Iowa', label: 'Data Unavailable', buildnumber: 'x' },
    { week_end: '2026-09-26T00:00:00.000', geography: 'Guam', label: 'Data Unavailable', buildnumber: 'x' },
    { week_end: '2026-09-26T00:00:00.000', geography: 'Texas', label: 'Extremely High', buildnumber: 'x' },
  ]);
  assert.equal(byState.get('AL')[0].level, 1);
  assert.equal(byState.get('IA')[0].level, null, 'unavailable is null, never a guessed level');
  assert.equal(byState.get('TX')[0].level, 4);
  assert.equal(byState.has('GU'), false, 'territories outside the 51 are skipped');
});

test('parseWastewaterRows takes the median across sites and drops non-commercial networks', () => {
  let n = 0; // every row is a different sampling site, as in the real feed
  const site = (source, pathogen_target, site_wval, state_territory = 'Maryland', week_end = '2026-09-26') => ({
    state_territory, counties_served: 'X', site: `ID:${(n += 1)}`, population_served: '1000', source,
    site_wval, site_wval_category: 'Low', date_included_in_wval: '2023-01-01', week_end, pathogen_target, date_updated: '2026-10-02 11:03',
  });
  const md = parseWastewaterRows([
    site('State_Territory', 'Influenza A virus', '1.0'),
    site('State_Territory', 'Influenza A virus', '2.0'),
    site('State_Territory', 'Influenza A virus', '20.44'), // one tiny sewershed spiking
    site('WastewaterSCAN', 'Influenza A virus', '99'),
    site('State_Territory, WastewaterSCAN', 'Influenza A virus', '99'),
    site('CDC_Verily', 'Influenza A virus', '99'),
    site('State_Territory', 'SARS-CoV-2', '3.0'),
    site('State_Territory', 'SARS-CoV-2', '4.0'),
    site('State_Territory', 'SARS-CoV-2', '5.0'),
    site('State_Territory', 'RSV', ''),
  ]).get('MD');
  assert.equal(md.length, 1);
  assert.equal(md[0].influenza, 2, 'median of the three public sites, not the 20.44 outlier or excluded 99s');
  assert.equal(md[0].covid, 4);
  assert.ok(Number.isNaN(md[0].rsv), 'a blank WVAL is not read as zero');
});

/** A real-shape NWSS row for one site and week. */
const wwRow = (state_territory, site, source, pathogen_target, site_wval, week_end) => ({
  state_territory, site, source, pathogen_target, site_wval, week_end,
  counties_served: 'X', population_served: '10000', site_wval_category: 'Low', date_included_in_wval: '2023-01-01', date_updated: '2026-10-02 11:03',
});
const W4 = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'];

test(`a state reading needs at least ${MIN_WASTEWATER_SITES} eligible sites`, () => {
  const two = W4.map((w, i) => [
    wwRow('Ohio', 'ID:1', 'State_Territory', 'SARS-CoV-2', String(2 + i * 0.3), w),
    wwRow('Ohio', 'ID:2', 'State_Territory', 'SARS-CoV-2', String(3 + i * 0.2), w),
  ]).flat();
  const oh = parseWastewaterRows(two).get('OH');
  assert.ok(oh.every((r) => Number.isNaN(r.covid)), 'two sites → no state reading');
  const three = [...two, ...W4.map((w, i) => wwRow('Ohio', 'ID:3', 'State_Territory', 'SARS-CoV-2', String(4 + i * 0.1), w))];
  assert.equal(parseWastewaterRows(three).get('OH').at(-1).covid, 3.6, 'three sites → median');
});

test('South Dakota as CDC published it (Oct 2026): two stuck small sites produce no reading', () => {
  // After the Verily / WastewaterSCAN exclusion SD had two eligible sites
  // (≈13.8k and 3k people), each repeating one value every week. They had set
  // the state's wastewater to "very high" and its composite to Moderate.
  const rows = W4.flatMap((w) => [
    wwRow('South Dakota', 'ID:2726', 'State_Territory', 'RSV', '14.63', w),
    wwRow('South Dakota', 'ID:2727', 'State_Territory', 'RSV', '13.3', w),
    wwRow('South Dakota', 'ID:2726', 'State_Territory', 'Influenza A virus', '9.26', w),
    wwRow('South Dakota', 'ID:2727', 'State_Territory', 'Influenza A virus', '17.04', w),
    wwRow('South Dakota', 'ID:1830', 'CDC_Verily', 'RSV', '1.0', w),
  ]);
  const sd = parseWastewaterRows(rows).get('SD') || [];
  assert.ok(sd.every((r) => Number.isNaN(r.rsv) && Number.isNaN(r.influenza)));
  const { signalsByAbbr } = assembleLiveSignals({ ww: parseWastewaterRows(rows) });
  assert.deepEqual(signalsByAbbr.get('SD').wastewaterSeries, [], 'no wastewater signal reaches the model');
});

test(`a site repeating one value above the floor for ${STALE_RUN_REPORTS}+ reports is dropped; floor repeats are kept`, () => {
  const rows = W4.flatMap((w, i) => [
    wwRow('Utah', 'ID:9', 'State_Territory', 'SARS-CoV-2', '9.26', w), // stuck
    wwRow('Utah', 'ID:1', 'State_Territory', 'SARS-CoV-2', String(2 + i), w),
    wwRow('Utah', 'ID:2', 'State_Territory', 'SARS-CoV-2', String(3 + i), w),
    wwRow('Utah', 'ID:3', 'State_Territory', 'SARS-CoV-2', '1.0', w), // at the floor: legitimate
  ]);
  const ut = parseWastewaterRows(rows).get('UT');
  // Without the stuck site, week 4 has 5, 6 and the floor 1.0 → median 5.
  assert.equal(ut.at(-1).covid, 5);
  // A site listed twice in one week counts once — neither an extra site nor a run.
  const dup = W4.slice(0, 2).flatMap((w, i) => [
    wwRow('Utah', 'ID:1', 'State_Territory', 'RSV', String(2 + i), w),
    wwRow('Utah', 'ID:1', 'State_Territory', 'RSV', String(2 + i), w),
    wwRow('Utah', 'ID:2', 'State_Territory', 'RSV', String(3 + i), w),
  ]);
  assert.ok(Number.isNaN(parseWastewaterRows(dup).get('UT').at(-1).rsv), 'two real sites, not three');
  // A value repeated only twice is not treated as stuck.
  const twice = W4.slice(0, 2).flatMap((w) => ['ID:1', 'ID:2', 'ID:3'].map((id) => wwRow('Utah', id, 'State_Territory', 'RSV', '4.5', w)));
  assert.equal(parseWastewaterRows(twice).get('UT').at(-1).rsv, 4.5);
});

test('assembleLiveSignals keeps the last LIVE_WEEKS weeks and takes the peak pathogen for wastewater', () => {
  const ed = parseEdRows(edRows(['Maryland']));
  const ari = parseAriRows([{ week_end: '2026-09-26T00:00:00.000', geography: 'Maryland', label: 'Very Low' }]);
  const ww = new Map([['MD', [{ week: '2026-09-26', influenza: 1.5, covid: 3.2, rsv: NaN }]]]);
  const { signalsByAbbr, weekEnding, statesWithData } = assembleLiveSignals({ ed, ari, ww });
  const md = signalsByAbbr.get('MD');
  assert.equal(weekEnding, '2026-09-26');
  assert.equal(statesWithData, 1);
  assert.equal(md.edCombinedSeries.length, LIVE_WEEKS);
  assert.equal(md.pathogens.influenza.edPercentSeries.length, LIVE_WEEKS);
  assert.deepEqual(md.wastewaterSeries, [3.2]);
  assert.deepEqual(md.pathogens.rsv.wastewaterSeries, [], 'NaN never reaches a series');
  assert.equal(md.ariLevel, 0);
  assert.equal(md.positivityCombined, null, 'no live positivity adapter — never invented');
  assert.equal(hasSignalData(signalsByAbbr.get('CA')), false, 'a state with no rows has no data');
  assert.doesNotThrow(() => JSON.stringify(md), 'bundle is JSON-serializable for the shipped snapshot');
});

// --- fetchLiveSignals end to end, with the network stubbed ----------------- //

function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const body = handler(String(url));
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body };
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

/** The ingest worker wraps rows: { api, data, fetchedAt, stale, ... }. */
const wrap = (data) => ({ api: 'cdc-socrata', data, fetchedAt: '2026-10-08T06:11:25.126Z', stale: false, ttlSeconds: 21600 });

test('fetchLiveSignals requests exactly the pre-warmed ingest queries', async () => {
  const { calls, restore } = stubFetch((url) =>
    wrap(url.includes('vutn-jzwm') ? edRows(states.map((s) => s.name)) : [])
  );
  try {
    await fetchLiveSignals();
  } finally {
    restore();
  }
  const base = 'https://ingest.oakandmain.dev/data/cdc-socrata/resource';
  assert.deepEqual(calls.sort(), [
    `${base}/atcp-73re.json?%24limit=60000&%24order=week_end+DESC`,
    `${base}/f3zz-zga5.json?%24limit=20000&%24order=week_end+DESC`,
    `${base}/vutn-jzwm.json?%24limit=60000&%24order=week_end+DESC`,
  ]);
});

test('fetchLiveSignals returns live data for all 51 jurisdictions and credits only contributing sources', async () => {
  const { restore } = stubFetch((url) => {
    if (url.includes('vutn-jzwm')) return wrap(edRows(states.map((s) => s.name)));
    if (url.includes('f3zz-zga5')) return wrap(states.map((s) => ({ week_end: '2026-09-26T00:00:00.000', geography: s.name, label: 'Very Low' })));
    return new Error('HTTP 503');
  });
  let live;
  try {
    live = await fetchLiveSignals();
  } finally {
    restore();
  }
  assert.equal(live.statesWithData, 51);
  assert.equal(live.weekEnding, '2026-09-26');
  assert.deepEqual(live.sources, ['NSSP Emergency Department Visits', 'Acute Respiratory Illness (ARI) Activity Level']);
});

test(`fetchLiveSignals refuses to call a thin response live (< ${MIN_LIVE_STATES} states)`, async () => {
  const few = states.slice(0, MIN_LIVE_STATES - 1).map((s) => s.name);
  const { restore } = stubFetch((url) => wrap(url.includes('vutn-jzwm') ? edRows(few) : []));
  try {
    await assert.rejects(fetchLiveSignals(), /only 24 of 51 states/);
  } finally {
    restore();
  }
});

test('fetchLiveSignals rejects an HTTP-200 response that parses to nothing', async () => {
  // The exact failure the old adapters produced against the real schemas.
  const { restore } = stubFetch(() => wrap([{ week_end: '2026-09-26', unexpected_column: 'x' }]));
  try {
    await assert.rejects(fetchLiveSignals());
  } finally {
    restore();
  }
});

// --- When the browser re-fetches ------------------------------------------- //


test('the browser skips the ~20 MB live fetch while the shipped live week is still the newest', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  assert.equal(shouldRefreshLive({ kind: 'live', weekEnding: '2026-09-26' }, now), false, '12 days: next CDC week not out yet');
  assert.equal(shouldRefreshLive({ kind: 'live', weekEnding: '2026-09-25' }, now), true, `>= ${BROWSER_REFRESH_AFTER_DAYS} days: a newer week may exist`);
  assert.equal(shouldRefreshLive({ kind: 'sample', weekEnding: '2026-10-02' }, now), true, 'sample data always tries live');
  assert.equal(shouldRefreshLive({ kind: 'live', weekEnding: '' }, now), true);
  assert.equal(shouldRefreshLive(null, now), true, 'no snapshot (offline first load) tries live');
});
