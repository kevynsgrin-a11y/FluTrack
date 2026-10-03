import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, formatDate, formatPct, formatChange, clamp, trendGlyph } from '../src/scripts/util.js';

test('escapeHtml neutralizes every HTML-significant character', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('a"b\'c'), 'a&quot;b&#39;c');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml escapes ampersands first, so entities are not double-decoded', () => {
  // & must be replaced before the other entities, otherwise "&lt;" would come
  // out as "&amp;lt;" -> visible literal text, or worse, re-decoded downstream.
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
});

test('escapeHtml coerces nullish and non-string input', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(false), 'false');
});

test('formatDate renders an ISO date in UTC, independent of host timezone', () => {
  assert.equal(formatDate('2026-07-11'), 'Jul 11, 2026');
  // Midnight UTC must not roll back a day for a UTC-negative host.
  assert.equal(formatDate('2026-01-01'), 'Jan 1, 2026');
  assert.equal(formatDate('2026-12-31'), 'Dec 31, 2026');
});

test('formatDate truncates a full ISO timestamp to its date part', () => {
  assert.equal(formatDate('2026-07-11T00:00:00Z'), 'Jul 11, 2026');
  assert.equal(formatDate('2026-07-11T23:59:59Z'), 'Jul 11, 2026');
});

test('formatDate returns empty for empty input and echoes unparseable input', () => {
  assert.equal(formatDate(''), '');
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate('not-a-date'), 'not-a-date');
});

test('formatPct formats to one decimal by default', () => {
  assert.equal(formatPct(2), '2.0%');
  assert.equal(formatPct(0), '0.0%');
  assert.equal(formatPct(2.5), '2.5%');
  assert.equal(formatPct(12.25), '12.3%');
});

test('formatPct honors an explicit decimal precision', () => {
  assert.equal(formatPct(2, 0), '2%');
  assert.equal(formatPct(2, 3), '2.000%');
  assert.equal(formatPct(1 / 3, 2), '0.33%');
});

test('formatPct shows an em dash for non-finite input instead of NaN%', () => {
  assert.equal(formatPct(NaN), '—');
  assert.equal(formatPct(Infinity), '—');
  assert.equal(formatPct(undefined), '—');
  assert.equal(formatPct(null), '—');
});

test('formatChange signs rises and falls, using a real minus glyph', () => {
  assert.equal(formatChange(14), '+14%');
  assert.equal(formatChange(-8), '−8%');
  assert.equal(formatChange(0.5), '+0.5%');
  assert.equal(formatChange(-0.5), '−0.5%');
  assert.equal(formatChange(2.25), '+2.25%');
});

test('formatChange reports "no change" for zero and non-finite input', () => {
  assert.equal(formatChange(0), 'no change');
  assert.equal(formatChange(-0), 'no change');
  assert.equal(formatChange(NaN), 'no change');
  assert.equal(formatChange(undefined), 'no change');
  assert.equal(formatChange(null), 'no change');
});

test('clamp bounds a value to its range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp(7, 7, 7), 7, 'a collapsed range yields the bound');
});

test('clamp works on a non-zero, inverted-looking range too', () => {
  assert.equal(clamp(15, 20, 80), 20);
  assert.equal(clamp(50, 20, 80), 50);
  assert.equal(clamp(90, 20, 80), 80);
});

test('trendGlyph maps each direction to its glyph and defaults to flat', () => {
  assert.equal(trendGlyph('up'), '▲');
  assert.equal(trendGlyph('down'), '▼');
  assert.equal(trendGlyph('flat'), '▬');
  assert.equal(trendGlyph('sideways'), '▬');
  assert.equal(trendGlyph(null), '▬');
  assert.equal(trendGlyph(undefined), '▬');
});

// Round-2 additions (union with the branch version — assertions not already
// covered above): combined hostile input, rounding boundaries, string inputs.
test('escapeHtml neutralizes a combined hostile string in one pass', () => {
  assert.equal(escapeHtml('&<>"'), '&amp;&lt;&gt;&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('formatPct rounds to nearest at the decimal boundary', () => {
  assert.equal(formatPct(2.34), '2.3%');
  assert.equal(formatPct(2.6, 0), '3%');
  assert.equal(formatPct(2.567, 2), '2.57%');
});

test('formatPct and formatChange treat non-number strings and Infinity as non-finite', () => {
  assert.equal(formatPct('3'), '—');
  assert.equal(formatChange(Infinity), 'no change');
});
