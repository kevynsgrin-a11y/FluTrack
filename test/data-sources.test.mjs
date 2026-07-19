import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excludeNonCommercial, DATASETS } from '../src/scripts/data-sources.js';

// The WastewaterSCAN (CC BY-NC 4.0) exclusion is a licensing kill-criterion:
// a monetized site must never surface non-commercially-licensed rows.
const provFields = DATASETS.wastewater.fields.provenance;

test('excludeNonCommercial drops WastewaterSCAN / SCAN / Verily rows', () => {
  const rows = [
    { state: 'CA', wval: 5, data_source: 'NWSS' },
    { state: 'CA', wval: 6, data_source: 'WastewaterSCAN' },
    { state: 'TX', wval: 4, source: 'SCAN' },
    { state: 'NY', wval: 3, provider: 'Verily' },
    { state: 'WA', wval: 7, reporting_source: 'Stanford/Emory' },
    { state: 'FL', wval: 2, source: 'CDC NWSS' },
  ];
  const kept = excludeNonCommercial(rows, provFields);
  const states = kept.map((r) => r.state);
  assert.deepEqual(states, ['CA', 'FL'], 'only public-domain NWSS rows survive');
});

test('excludeNonCommercial keeps rows with no provenance field', () => {
  const rows = [{ state: 'OH', wval: 5 }];
  assert.equal(excludeNonCommercial(rows, provFields).length, 1);
});

test('excludeNonCommercial is case-insensitive', () => {
  const rows = [{ state: 'CA', wval: 5, source: 'wastewaterscan' }];
  assert.equal(excludeNonCommercial(rows, provFields).length, 0);
});

test('dataset registry only points at public-domain CDC resources', () => {
  for (const ds of Object.values(DATASETS)) {
    assert.match(ds.license, /Public Domain/i);
    assert.ok(ds.id && /^[a-z0-9]{4}-[a-z0-9]{4}$/.test(ds.id), `resource id looks valid: ${ds.id}`);
  }
});
