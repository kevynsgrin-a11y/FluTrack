import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nationalSignals } from '../src/scripts/aggregate.js';
import { computeModel } from '../src/scripts/model.js';
import { states } from '../src/scripts/states-data.js';

// A minimal well-formed state bundle, so each test can override just the field
// it is about instead of restating the whole shape.
const bundle = (over = {}) => ({
  ariLevel: 2,
  edCombinedSeries: [1, 2, 3],
  wastewaterSeries: [4, 5, 6],
  positivityCombined: 10,
  weekEnding: '2026-07-11',
  pathogens: {},
  ...over,
});

test('national rollup averages the scalar signals across states', () => {
  const nat = nationalSignals([bundle({ ariLevel: 1, positivityCombined: 10 }), bundle({ ariLevel: 2, positivityCombined: 12 })]);
  assert.equal(nat.positivityCombined, 11);
  assert.equal(nat.ariLevel, 2, 'a 1.5 mean ARI level rounds up to 2');
});

test('national rollup rounds ARI to an integer level', () => {
  const nat = nationalSignals([bundle({ ariLevel: 1 }), bundle({ ariLevel: 2 })]);
  assert.equal(nat.ariLevel, 2);
  assert.ok(Number.isInteger(nat.ariLevel));
});

test('national rollup rounds positivity to two decimals', () => {
  const nat = nationalSignals([bundle({ positivityCombined: 10 }), bundle({ positivityCombined: 11.005 })]);
  assert.equal(nat.positivityCombined, 10.5, 'the 10.5025 mean rounds to two decimals');
});

test('national rollup averages composite series element-wise', () => {
  const nat = nationalSignals([bundle({ edCombinedSeries: [1, 2, 3] }), bundle({ edCombinedSeries: [3, 4, 5] })]);
  assert.deepEqual(nat.edCombinedSeries, [2, 3, 4]);
});

test('national rollup averages pathogen series too', () => {
  const nat = nationalSignals([
    bundle({ pathogens: { covid: { edPercentSeries: [1, 2] } } }),
    bundle({ pathogens: { covid: { edPercentSeries: [3, 4] } } }),
  ]);
  assert.deepEqual(nat.pathogens.covid.edPercentSeries, [2, 3]);
});

test('national rollup always returns a bundle for all three pathogens', () => {
  const nat = nationalSignals([bundle()]);
  for (const key of ['influenza', 'covid', 'rsv']) {
    assert.ok(nat.pathogens[key], `${key} present`);
    assert.deepEqual(nat.pathogens[key].edPercentSeries, [], `${key} ed series empty`);
    assert.deepEqual(nat.pathogens[key].wastewaterSeries, [], `${key} wastewater empty`);
    assert.deepEqual(nat.pathogens[key].positivitySeries, [], `${key} positivity empty`);
  }
});

test('national rollup ignores missing and non-array series when averaging', () => {
  const nat = nationalSignals([bundle({ edCombinedSeries: [] }), bundle({ edCombinedSeries: [1, 2] })]);
  assert.deepEqual(nat.edCombinedSeries, [1, 2], 'empty arrays do not drag the mean to NaN');
});

test('national rollup skips non-finite values rather than poisoning the mean', () => {
  const nat = nationalSignals([bundle({ edCombinedSeries: [1, null] }), bundle({ edCombinedSeries: [3, 3] })]);
  assert.deepEqual(nat.edCombinedSeries, [2, 3], 'the null hole is dropped, the remaining value still averages');
});

test('national rollup aligns ragged series on their tail, not their head', () => {
  const nat = nationalSignals([bundle({ edCombinedSeries: [2, 4] }), bundle({ edCombinedSeries: [1, 2, 3, 4] })]);
  assert.equal(nat.edCombinedSeries.length, 4);
  assert.equal(nat.edCombinedSeries.at(-1), 4);
});

test('national rollup reports a null ARI level when no state supplies one', () => {
  const nat = nationalSignals([bundle({ ariLevel: null }), bundle({ ariLevel: undefined })]);
  assert.equal(nat.ariLevel, null);
});

test('national rollup reports NaN positivity when no state supplies one', () => {
  const nat = nationalSignals([bundle({ positivityCombined: null }), bundle({ positivityCombined: null })]);
  assert.ok(Number.isNaN(nat.positivityCombined), 'NaN marks "no national positivity" for the scorer to skip');
});

test('national rollup skips null/undefined entries in the list', () => {
  const nat = nationalSignals([null, bundle({ positivityCombined: 10 }), undefined]);
  assert.equal(nat.positivityCombined, 10);
});

test('national rollup on an empty list is a well-formed empty bundle', () => {
  const nat = nationalSignals([]);
  assert.equal(nat.ariLevel, null);
  assert.deepEqual(nat.edCombinedSeries, []);
  assert.deepEqual(nat.wastewaterSeries, []);
  assert.ok(Number.isNaN(nat.positivityCombined));
  assert.equal(nat.weekEnding, undefined);
  for (const key of ['influenza', 'covid', 'rsv']) assert.deepEqual(nat.pathogens[key].edPercentSeries, []);
});

