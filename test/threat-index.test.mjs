import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketize,
  scoreToLevel,
  levelLabel,
  scoreFromBreakpoints,
  computeTrend,
  buildThreatModel,
  scorePathogen,
  labelToLevel,
  SEVERITY_LABELS,
  BREAKPOINTS,
} from '../src/scripts/threat-index.js';

test('severity labels are the canonical five', () => {
  assert.deepEqual(SEVERITY_LABELS, ['Minimal', 'Low', 'Moderate', 'High', 'Very High']);
});

test('bucketize maps values across the four breakpoints', () => {
  const bp = [2, 3.5, 5.5, 8];
  assert.equal(bucketize(0, bp), 0);
  assert.equal(bucketize(1.9, bp), 0);
  assert.equal(bucketize(2, bp), 1);
  assert.equal(bucketize(4, bp), 2);
  assert.equal(bucketize(6, bp), 3);
  assert.equal(bucketize(9, bp), 4);
  assert.equal(bucketize(NaN, bp), null);
});

test('scoreToLevel respects the composite cut points', () => {
  assert.equal(scoreToLevel(0), 0);
  assert.equal(scoreToLevel(19.9), 0);
  assert.equal(scoreToLevel(20), 1);
  assert.equal(scoreToLevel(59), 2);
  assert.equal(scoreToLevel(79), 3);
  assert.equal(scoreToLevel(80), 4);
  assert.equal(scoreToLevel(100), 4);
});

test('levelLabel returns the right words', () => {
  assert.equal(levelLabel(0), 'Minimal');
  assert.equal(levelLabel(4), 'Very High');
  assert.equal(levelLabel(null), 'Unknown');
  assert.equal(levelLabel(undefined), 'Unknown');
});

test('labelToLevel is tolerant of casing and synonyms', () => {
  assert.equal(labelToLevel('Very Low'), 0);
  assert.equal(labelToLevel('minimal'), 0);
  assert.equal(labelToLevel('Moderate'), 2);
  assert.equal(labelToLevel('VERY HIGH'), 4);
  assert.equal(labelToLevel('nonsense'), null);
});

test('scoreFromBreakpoints is monotonic and bounded 0..100', () => {
  const bp = BREAKPOINTS.edVisits.combined;
  const a = scoreFromBreakpoints(0, bp);
  const b = scoreFromBreakpoints(3.5, bp);
  const c = scoreFromBreakpoints(8, bp);
  const d = scoreFromBreakpoints(20, bp);
  assert.equal(a, 0);
  assert.ok(b > a && c > b, 'monotonic increasing');
  assert.ok(d <= 100 && d >= 80, 'saturates near 100');
});

test('computeTrend detects rising, falling, and flat', () => {
  assert.equal(computeTrend([1, 1, 1, 2]).direction, 'up');
  assert.equal(computeTrend([4, 4, 4, 2]).direction, 'down');
  assert.equal(computeTrend([2, 2, 2, 2]).direction, 'flat');
  assert.equal(computeTrend([1]).direction, 'unknown');
  assert.equal(computeTrend([1]).changePct, null);
});

test('computeTrend compares against up to three prior observations, preserving the ±8% thresholds', () => {
  const trend = computeTrend([99, 1, 1, 10, 10]);
  assert.equal(trend.direction, 'up');
  assert.equal(trend.changePct, 150, 'latest equals previous point but exceeds the prior-three mean');
  assert.equal(trend.priorCount, 3);
  assert.equal(computeTrend([100, 107]).direction, 'flat');
  assert.equal(computeTrend([100, 108]).direction, 'up');
  assert.equal(computeTrend([100, 93]).direction, 'flat');
  assert.equal(computeTrend([100, 92]).direction, 'down');
});

