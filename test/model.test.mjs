import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeModel } from '../src/scripts/model.js';
import { levelLabel } from '../src/scripts/threat-index.js';

// computeModel's series picker is the interesting part: it prefers the first
// candidate that carries at least two finite values (enough to draw a trend
// and a sparkline), and only then falls back to "any non-empty array".

test('computeModel defaults to no data for an empty signal bundle', () => {
  const model = computeModel();
  assert.equal(model.level, null);
  assert.equal(model.label, 'No data');
  assert.deepEqual(model._series, []);
});

test('computeModel prefers the ED series when it is dense enough', () => {
  const ed = [1, 2, 3, 4];
  const model = computeModel({ edCombinedSeries: ed, wastewaterSeries: [9, 9, 9, 9] });
  assert.deepEqual(model._series, ed);
});

test('computeModel falls through to wastewater when ED is too sparse', () => {
  const ww = [4, 5, 6, 7];
  const model = computeModel({ edCombinedSeries: [3], wastewaterSeries: ww });
  assert.deepEqual(model._series, ww, 'a single ED point cannot carry a series');
});

test('computeModel falls through when the preferred series is all non-finite', () => {
  const ww = [4, 5, 6, 7];
  const model = computeModel({ edCombinedSeries: [null, undefined, NaN], wastewaterSeries: ww });
  assert.deepEqual(model._series, ww);
});

test('computeModel uses the first series that has two finite values', () => {
  const ed = [1, null, 3];
  const model = computeModel({ edCombinedSeries: ed, wastewaterSeries: [7] });
  assert.deepEqual(model._series, ed, 'two finite values is the threshold, holes are fine');
});

test('computeModel still shows a lone-value series when nothing better exists', () => {
  const model = computeModel({ edCombinedSeries: [3], wastewaterSeries: [] });
  assert.deepEqual(model._series, [3], 'a short series beats no sparkline at all');
});

test('computeModel yields an empty series when no array is offered', () => {
  const model = computeModel({ edCombinedSeries: [], wastewaterSeries: [] });
  assert.deepEqual(model._series, []);
});

test('computeModel attaches a series to every pathogen present in the model', () => {
  const model = computeModel({
    pathogens: {
      covid: { edPercentSeries: [1, 2, 3], positivitySeries: [5, 6, 7] },
      rsv: { edPercentSeries: [0.1, 0.2, 0.3] },
    },
  });
  assert.deepEqual(model.pathogens.covid._series, [1, 2, 3], 'ED is preferred over positivity');
  assert.deepEqual(model.pathogens.rsv._series, [0.1, 0.2, 0.3]);
  assert.deepEqual(model.pathogens.influenza._series, [], 'a pathogen with no signals gets an empty series');
});

test('computeModel falls back through a pathogen to positivity', () => {
  const model = computeModel({ pathogens: { covid: { positivitySeries: [8, 9, 10] } } });
  assert.deepEqual(model.pathogens.covid._series, [8, 9, 10]);
});

test('computeModel tolerates a pathogen block that is not an object', () => {
  const model = computeModel({ pathogens: { covid: null, rsv: undefined } });
  assert.equal(model.pathogens.covid._series.length, 0);
  assert.equal(model.pathogens.rsv._series.length, 0);
});

test('computeModel ignores pathogen keys the model does not track', () => {
  const model = computeModel({ pathogens: { mumps: { edPercentSeries: [1, 2, 3] } } });
  assert.equal(model.pathogens.mumps, undefined, 'only influenza/covid/rsv are scored');
});

test('computeModel leaves the threat-index verdict intact', () => {
  const model = computeModel({
    ariLevel: 3,
    edCombinedSeries: [4, 4.5, 5, 5.5],
    wastewaterSeries: [3, 4, 5, 6],
    positivityCombined: 12,
  });
  assert.ok(model.level >= 0 && model.level <= 4);
  assert.equal(model.label, levelLabel(model.level));
  assert.ok(Array.isArray(model.contributors));
});
