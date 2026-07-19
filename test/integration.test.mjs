import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSnapshot } from '../build/lib/snapshot.mjs';
import { computeModel } from '../src/scripts/model.js';
import { nationalSignals } from '../src/scripts/aggregate.js';
import { states } from '../src/scripts/states-data.js';

const snap = generateSnapshot();

test('snapshot covers all 51 jurisdictions with a valid shape', () => {
  assert.equal(Object.keys(snap.states).length, 51);
  for (const st of states) {
    const s = snap.states[st.abbr];
    assert.ok(s, `${st.abbr} present`);
    assert.equal(s.edCombinedSeries.length, snap.weeks.length);
    assert.ok(Number.isFinite(s.ariLevel));
    for (const p of ['influenza', 'covid', 'rsv']) {
      assert.ok(Array.isArray(s.pathogens[p].edPercentSeries));
    }
  }
});

test('computeModel produces a coherent model for every state', () => {
  for (const st of states) {
    const model = computeModel(snap.states[st.abbr]);
    assert.ok(model.level >= 0 && model.level <= 4, `${st.abbr} level in range`);
    assert.equal(typeof model.label, 'string');
    assert.ok(Array.isArray(model._series));
    for (const p of ['influenza', 'covid', 'rsv']) {
      assert.ok(model.pathogens[p], `${st.abbr} has ${p}`);
      assert.ok(Array.isArray(model.pathogens[p]._series));
    }
  }
});

test('national rollup is well-formed and in range', () => {
  const nat = nationalSignals(states.map((s) => snap.states[s.abbr]));
  const model = computeModel(nat);
  assert.ok(model.level >= 0 && model.level <= 4);
  assert.equal(nat.edCombinedSeries.length, snap.weeks.length);
});

test('national rollup takes the most recent week across states', () => {
  const nat = nationalSignals([
    { edCombinedSeries: [1, 2], wastewaterSeries: [1, 2], positivityCombined: 10, weekEnding: '2026-07-04', pathogens: {} },
    { edCombinedSeries: [3, 4], wastewaterSeries: [3, 4], positivityCombined: 12, weekEnding: '2026-07-11', pathogens: {} },
  ]);
  assert.equal(nat.weekEnding, '2026-07-11', 'uses max week, not the first entry');
});

test('national rollup tolerates series of differing lengths', () => {
  const nat = nationalSignals([
    { edCombinedSeries: [2, 4], weekEnding: '2026-07-11', pathogens: {} },
    { edCombinedSeries: [1, 2, 3, 4], weekEnding: '2026-07-11', pathogens: {} },
  ]);
  // Length is the max; the aligned tail averages (4 and 4) -> 4.
  assert.equal(nat.edCombinedSeries.length, 4);
  assert.equal(nat.edCombinedSeries.at(-1), 4);
});

test('snapshot is deterministic (reproducible builds)', () => {
  const a = generateSnapshot();
  const b = generateSnapshot();
  assert.deepEqual(a.states.CA, b.states.CA);
});

test('scenario is honest: off-season flu/RSV stay low', () => {
  // Mid-July: influenza & RSV ED share should be minimal everywhere.
  for (const st of states) {
    const flu = snap.states[st.abbr].pathogens.influenza.edPercentSeries.at(-1);
    const rsv = snap.states[st.abbr].pathogens.rsv.edPercentSeries.at(-1);
    assert.ok(flu < 1, `${st.abbr} flu minimal off-season`);
    assert.ok(rsv < 1, `${st.abbr} rsv minimal off-season`);
  }
});
