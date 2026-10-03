import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icon } from '../src/scripts/icons.js';

// Every key documented in the PATHS map. Each must resolve to real geometry,
// otherwise a typo in a template renders a silent empty gap.
const ICON_NAMES = [
  'pulse',
  'shield-check',
  'clock',
  'info',
  'alert',
  'map-pin',
  'plus',
  'check',
  'arrow-right',
  'bell',
  'chart',
];

test('icon renders a complete, decorative, currentColor svg', () => {
  const svg = icon('pulse');
  assert.ok(svg.startsWith('<svg '), 'opens with an svg tag');
  assert.ok(svg.endsWith('</svg>'), 'closes the svg tag');
  assert.ok(svg.includes('class="icon"'));
  assert.ok(svg.includes('width="18"') && svg.includes('height="18"'), '18px default square');
  assert.ok(svg.includes('viewBox="0 0 24 24"'), 'drawn on the shared 24-grid');
  assert.ok(svg.includes('fill="none"') && svg.includes('stroke="currentColor"'), 'inherits color from CSS');
  assert.ok(svg.includes('stroke-linecap="round"') && svg.includes('stroke-linejoin="round"'));
});

test('icon is aria-hidden and out of the tab order, as a decorative glyph', () => {
  const svg = icon('alert');
  assert.ok(svg.includes('aria-hidden="true"'));
  assert.ok(svg.includes('focusable="false"'));
});

test('every documented icon name resolves to real geometry', () => {
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.ok(/<(path|circle)\b/.test(svg), `${name} has path geometry`);
    assert.ok(svg.includes('<svg '), `${name} still renders the svg wrapper`);
  }
});

test('icon honors size, class, and stroke overrides', () => {
  const svg = icon('bell', { size: 32, cls: 'icon--lg', stroke: 1.5 });
  assert.ok(svg.includes('width="32"') && svg.includes('height="32"'));
  assert.ok(svg.includes('class="icon icon--lg"'), 'the custom class is appended to the base class');
  assert.ok(svg.includes('stroke-width="1.5"'));
});

test('an empty class override leaves the base class alone', () => {
  const svg = icon('check', { cls: '' });
  assert.ok(svg.includes('class="icon"'));
  assert.ok(!svg.includes('class="icon  "') && !svg.includes('class="icon "'), 'no stray empty class name');
});

test('an unknown icon name degrades to an empty but valid svg', () => {
  const svg = icon('does-not-exist');
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(!svg.includes('<path'), 'no geometry, but the markup does not break');
  assert.ok(!svg.includes('undefined'), 'a missing icon never leaks "undefined" into the page');
});

test('icon geometry is not interpolated into attributes, so it cannot break out', () => {
  // The body is drawn from a fixed table, never from caller input: the name is
  // used only as a lookup key.
  assert.equal(icon('pulse" onload="alert(1)').includes('onload'), false);
});
