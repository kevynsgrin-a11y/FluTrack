import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchLiveSignals, hasSignalData } from '../src/scripts/data-sources.js';
import { signalRows, provenanceBadge, severityMeter } from '../src/scripts/render.js';
import { escapeHtml, formatDate } from '../src/scripts/util.js';

// ---------------------------------------------------------------------------
// These cover the seam between the bundled sample data and the live CDC feed —
// the code path that decides whether the UI may call itself "Live CDC data".
// Everything here was previously untested, and the failures it guards against
// are silent: the page still renders, it just renders something untrue.
// ---------------------------------------------------------------------------

/** Install a fetch stub that serves a canned body for every Socrata request. */
function stubFetch(bodyFor) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => bodyFor(String(url)),
  });
  return () => {
    globalThis.fetch = original;
  };
}

test('a 200 carrying zero rows yields statesWithData = 0', async () => {
  const restore = stubFetch(() => []);
  try {
    const live = await fetchLiveSignals();
    // All three requests "succeeded", so sources is populated and no throw
    // happens — which is exactly why the caller must not trust sources alone.
    assert.equal(live.sources.length, 3, 'all three datasets resolved');
    assert.equal(live.statesWithData, 0, 'but no state actually got data');
    assert.equal(live.weekEnding, '', 'and there is no week to report');
  } finally {
    restore();
  }
});

test('rows whose geography no longer resolves yield statesWithData = 0', async () => {
  // Simulates upstream schema drift: the column is present but now carries HHS
  // region names rather than state names.
  const rows = [
    { week_end: '2026-07-11', geography: 'Region 4', percent_visits_combined: '3.1' },
    { week_end: '2026-07-11', geography: 'HHS Region 9', percent_visits_combined: '2.4' },
  ];
  const restore = stubFetch(() => rows);
  try {
    const live = await fetchLiveSignals();
    assert.equal(live.statesWithData, 0, 'unresolvable geographies must not count as data');
  } finally {
    restore();
  }
});

test('resolvable rows do produce usable per-state signals', async () => {
  const rows = [
    { week_end: '2026-07-04', geography: 'California', percent_visits_combined: '2.0' },
    { week_end: '2026-07-11', geography: 'California', percent_visits_combined: '3.0' },
    { week_end: '2026-07-11', geography: 'TX', percent_visits_combined: '1.5' },
  ];
  const restore = stubFetch((url) => (url.includes('vutn-jzwm') ? rows : []));
  try {
    const live = await fetchLiveSignals();
    assert.equal(live.statesWithData, 2, 'California and Texas both resolved');
    assert.equal(live.weekEnding, '2026-07-11');
    const ca = live.signalsByAbbr.get('CA');
    assert.ok(hasSignalData(ca));
    assert.deepEqual(ca.edCombinedSeries, [2, 3], 'series is in ascending week order');
  } finally {
    restore();
  }
});

test('multiple sub-state rows in one week collapse to a single value', async () => {
  // NSSP publishes by state AND sub-state region. Without collapsing, the trend
  // model compares siblings from the same week and reports geographic variance
  // as a time trend.
  const rows = [
    { week_end: '2026-07-04', geography: 'California', percent_visits_combined: '2.0' },
    { week_end: '2026-07-11', geography: 'California', percent_visits_combined: '4.0' },
    { week_end: '2026-07-11', geography: 'California', percent_visits_combined: '6.0' },
    { week_end: '2026-07-11', geography: 'California', percent_visits_combined: '8.0' },
  ];
  const restore = stubFetch((url) => (url.includes('vutn-jzwm') ? rows : []));
  try {
    const live = await fetchLiveSignals();
    const ca = live.signalsByAbbr.get('CA');
    assert.equal(ca.edCombinedSeries.length, 2, 'one value per distinct week');
    assert.deepEqual(ca.edCombinedSeries, [2, 6], 'same-week rows averaged, not listed');
  } finally {
    restore();
  }
});

test('the live query is bounded by a date window and a modest row limit', async () => {
  const seen = [];
  const restore = stubFetch((url) => {
    seen.push(url);
    return [];
  });
  try {
    await fetchLiveSignals();
    assert.equal(seen.length, 3);
    for (const url of seen) {
      assert.match(url, /%24where=/, 'every query carries a $where date bound');
      const limit = Number(new URL(url).searchParams.get('$limit'));
      assert.ok(limit > 0 && limit <= 30000, `\$limit ${limit} is bounded`);
    }
  } finally {
    restore();
  }
});