test('a missing latest observation does not fall back to an older trend or level', () => {
  const trend = computeTrend([1, 2, null]);
  assert.equal(trend.direction, 'unknown');
  assert.equal(trend.changePct, null);
  const model = buildThreatModel({ edCombinedSeries: [2, 3, null], pathogens: { influenza: { edPercentSeries: [1, 2, null] } } });
  assert.equal(model.level, null);
  assert.equal(model.pathogens.influenza.level, null);
  assert.equal(model.pathogens.influenza.trend.direction, 'unknown');
});

test('computeTrend clamps absurd percentages from a tiny base', () => {
  // 0.05 -> 0.30 is numerically +500%, but off-season it must not read alarmingly.
  const t = computeTrend([0.05, 0.05, 0.05, 0.3]);
  assert.equal(t.direction, 'up');
  assert.ok(t.changePct <= 200, `changePct clamped, got ${t.changePct}`);
});

test('computeTrend handles an exactly-zero prior base', () => {
  const t = computeTrend([0, 0, 0, 1]);
  assert.equal(t.direction, 'up');
  assert.equal(t.changePct, 100, 'preserve the internal direction contract');
  assert.equal(t.actualChangePct, null, 'relative growth from zero is undefined');
  assert.equal(t.zeroBaseline, true);
  assert.equal(t.priorMean, 0);
  assert.equal(t.latestValue, 1);
  assert.equal(t.changePctCapped, false);
  assert.equal(computeTrend([0, 0]).actualChangePct, null);
  assert.equal(computeTrend([0, 0]).direction, 'flat');
});

test('capped model percentages retain the actual comparison and original scoring boundaries', () => {
  const t = computeTrend([0, 0, 0.1, 0.2]);
  assert.equal(t.changePct, 200);
  assert.equal(t.direction, 'up');
  assert.equal(t.changePctCapped, true);
  assert.ok(Math.abs(t.actualChangePct - 500) < 1e-9);
  assert.equal(t.priorMean, 0.1 / 3);
  assert.equal(t.latestValue, 0.2);
  assert.equal(computeTrend([1, 3]).changePctCapped, false, 'an exact 200% comparison is not capped');
  assert.equal(computeTrend([100, 107]).direction, 'flat');
  assert.equal(computeTrend([100, 108]).direction, 'up');
});

test('scorePathogen blends signals and yields a level', () => {
  const p = scorePathogen('covid', {
    edPercentSeries: [1.0, 1.4, 1.8, 2.2],
    positivitySeries: [8, 10, 12, 14],
    wastewaterSeries: [3, 4, 5, 6],
  });
  assert.ok(Number.isFinite(p.level));
  assert.ok(p.level >= 0 && p.level <= 4);
  assert.equal(p.trend.direction, 'up');
  assert.ok(p.contributors.length >= 1);
});

test('scorePathogen returns No data when no signals present', () => {
  const p = scorePathogen('rsv', {});
  assert.equal(p.level, null);
  assert.equal(p.label, 'No data');
});

test('buildThreatModel renormalizes weights over present signals', () => {
  const model = buildThreatModel({
    ariLevel: 2,
    edCombinedSeries: [3, 3.5, 4, 4.5],
    wastewaterSeries: [3, 4, 5, 6],
    positivityCombined: 12,
    pathogens: {
      influenza: { edPercentSeries: [0.1, 0.2, 0.2, 0.3] },
      covid: { edPercentSeries: [1.5, 1.8, 2.1, 2.5] },
      rsv: { edPercentSeries: [0.1, 0.1, 0.2, 0.2] },
    },
  });
  assert.ok(Number.isFinite(model.composite));
  assert.ok(model.composite >= 0 && model.composite <= 100);
  assert.equal(model.label, levelLabel(model.level));
  assert.ok(model.contributors.includes('wastewater'));
  assert.equal(model.pathogens.covid.trend.direction, 'up');
});

test('buildThreatModel with no signals reports No data', () => {
  const model = buildThreatModel({});
  assert.equal(model.level, null);
  assert.equal(model.label, 'No data');
});
