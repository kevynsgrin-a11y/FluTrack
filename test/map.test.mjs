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
  // 51 tiles, each an anchor to its state report.
  assert.equal((html.match(/class="us-tile/g) || []).length, 51);
  for (const s of states) {
    assert.ok(html.includes(`href="/state/${s.slug}/"`), `${s.abbr} links to its report`);
    assert.ok(html.includes(`data-abbr="${s.abbr}"`), `${s.abbr} tagged for hydration`);
  }
  assert.ok(html.includes('is-selected'), 'selected state is marked');
});

test('usMap tolerates a missing/no-data state without crashing', () => {
  const html = usMap([{ abbr: 'CA', name: 'California', slug: 'california', level: null, label: 'No data' }], {});
  assert.ok(html.includes('data-abbr="TX"'), 'renders every tile even with sparse input');
});
