import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeModel } from '../src/scripts/model.js';
import { levelLabel } from '../src/scripts/threat-index.js';
import { presentationModel, readingStatus } from '../src/scripts/reading-provenance.js';

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

test('computeModel names the measurement carrying each trend', () => {
  const model = computeModel({
    edCombinedSeries: [3], wastewaterSeries: [3, 4],
    pathogens: { covid: { edPercentSeries: [1, 2], wastewaterSeries: [8, 7] }, rsv: { positivitySeries: [1, 2] } },
  });
  assert.equal(model.trend.source, 'wastewater');
  assert.equal(model.pathogens.covid.trend.source, 'edVisits');
  assert.equal(model.pathogens.rsv.trend.source, 'positivity');
  assert.equal(model.pathogens.influenza.trend.source, null);
});

test('pathogen provenance does not borrow composite ARI metadata or coverage', () => {
  const model = computeModel({ ariLevel: 1, provenance: { kind: 'live', coverage: { usableJurisdictions: 50 }, metrics: { ari: { status: 'available', source: 'NSSP ARI' } } }, pathogens: { covid: { edPercentSeries: [1, 2], provenance: { metrics: { edVisits: { status: 'available', source: 'NSSP Emergency Department Visits' } } } } } });
  assert.equal(model.pathogens.covid.provenance.metrics.ari, undefined);
  assert.equal(model.pathogens.covid.provenance.coverage, undefined);
  assert.deepEqual(model.pathogens.covid.provenance.sources, ['NSSP Emergency Department Visits']);
  assert.deepEqual(model.pathogens.influenza.provenance.metrics, {});
});

test('unavailable, stale and different-period metrics cannot contribute numeric leftovers', () => {
  const model = computeModel({
    ariLevel: 0, edCombinedSeries: [8, 9], wastewaterSeries: [8, 9], positivityCombined: 30,
    provenance: { kind: 'live', metrics: {
      edVisits: { status: 'unavailable' }, wastewater: { status: 'available', contributes: false }, positivity: { status: 'stale' },
    } },
    pathogens: { influenza: { edPercentSeries: [8, 9], provenance: { metrics: { edVisits: { status: 'missing' } } } } },
  });
  assert.deepEqual(model.contributors, ['ari']);
  assert.equal(model.trend.direction, 'unknown', 'an ARI category alone has no numeric trend history');
  assert.equal(model.pathogens.influenza.level, null);
  assert.deepEqual(model.pathogens.influenza._series, []);
});

test('sample and observation provenance survive model assembly and do not invent source dates', () => {
  const source = { kind: 'sample', observationPeriod: { weekEnding: '2026-10-03' }, metrics: { edVisits: { publicationDate: null, retrievedAt: null } } };
  const model = computeModel({ edCombinedSeries: [1, 2], provenance: source }, { live: true, generatedAt: '2026-10-09T10:00:00Z' });
  assert.equal(model.provenance.kind, 'sample');
  assert.equal(model.provenance.live, false);
  assert.equal(model.provenance.weekEnding, '2026-10-03');
  assert.equal(model.provenance.metrics.edVisits.publicationDate, null);
  assert.equal(model.provenance.metrics.edVisits.retrievedAt, null);
  assert.equal(model.pathogens.covid.provenance.kind, 'sample');
});

test('insufficient aggregate coverage prevents a numeric national model and pathogen claims', () => {
  const model = computeModel({ edCombinedSeries: [8, 9], pathogens: { covid: { edPercentSeries: [3, 4] } }, provenance: { kind: 'live', status: 'missing', coverage: { usableJurisdictions: 1 } } });
  assert.equal(model.level, null);
  assert.equal(model.pathogens.covid.level, null);
  assert.equal(model.trend.direction, 'unknown');
});

test('sufficient combined national coverage does not turn one local pathogen reading into a national claim', () => {
  const model = computeModel({ edCombinedSeries: [3, 4], provenance: { kind: 'live', coverage: { usableJurisdictions: 50 } }, pathogens: { covid: { edPercentSeries: [3, 4], provenance: { kind: 'live', status: 'missing', coverage: { usableJurisdictions: 1 } } } } });
  assert.ok(Number.isFinite(model.level));
  assert.equal(model.pathogens.covid.level, null);
  assert.equal(model.pathogens.covid.trend.direction, 'unknown');
  assert.deepEqual(model.pathogens.covid.contributors, []);
});

test('changing jurisdiction coverage prevents a misleading aggregate trend while retaining its latest index', () => {
  const provenance = { kind: 'live', metrics: { edVisits: { status: 'available', comparableHistory: false } } };
  const model = computeModel({ edCombinedSeries: [1, 2], provenance, pathogens: { covid: { edPercentSeries: [1, 2], provenance } } });
  assert.ok(Number.isFinite(model.level));
  assert.equal(model.trend.direction, 'unknown');
  assert.equal(model.trend.changePct, null);
  assert.equal(model.trend.reason, 'changing-coverage');
  assert.equal(model.pathogens.covid.trend.direction, 'unknown');
});

test('explicit unknown reading provenance cannot borrow a live bundle kind or health presentation', () => {
  const context = { kind: 'live', live: true, weekEnding: '2026-09-26', now: '2026-10-09T12:00:00Z' };
  const model = computeModel({ weekEnding: context.weekEnding, edCombinedSeries: [1, 2], provenance: { kind: 'unknown' }, pathogens: { influenza: { edPercentSeries: [1, 2] } } }, context);
  assert.ok(Number.isFinite(model.level), 'pure arithmetic remains inspectable');
  assert.equal(model.provenance.kind, 'unknown');
  assert.equal(readingStatus(model, context), 'unverified');
  const display = presentationModel(model, context);
  assert.equal(display.level, null);
  assert.equal(display.label, 'Unknown');
  assert.equal(display.trend.direction, 'unknown');
  assert.equal(display.pathogens.influenza.level, null);
  assert.equal(display.pathogens.influenza.label, 'Unknown');
  assert.equal(presentationModel(display, context).label, 'Unknown', 'repeated rendering cannot promote the unverified model');
});

test('absent legacy provenance can still accept verified live context at the presentation boundary', () => {
  const context = { kind: 'live', live: true, weekEnding: '2026-09-26', now: '2026-10-09T12:00:00Z' };
  const model = computeModel({ edCombinedSeries: [1, 2] });
  assert.equal(model.provenance.kindExplicit, false);
  const display = presentationModel(model, context);
  assert.equal(display.provenance.kind, 'live');
  assert.equal(display.level, model.level);
  assert.equal(display.trend.direction, 'up');
});

test('explicit unknown or sample metric kinds cannot contribute to a live state or pathogen reading', () => {
  const context = { kind: 'live', live: true, weekEnding: '2026-09-26', now: '2026-10-09T12:00:00Z' };
  for (const kind of ['unknown', 'sample']) {
    const data = { ariLevel: 0, edCombinedSeries: [8, 9], provenance: { metrics: { edVisits: { kind, status: 'available', contributes: true } } }, pathogens: { covid: { edPercentSeries: [3, 4], provenance: { metrics: { edVisits: { kind, status: 'available', contributes: true } } } } } };
    const live = computeModel(data, context);
    assert.deepEqual(live.contributors, ['ari']);
    assert.equal(live.trend.direction, 'unknown');
    assert.equal(live.pathogens.covid.level, null);
    const sample = computeModel(data, { ...context, kind: 'sample', live: false });
    assert.ok(sample.contributors.includes('edVisits'), 'illustrative sample inputs remain available');
    assert.ok(Number.isFinite(sample.pathogens.covid.level));
  }
});
