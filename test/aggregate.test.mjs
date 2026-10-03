import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nationalSignals } from '../src/scripts/aggregate.js';

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
