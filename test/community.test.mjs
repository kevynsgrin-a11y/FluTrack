import { test } from 'node:test';
import assert from 'node:assert/strict';
import { communitySummary, chooseBaseline, isElevated, assertNoOutbreak, pctIli, MIN_N } from '../src/server/community.js';

const summary = (n, nIli = 0, baseline = null, extra = {}) => communitySummary({ n, n_ili: nIli, n_pos_flu: 2, n_pos_covid: 1, ...extra }, baseline, 'San Diego County');

test('n = 4 is suppressed: no counts of any kind', () => {
  const c = summary(4, 4);
  assert.equal(c.suppressed, true);
  assert.equal(c.n, null);
  assert.equal(c.pct_ili, null);
  assert.equal(c.n_pos_flu, null);
  assert.equal(c.n_pos_covid, null);
  assert.match(c.label, /Fewer than 5 reports this week — be one of the first in San Diego County/);
  assert.doesNotMatch(JSON.stringify(c), /\b4\b/, 'the true count never leaks');
});

test('n = 0 is suppressed the same way', () => {
  assert.equal(summary(0).suppressed, true);
});

test('n = 5 shows n with "too few to compare" and no share', () => {
  const c = summary(5, 5);
  assert.equal(c.suppressed, false);
  assert.equal(c.n, 5);
  assert.equal(c.pct_ili, null);
  assert.match(c.label, /too few to compare/);
  assert.equal(c.elevated, false);
});

test('n = 19 still has no share', () => {
  const c = summary(19, 19);
  assert.equal(c.n, 19);
  assert.equal(c.pct_ili, null);
});

test('n = 20 shows the ILI share', () => {
  const c = summary(20, 5);
  assert.equal(c.pct_ili, 25);
  assert.equal(c.elevated, false, 'below 30 reports never elevated');
});

test('n = 30 with at least twice the baseline share is "Elevated community reports"', () => {
  const c = summary(30, 12, { pct: 20, scope: 'county' });
  assert.equal(c.pct_ili, 40);
  assert.equal(c.elevated, true);
  assert.equal(c.badge, 'Elevated community reports');
});

test('the elevated rule needs every condition', () => {
  assert.equal(isElevated(29, 80, { pct: 10 }), false, 'n < 30');
  assert.equal(isElevated(30, 39.9, { pct: 20 }), false, 'just under 2x');
  assert.equal(isElevated(30, 40, { pct: 20 }), true, 'exactly 2x');
  assert.equal(isElevated(30, 40, null), false, 'no baseline');
  assert.equal(isElevated(30, 40, { pct: 0 }), false, 'a zero baseline is not a baseline');
  assert.equal(summary(100, 90, null).elevated, false);
});

test('baseline: county when it has >= 20 reports, else state, else none', () => {
  assert.deepEqual(chooseBaseline({ n: 20, n_ili: 2 }, { n: 500, n_ili: 50 }), { pct: 10, scope: 'county' });
  assert.deepEqual(chooseBaseline({ n: 19, n_ili: 2 }, { n: 500, n_ili: 25 }), { pct: 5, scope: 'state' });
  assert.equal(chooseBaseline({ n: 3, n_ili: 1 }, { n: 10, n_ili: 1 }), null);
});

test('pctIli rounds to one decimal and is null without reports', () => {
  assert.equal(pctIli(3, 1), 33.3);
  assert.equal(pctIli(0, 0), null);
});

test('community output never contains the word "outbreak", across the whole input space', () => {
  const baselines = [null, { pct: 0, scope: 'county' }, { pct: 1, scope: 'county' }, { pct: 50, scope: 'state' }];
  for (let n = 0; n <= 120; n += 1) {
    for (const share of [0, 0.25, 0.5, 1]) {
      for (const b of baselines) {
        const c = communitySummary({ n, n_ili: Math.round(n * share), n_pos_flu: n, n_pos_covid: n }, b, 'Any County');
        assert.doesNotMatch(JSON.stringify(c), /outbreak/i);
        assert.equal(c.verified, false);
      }
    }
  }
});

test('assertNoOutbreak replaces a label that slipped the word in', () => {
  const fixed = assertNoOutbreak({ suppressed: false, badge: 'Outbreak!', label: 'Possible outbreak' });
  assert.doesNotMatch(JSON.stringify(fixed), /outbreak/i);
  const ok = summary(25, 5);
  assert.equal(assertNoOutbreak(ok), ok, 'clean output passes through unchanged');
});

test('MIN_N is 5', () => assert.equal(MIN_N, 5));
