import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyTakeaways, takeawaysBlock } from '../src/scripts/takeaways.js';
import { computeModel } from '../src/scripts/model.js';
import { statePage } from '../build/pages/state.mjs';
import { generateSnapshot } from '../build/lib/snapshot.mjs';
import { states } from '../src/scripts/states-data.js';
import { stateChip } from '../src/scripts/render.js';
import { site } from '../build/lib/site.mjs';

// Signal bundles shaped like the live adapter's output, with the real CDC
// values for the week ending 2026-09-26 (NSSP ED %, NWSS site medians, ARI).
const MD = {
  ariLevel: 0, ariLabel: 'Very Low', positivityCombined: null, weekEnding: '2026-09-26',
  edCombinedSeries: [0.1, 0.1, 0.1, 0.1, 0.2, 0.3, 0.2, 0.3, 0.4, 0.5, 0.6, 0.6],
  wastewaterSeries: [],
  pathogens: {
    influenza: { edPercentSeries: [0.1, 0, 0, 0, 0, 0.1, 0, 0.1, 0.1, 0.1, 0.2, 0.2], wastewaterSeries: [], positivitySeries: [] },
    covid: { edPercentSeries: [0, 0.1, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0.3, 0.4, 0.4, 0.4], wastewaterSeries: [], positivitySeries: [] },
    rsv: { edPercentSeries: Array(12).fill(0), wastewaterSeries: [], positivitySeries: [] },
  },
};
const GA = {
  ...MD,
  edCombinedSeries: [0.1, 0.3, 0.2, 0.4, 0.6, 0.8, 0.9, 1, 0.8, 0.7, 0.7, 0.9],
  wastewaterSeries: [9.59, 7.75, 7.22],
  pathogens: {
    influenza: { edPercentSeries: [0, 0.1, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.3], wastewaterSeries: [1, 1, 1], positivitySeries: [] },
    covid: { edPercentSeries: [0.1, 0.2, 0.2, 0.4, 0.5, 0.7, 0.8, 0.9, 0.7, 0.6, 0.5, 0.5], wastewaterSeries: [9.59, 7.75, 7.22], positivitySeries: [] },
    rsv: { edPercentSeries: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1], wastewaterSeries: [1, 1, 1], positivitySeries: [] },
  },
};
const find = (abbr) => states.find((s) => s.abbr === abbr);
const texts = (items) => items.map((t) => `${t.lead}: ${t.text}`).join('\n');

test('NOTHING is said on sample data — no claim about a real state from fixture numbers', () => {
  const snap = generateSnapshot();
  for (const st of states) {
    const sig = snap.states[st.abbr];
    assert.deepEqual(weeklyTakeaways(st, computeModel(sig), sig, { live: false }), [], st.abbr);
    assert.equal(takeawaysBlock(st, computeModel(sig), sig, { live: false }), '', st.abbr);
  }
});

test('nothing is said when the state has no level at all', () => {
  const empty = { pathogens: {} };
  assert.deepEqual(weeklyTakeaways(find('MD'), computeModel(empty), empty, { live: true }), []);
});

test('Maryland (no usable wastewater): says what the level rests on instead of inventing a reading', () => {
  const items = weeklyTakeaways(find('MD'), computeModel(MD), MD, { live: true, peers: [{ name: 'Virginia', level: 0 }, { name: 'Delaware', level: 0 }] });
  const all = texts(items);
  assert.ok(items.length >= 3 && items.length <= 5);
  assert.match(all, /^Overall: Combined flu, RSV and COVID-19 activity in Maryland is minimal and edging up\. CDC rates acute respiratory illness activity in the state as Very Low\./);
  assert.match(all, /Flu: Influenza accounted for 0\.2% of emergency-department visits — minimal and edging up\./);
  assert.match(all, /COVID-19 is the most common of the three in Maryland’s emergency departments \(0\.4% of visits, against 0\.2% flu and 0\.0% RSV\)/);
  assert.match(all, /No wastewater reading is available for Maryland this week, so this level rests on CDC’s acute respiratory illness rating and emergency-department visits\./);
  assert.match(all, /Both other states in Maryland’s HHS region are also at a minimal level\./);
});

test('Georgia: names the leading wastewater virus on FluTrack’s scale and ranks it in its region', () => {
  const items = weeklyTakeaways(find('GA'), computeModel(GA), GA, { live: true, peers: [{ name: 'Alabama', level: 0 }, { name: 'Florida', level: 0 }] });
  const all = texts(items);
  assert.match(all, /COVID-19 shows the most viral activity in Georgia’s wastewater \(activity index 7\.2, high on FluTrack’s scale\)/);
  assert.match(all, /Georgia has the highest level in its HHS region — both other states are lower\./);
});

test('takeaways describe; they never advise, predict, or headline a percentage change', () => {
  for (const [abbr, sig] of [['MD', MD], ['GA', GA]]) {
    const all = texts(weeklyTakeaways(find(abbr), computeModel(sig), sig, { live: true, peers: [{ name: 'X', level: 2 }] }));
    assert.doesNotMatch(all, /\b(should|recommend|consider|avoid|will (rise|fall|peak)|expect|forecast|predict)\b/i);
    assert.doesNotMatch(all, /[+-]\d+%|\d+% (rise|increase|jump|drop)/i, 'no change-percentage headlines');
  }
});

test('possessives follow the state name (Texas’, not Texas’s)', () => {
  const all = texts(weeklyTakeaways(find('TX'), computeModel(MD), MD, { live: true }));
  assert.match(all, /Texas’ emergency departments/);
  assert.doesNotMatch(all, /Texas’s/);
});

test('the rendered block escapes text and carries the week', () => {
  const html = takeawaysBlock({ name: 'A<b>' }, computeModel(MD), MD, { live: true, weekEnding: '2026-09-26' });
  assert.ok(!html.includes('A<b>'), 'state name escaped');
  assert.match(html, /Week ending Sep 26, 2026/);
  assert.equal((html.match(/<li>/g) || []).length, 4, 'no peers → no region line');
});

// --- on the state report ---------------------------------------------------- //

function ctxFor(signalsByAbbr, live) {
  const models = new Map(states.map((st) => [st.abbr, { model: computeModel(signalsByAbbr[st.abbr]), signals: signalsByAbbr[st.abbr] }]));
  return { site, weekEnding: '2026-09-26', provenance: { live }, states, models, render: { stateChip } };
}

test('state report: block present on live data, absent (empty region) on sample', () => {
  const liveSignals = Object.fromEntries(states.map((s) => [s.abbr, MD]));
  const live = statePage(ctxFor(liveSignals, true), find('MD'));
  assert.match(live.body, /<div data-region="takeaways"><section class="takeaways"/);
  assert.match(live.body, /This week in Maryland, in plain English/);

  const sample = statePage(ctxFor(generateSnapshot().states, false), find('MD'));
  assert.match(sample.body, /<div data-region="takeaways"><\/div>/, 'region kept for the browser refresh to fill');
  assert.doesNotMatch(sample.body, /in plain English<\/h2>/);
});
