import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, GRID } from '../src/scripts/us-tilegrid.js';
import { usMap } from '../src/scripts/map-render.js';
import { states } from '../src/scripts/states-data.js';

test('tile grid contains exactly the 51 jurisdictions, once each', () => {
  const keys = Object.keys(TILE);
  assert.equal(keys.length, 51);
  // Every states-data abbr has a tile, and vice versa.
  const stateAbbrs = new Set(states.map((s) => s.abbr));
  for (const abbr of keys) assert.ok(stateAbbrs.has(abbr), `${abbr} is a real jurisdiction`);
  for (const s of states) assert.ok(TILE[s.abbr], `${s.abbr} has a tile`);
});

test('no two states share a grid cell', () => {
  const seen = new Set();
  for (const [abbr, [row, col]] of Object.entries(TILE)) {
    const key = `${row},${col}`;
    assert.ok(!seen.has(key), `cell ${key} is unique (collision at ${abbr})`);
    seen.add(key);
  }
});

test('all tiles are within the declared grid bounds', () => {
  for (const [abbr, [row, col]] of Object.entries(TILE)) {
    assert.ok(row >= 0 && row < GRID.rows, `${abbr} row in range`);
    assert.ok(col >= 0 && col < GRID.cols, `${abbr} col in range`);
  }
});

test('usMap renders one keyboard-navigable link per state with a severity fill', () => {
  const entries = states.map((s, i) => ({
    abbr: s.abbr,
    name: s.name,
    slug: s.slug,
    level: i % 5,
    label: 'Test',
  }));
  const html = usMap(entries, { selected: 'CA' });
  // 51 tiles, each an anchor to its state report. Match the anchor's class
  // attribute specifically — a bare `class="us-tile` prefix also matches the
  // `us-tile__lvl` severity digit inside each tile.
  assert.equal((html.match(/class="us-tile(?![_-]{2})[^"]*"/g) || []).length, 51);
  for (const s of states) {
    assert.ok(html.includes(`href="/state/${s.slug}/"`), `${s.abbr} links to its report`);
    assert.ok(html.includes(`data-abbr="${s.abbr}"`), `${s.abbr} tagged for hydration`);
  }
  assert.ok(html.includes('is-selected'), 'selected state is marked');
});

test('each tile carries its severity level as a non-colour cue', () => {
  const entries = states.map((s, i) => ({
    abbr: s.abbr,
    name: s.name,
    slug: s.slug,
    level: i % 5,
    label: 'Test',
  }));
  const html = usMap(entries, {});
  // The digit is the only severity cue that survives greyscale or a fully
  // achromatic display, so every tile with data must carry one.
  assert.equal((html.match(/class="us-tile__lvl"/g) || []).length, 51);
  assert.match(html, /class="us-tile__lvl"[^>]*aria-hidden="true"/, 'digit is decorative for AT');

  // A state with no data must not get a digit (or a severity fill).
  const noData = usMap([{ abbr: 'CA', name: 'California', slug: 'california', level: null, label: 'No data' }], {});
  const caTile = noData.slice(noData.indexOf('data-abbr="CA"'));
  assert.doesNotMatch(caTile.slice(0, caTile.indexOf('</a>')), /us-tile__lvl/);
});

test('the map offers a keyboard bypass around its 51 tab stops', () => {
  const html = usMap([], {});
  assert.match(html, /class="skip-link skip-link--inline" href="#skip-map"/);
  assert.match(html, /id="skip-map"/, 'the bypass target exists');
});

test('usMap tolerates a missing/no-data state without crashing', () => {
  const html = usMap([{ abbr: 'CA', name: 'California', slug: 'california', level: null, label: 'No data' }], {});
  assert.ok(html.includes('data-abbr="TX"'), 'renders every tile even with sparse input');
});