test('national rollup takes the latest week across states, not the first', () => {
  const nat = nationalSignals([bundle({ weekEnding: '2026-07-11' }), bundle({ weekEnding: '2026-07-04' })]);
  assert.equal(nat.weekEnding, '2026-07-11');
});

test('national rollup falls back to the first state when no weekEnding is set', () => {
  const nat = nationalSignals([bundle({ weekEnding: undefined }), bundle({ weekEnding: null })]);
  assert.equal(nat.weekEnding, undefined);
});

// Live fixtures retain dates and jurisdiction identities; sample tests above
// intentionally cover the existing deterministic, positional sample behavior.
const WEEKS = ['2026-09-12', '2026-09-19', '2026-09-26'];
const liveMetric = (values, over = {}) => ({
  status: 'available', contributes: true, source: 'NSSP Emergency Department Visits',
  observationPeriod: { weekEnding: WEEKS.at(-1) },
  observations: values.map((value, index) => ({ weekEnding: WEEKS[WEEKS.length - values.length + index], value })),
  ...over,
});
const liveBundle = (abbr, values = [1, 1, 2], over = {}) => ({
  weekEnding: WEEKS.at(-1), ariLevel: null, edCombinedSeries: values,
  wastewaterSeries: [], positivityCombined: null, pathogens: {},
  provenance: { kind: 'live', geography: { level: 'state', abbr }, metrics: { edVisits: liveMetric(values) } },
  ...over,
});

const cohort = (n = 25) => states.slice(0, n).map((state) => liveBundle(state.abbr));

test('live missing pathogens cannot inherit combined ED or wastewater signals', () => {
  const nat = nationalSignals(cohort());
  assert.equal(nat.provenance.status, 'available');
  for (const pathogen of ['influenza', 'covid', 'rsv']) {
    assert.deepEqual(nat.pathogens[pathogen].edPercentSeries, []);
    assert.deepEqual(nat.pathogens[pathogen].wastewaterSeries, []);
    assert.equal(nat.pathogens[pathogen].provenance.status, 'missing');
    assert.equal(computeModel(nat).pathogens[pathogen].level, null);
  }
});

test('available COVID observations retain their own status and coverage when the combined ED share is missing', () => {
  const list = cohort().map((signal) => ({ ...signal, ariLevel: 0, edCombinedSeries: [],
    provenance: { ...signal.provenance, metrics: {
      edVisits: { status: 'missing', contributes: false, observations: [] },
      ari: liveMetric([0], { source: 'NSSP ARI', publicationDate: null, retrievedAt: '2026-10-09T00:11:26Z' }),
    } },
    pathogens: { covid: { edPercentSeries: [0.1, 0.2, 0.3], wastewaterSeries: [], positivitySeries: [],
      provenance: { kind: 'live', metrics: { edVisits: liveMetric([0.1, 0.2, 0.3], { publicationDate: '2026-10-02', retrievedAt: '2026-10-09T00:11:22Z' }) } } } },
  }));
  const nat = nationalSignals(list);
  const metric = nat.pathogens.covid.provenance.metrics.edVisits;
  assert.deepEqual(nat.pathogens.covid.edPercentSeries, [0.1, 0.2, 0.3]);
  assert.equal(nat.provenance.metrics.edVisits.status, 'missing');
  assert.equal(metric.status, 'available');
  assert.equal(metric.coverage.contributingJurisdictions, 25);
  assert.equal(metric.observationPeriod.weekEnding, '2026-09-26');
  assert.deepEqual(metric.publicationDates, ['2026-10-02']);
  assert.equal(metric.retrievedAt, '2026-10-09T00:11:22Z');
  assert.deepEqual(computeModel(nat).pathogens.covid.contributors, ['edVisits']);
});

test('equal contributor counts with different states cannot establish a comparable aggregate trend', () => {
  const base = cohort(24);
  // Metadata, rather than numeric leftovers, identifies the observation gap.
  const oldState = liveBundle(states[24].abbr, [1, 1, 1], { provenance: { kind: 'live', geography: { abbr: states[24].abbr }, metrics: { edVisits: liveMetric([1, 1, null]) } } });
  const newState = liveBundle(states[25].abbr, [3, 3, 3], { provenance: { kind: 'live', geography: { abbr: states[25].abbr }, metrics: { edVisits: liveMetric([null, null, 3]) } } });
  const nat = nationalSignals([...base, oldState, newState]);
  const metric = nat.provenance.metrics.edVisits;
  assert.deepEqual(metric.observations.map((observation) => observation.contributingJurisdictions), [25, 25, 25]);
  assert.notDeepEqual(metric.observations[0].contributingAbbrs, metric.observations.at(-1).contributingAbbrs);
  assert.equal(metric.comparableHistory, false);
  assert.equal(nat.provenance.coverage.contributingJurisdictions, 25);
  assert.equal(computeModel(nat).trend.direction, 'unknown');
});