test('CDC "Extremely High" maps to the top ARI level, not null', async () => {
  const ari = [{ week_end: '2026-07-11', geography: 'Wyoming', activity_level_label: 'Extremely High' }];
  const restore = stubFetch((url) => (url.includes('f3zz-zga5') ? ari : []));
  try {
    const live = await fetchLiveSignals();
    // Dropping this label silently removed a 0.25-weighted signal for exactly
    // the states at the CDC's most severe activity category.
    assert.equal(live.signalsByAbbr.get('WY').ariLevel, 4);
  } finally {
    restore();
  }
});

test('hasSignalData rejects empty and malformed bundles', () => {
  assert.equal(hasSignalData(null), false);
  assert.equal(hasSignalData({}), false);
  assert.equal(hasSignalData({ edCombinedSeries: [], wastewaterSeries: [] }), false);
  assert.equal(hasSignalData({ edCombinedSeries: [], ariLevel: null }), false);
  assert.equal(hasSignalData({ edCombinedSeries: [1] }), true);
  assert.equal(hasSignalData({ ariLevel: 0 }), true, 'level 0 is data, not absence');
});

// ---------------------------------------------------------------------------
// Render-layer invariants
// ---------------------------------------------------------------------------

test('the signal-row set is identical with and without positivity', () => {
  const withPos = signalRows({ edCombinedSeries: [3], wastewaterSeries: [5], positivityCombined: 13 });
  const withoutPos = signalRows({ edCombinedSeries: [3], wastewaterSeries: [5], positivityCombined: null });
  const count = (html) => (html.match(/class="signal-row"/g) || []).length;
  // A live refresh does not supply positivity; if the row were conditional, a
  // successful upgrade would silently delete a row the static page had shown.
  assert.equal(count(withPos), count(withoutPos), 'row count must not depend on the value');
  assert.match(withoutPos, /Test positivity/);
  assert.match(withoutPos, /—/, 'missing values render as an explicit dash');
});

test('provenanceBadge distinguishes "not yet" from "failed"', () => {
  assert.match(provenanceBadge({ live: true }), /Live CDC data/);
  const pending = provenanceBadge({ live: false });
  const failed = provenanceBadge({ live: false, failed: true });
  assert.match(pending, /Sample data/);
  assert.match(failed, /unavailable/i, 'a failed refresh must say so');
  assert.notEqual(pending, failed);
});

test('an unknown severity is not announced as the lowest severity', () => {
  const unknown = severityMeter(undefined);
  assert.match(unknown, /Severity unknown/);
  assert.doesNotMatch(unknown, /Minimal"/, 'must not claim the Minimal level');
  assert.match(severityMeter(0), /Severity 1 of 5: Minimal/);
  assert.match(severityMeter(4), /Severity 5 of 5: Very High/);
});

test('render.js escapes values that originate upstream', () => {
  const attack = '"><img src=x onerror=alert(1)>';
  const html = signalRows({ edCombinedSeries: [1], wastewaterSeries: [], positivityCombined: null });
  assert.doesNotMatch(html, /<img/, 'no raw markup from a signal bundle');
  // escapeHtml is the shared primitive every interpolation must go through.
  assert.equal(
    escapeHtml(attack),
    '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;',
    'escapeHtml neutralises quotes and angle brackets'
  );
});

// ---------------------------------------------------------------------------
// Date handling
// ---------------------------------------------------------------------------

test('formatDate parses ISO dates as UTC, not local time', () => {
  // 'YYYY-MM-DD' parsed as local time is the classic off-by-one-day bug.
  assert.equal(formatDate('2026-07-11'), 'Jul 11, 2026');
  assert.equal(formatDate('2026-01-01'), 'Jan 1, 2026', 'no year-boundary slip');
  assert.equal(formatDate('2026-12-31'), 'Dec 31, 2026');
});

test('formatDate returns its input unchanged when it cannot parse it', () => {
  assert.equal(formatDate(''), '');
  assert.equal(formatDate(undefined), '');
  // The caller relies on this identity to avoid overwriting good server-rendered
  // text with a malformed value.
  assert.equal(formatDate('not-a-date'), 'not-a-date');
});
