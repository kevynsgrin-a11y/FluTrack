import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLiveSignals, hasUsableSignal, MIN_LIVE_STATES } from '../src/scripts/data-sources.js';

// These fixtures use the REAL upstream column names, captured from the live
// datasets on 2026-10-08. They exist so that an upstream schema rename fails
// here instead of silently emptying every series while the badge still flips to
// "Live CDC data" — which is exactly what shipped between September and October.
//
//   vutn-jzwm  {week_end, pathogen, geography, percent_visits}   LONG, 3 pathogens, no combined column
//   f3zz-zga5  {week_end, geography, label, buildnumber}         level in `label`
//   atcp-73re  {state_territory, site, source, site_wval, week_end, pathogen_target, ...}  per-SITE

const WEEKS = ['2026-09-12', '2026-09-19', '2026-09-26'];
const NAMES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
  'District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky',
  'Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana',
  'Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota',
  'Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas',
  'Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

function rows(subset = NAMES) {
  const ed = [];
  for (const w of WEEKS) for (const g of subset)
    for (const [p, v] of [['Influenza', '0.40'], ['COVID-19', '1.10'], ['RSV', '0.20']])
      ed.push({ week_end: `${w}T00:00:00.000`, pathogen: p, geography: g, percent_visits: v });
  const ari = [];
  for (const w of WEEKS) for (const g of subset)
    ari.push({ week_end: `${w}T00:00:00.000`, geography: g, label: g === 'Florida' ? 'Very Low' : 'Low' });
  // A territory the site does not cover, and a label outside the numeric scale.
  ari.push({ week_end: '2026-09-26T00:00:00.000', geography: 'Guam', label: 'Data Unavailable' });
  const ww = [];
  for (const w of WEEKS) for (const g of subset) for (const [site, wval] of [['ID:1', '2.5'], ['ID:2', '7.5']])
    ww.push({ state_territory: g, site, source: 'State_Territory', site_wval: wval, week_end: w, pathogen_target: 'SARS-CoV-2' });
  return { ed, ari, ww };
}

function stubFetch({ subset, stale = false, empty = false } = {}) {
  const { ed, ari, ww } = rows(subset);
  globalThis.fetch = async (url) => {
    const data = empty ? [] : url.includes('vutn-jzwm') ? ed : url.includes('f3zz-zga5') ? ari : ww;
    return {
      ok: true,
      status: 200,
      json: async () => ({ api: 'cdc-socrata', data, fetchedAt: '2026-10-08T06:11:25.126Z', ageSeconds: 100, stale, ttlSeconds: 21600 }),
    };
  };
}

test('real upstream schemas yield usable values for every covered state', async () => {
  stubFetch();
  const live = await fetchLiveSignals({ timeoutMs: 5000 });
  const usable = [...live.signalsByAbbr.values()].filter(hasUsableSignal);
  assert.equal(usable.length, 51, 'all 51 jurisdictions resolve from the real column names');
  assert.equal(live.weekEnding, '2026-09-26');

  const fl = live.signalsByAbbr.get('FL');
  assert.equal(fl.ariLevel, 0, '"Very Low" in `label` maps to level 0');
  // No combined column upstream, so the combined ED share is the sum of the
  // three reported pathogen shares: 0.40 + 1.10 + 0.20.
  assert.deepEqual(fl.edCombinedSeries, [1.7, 1.7, 1.7]);
  // Per-site rows collapse to the weekly maximum across sewersheds.
  assert.deepEqual(fl.wastewaterSeries, [7.5, 7.5, 7.5]);
  // NREVSS is not queried by any code path, so positivity is genuinely absent.
  assert.equal(fl.positivityCombined, null);
});

test('per-pathogen ED series are pivoted out of the long format', async () => {
  stubFetch();
  const live = await fetchLiveSignals({ timeoutMs: 5000 });
  const fl = live.signalsByAbbr.get('FL');
  assert.deepEqual(fl.pathogens.influenza.edPercentSeries, [0.4, 0.4, 0.4]);
  assert.deepEqual(fl.pathogens.covid.edPercentSeries, [1.1, 1.1, 1.1]);
  assert.deepEqual(fl.pathogens.rsv.edPercentSeries, [0.2, 0.2, 0.2]);
});

test('a refresh that resolves but carries no values is refused, not relabelled', async () => {
  stubFetch({ empty: true });
  await assert.rejects(() => fetchLiveSignals({ timeoutMs: 5000 }), /rejected/);
});

test('a refresh below the state floor is refused', async () => {
  stubFetch({ subset: NAMES.slice(0, 10) });
  await assert.rejects(
    () => fetchLiveSignals({ timeoutMs: 5000 }),
    (e) => /only 10 of 51/.test(e.message) && new RegExp(`floor ${MIN_LIVE_STATES}`).test(e.message)
  );
});

test('a stale ingest envelope is not presented as live', async () => {
  stubFetch({ stale: true });
  await assert.rejects(() => fetchLiveSignals({ timeoutMs: 5000 }), /All CDC live sources failed/);
});

test('a wide-format revert upstream still works', async () => {
  globalThis.fetch = async (url) => {
    const data = url.includes('vutn-jzwm')
      ? NAMES.map((g) => ({ week_end: '2026-09-26T00:00:00.000', geography: g, percent_visits_combined: '3.3' }))
      : url.includes('f3zz-zga5')
        ? NAMES.map((g) => ({ week_end: '2026-09-26T00:00:00.000', geography: g, label: 'Low' }))
        : [];
    return { ok: true, status: 200, json: async () => ({ api: 'cdc-socrata', data, stale: false }) };
  };
  const live = await fetchLiveSignals({ timeoutMs: 5000 });
  assert.deepEqual(live.signalsByAbbr.get('FL').edCombinedSeries, [3.3]);
});