test('live histories align by actual observation dates rather than array positions', () => {
  const list = cohort();
  list[0] = liveBundle(states[0].abbr, [10, 30], { provenance: { kind: 'live', geography: { abbr: states[0].abbr }, metrics: { edVisits: liveMetric([10, 30], {
    observations: [{ weekEnding: '2026-09-12', value: 10 }, { weekEnding: '2026-09-26', value: 30 }],
  }) } } });
  const nat = nationalSignals(list);
  assert.deepEqual(nat.edCombinedSeries, [1.36, 1, 3.12]);
  assert.deepEqual(nat.provenance.metrics.edVisits.observations.map((observation) => observation.contributingJurisdictions), [25, 24, 25]);
  assert.equal(nat.provenance.metrics.edVisits.comparableHistory, false);
});

test('different current state periods cannot manufacture a 25-state latest-period cohort', () => {
  const list = cohort();
  list[0] = { ...list[0], weekEnding: '2026-09-19' };
  const nat = nationalSignals(list);
  assert.equal(nat.weekEnding, '2026-09-26');
  assert.equal(nat.provenance.coverage.contributingJurisdictions, 24);
  assert.equal(nat.provenance.status, 'missing');
  assert.equal(computeModel(nat).level, null);
});

test('a single-state pathogen increase cannot become a U.S. pathogen reading', () => {
  const list = cohort();
  list[0].pathogens.covid = { edPercentSeries: [0.1, 0.2, 3], wastewaterSeries: [], positivitySeries: [], provenance: { kind: 'live', metrics: { edVisits: liveMetric([0.1, 0.2, 3]) } } };
  const nat = nationalSignals(list);
  assert.equal(nat.provenance.status, 'available');
  assert.equal(nat.pathogens.covid.provenance.coverage.contributingJurisdictions, 1);
  assert.equal(nat.pathogens.covid.provenance.status, 'missing');
  const model = computeModel(nat);
  assert.equal(model.pathogens.covid.level, null);
  assert.equal(model.pathogens.covid.trend.direction, 'unknown');
});

test('legacy live snapshot context permits a dated current value but never invents dates for its history', () => {
  const list = states.slice(0, 25).map((state) => bundle({ abbr: state.abbr, weekEnding: '2026-09-26' }));
  const nat = nationalSignals(list, { kind: 'live' });
  assert.equal(nat.provenance.kind, 'live');
  assert.deepEqual(nat.edCombinedSeries, [3]);
  assert.equal(nat.provenance.metrics.edVisits.observations.length, 1);
  assert.equal(nat.provenance.metrics.edVisits.comparableHistory, false);
  assert.equal(computeModel(nat).trend.direction, 'unknown');
});

test('duplicate jurisdiction readings cannot satisfy the national coverage guard', () => {
  const nat = nationalSignals(Array.from({ length: 25 }, () => liveBundle('CA')));
  assert.equal(nat.provenance.coverage.contributingJurisdictions, 1);
  assert.equal(nat.provenance.status, 'missing');
});

test('sample observations cannot fill gaps in a live aggregate cohort', () => {
  const list = cohort(24);
  list.push({ ...liveBundle(states[24].abbr), provenance: { kind: 'sample', geography: { abbr: states[24].abbr } } });
  const nat = nationalSignals(list, { kind: 'live' });
  assert.equal(nat.provenance.kind, 'live');
  assert.equal(nat.provenance.coverage.contributingJurisdictions, 24);
  assert.equal(nat.provenance.status, 'missing');
});

test('explicit unknown observations cannot fill live coverage or choose its observation period', () => {
  const list = cohort(24);
  const unknown = liveBundle(states[24].abbr, [8, 9, 10]);
  unknown.weekEnding = '2026-10-03';
  unknown.provenance.kind = 'unknown';
  const nat = nationalSignals([...list, unknown], { kind: 'live' });
  assert.equal(nat.weekEnding, '2026-09-26');
  assert.equal(nat.provenance.coverage.contributingJurisdictions, 24);
  assert.equal(nat.provenance.status, 'missing');
  assert.deepEqual(nat.edCombinedSeries, [1, 1, 2]);
  assert.equal(computeModel(nat).level, null);
});

test('explicit unknown pathogen observations cannot be promoted by verified live state provenance', () => {
  const list = cohort();
  for (const signal of list) signal.pathogens.covid = {
    edPercentSeries: [0.1, 0.2, 3], wastewaterSeries: [], positivitySeries: [],
    provenance: { kind: 'unknown', metrics: { edVisits: liveMetric([0.1, 0.2, 3]) } },
  };
  const nat = nationalSignals(list, { kind: 'live' });
  assert.equal(nat.provenance.status, 'available');
  assert.equal(nat.pathogens.covid.provenance.coverage.contributingJurisdictions, 0);
  assert.equal(nat.pathogens.covid.provenance.status, 'missing');
  assert.deepEqual(nat.pathogens.covid.edPercentSeries, []);
  assert.equal(computeModel(nat).pathogens.covid.level, null);
});
