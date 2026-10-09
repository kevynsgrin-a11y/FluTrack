import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assembleLiveSignals, parseAriRows, parseEdRows, parseWastewaterRows } from '../src/scripts/data-sources.js';
import { computeModel } from '../src/scripts/model.js';
import { presentationModel } from '../src/scripts/reading-provenance.js';
import { stateChip } from '../src/scripts/render.js';
import { states } from '../src/scripts/states-data.js';
import { site, disclaimers } from '../build/lib/site.mjs';
import { statePage } from '../build/pages/state.mjs';
import home from '../build/pages/home.mjs';
import { EPIDEMIC_TREND_PAGE, parseEpidemicTrend, planEpidemicTrend } from '../build/lib/epidemic-trend.mjs';
import { categoryChip, covidMeasures, epidemicTrendBlock, epidemicTrendHomeLine, formatProbability } from '../build/lib/epidemic-trend-render.mjs';

const NOW = new Date('2026-10-09T12:00:00Z');
const PROVENANCE = { kind: 'live', live: true, weekEnding: '2026-10-03', now: NOW.toISOString() };
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/cdc/covid-19-rt-map.json', import.meta.url), 'utf8'));
const find = (abbr) => states.find((s) => s.abbr === abbr);
// Text as a reader sees it: block boundaries become spaces, inline tags vanish (so "<strong>1.02</strong>," reads "1.02,").
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&mdash;': '—', '&ndash;': '–', '&ldquo;': '“', '&rdquo;': '”', '&lsquo;': '‘', '&rsquo;': '’', '&nbsp;': ' ' };
const plain = (html) => String(html)
  .replace(/<\/(?:p|div|h[1-6]|dt|dd|li|ul|ol|section|span|th|td|tr|table)>|<br\s*\/?>/g, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&(?:amp|lt|gt|quot|#39|mdash|ndash|ldquo|rdquo|lsquo|rsquo|nbsp);/g, (e) => ENTITIES[e])
  .replace(/\s+/g, ' ')
  .trim();

// Real weekly series from CDC's state-level files (evidence package, October 9, 2026):
// COVID-19 share of ED visits (%) and SARS-CoV-2 wastewater WVAL, weeks ending Aug 22 … Oct 3.
const WEEKS = ['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26', '2026-10-03'];
const SERIES = {
  WY: {
    name: 'Wyoming',
    edCovid: [0.51, 0.52, 0.59, 0.5, 0.45, 0.51, 0.66], edFlu: [0.35, 0.38, 0.35, 0.47, 0.55, 0.78, 0.9], edRsv: [0.02, 0.04, 0.02, 0.02, 0.12, 0.06, 0.04],
    wwCovid: [2.65, 1.86, 3.64, 3.85, 4.22, 2.86, 4.27],
  },
  CT: {
    name: 'Connecticut',
    edCovid: [0.26, 0.36, 0.41, 0.48, 0.55, 0.52, 0.51], edFlu: [0.03, 0.05, 0.08, 0.09, 0.14, 0.18, 0.23], edRsv: [0, 0, 0.01, 0.01, 0, 0.01, 0.02],
    wwCovid: [3.54, 2.38, 3.89, 3.25, 6.05, 8.69, 11.09],
  },
};
const WW_FLU = [1.2, 1.3, 1.1, 1.4, 1.2, 1.5, 1.3];
const WW_RSV = [1.1, 1.2, 1.3, 1.1, 1.4, 1.2, 1.5];

/** Run Socrata-shaped rows through the real adapters, so signals carry real provenance. */
function liveSignals(abbr, overrides = {}) {
  const s = { ...SERIES[abbr], ...overrides };
  const edRows = [];
  const ariRows = [];
  const wwRows = [];
  WEEKS.forEach((week, i) => {
    if (s.edCovid) {
      edRows.push({ week_end: week, geography: s.name, pathogen: 'COVID-19', percent_visits: String(s.edCovid[i]) });
      edRows.push({ week_end: week, geography: s.name, pathogen: 'Influenza', percent_visits: String(s.edFlu[i]) });
      edRows.push({ week_end: week, geography: s.name, pathogen: 'RSV', percent_visits: String(s.edRsv[i]) });
    }
    ariRows.push({ week_end: week, geography: s.name, label: 'Low' });
    for (const [target, series] of [['SARS-CoV-2', s.wwCovid], ['Influenza A', WW_FLU], ['RSV', WW_RSV]]) {
      for (let site = 0; site < 5; site += 1) wwRows.push({ week_end: week, state_territory: s.name, site: `${abbr}-${target}-${site}`, pathogen_target: target, site_wval: String(series[i]), data_source: 'NWSS' });
    }
  });
  const { signalsByAbbr } = assembleLiveSignals({ ed: parseEdRows(edRows), ari: parseAriRows(ariRows), ww: parseWastewaterRows(wwRows), now: NOW });
  const signals = signalsByAbbr.get(abbr);
  const model = computeModel(signals, PROVENANCE);
  return { signals, model, presented: presentationModel(model, PROVENANCE) };
}

const stubEntry = (ed = { status: 'available', contributes: true }) => ({
  signals: { pathogens: { covid: { provenance: { metrics: ed ? { edVisits: ed } : {} } } } },
});

function planWith(entries = {}, mutate) {
  const data = parseEpidemicTrend((() => { const p = fixture(); mutate?.(p); return p; })(), { now: NOW }).data;
  data.retrievedAt = NOW.toISOString();
  const models = new Map(states.map((st) => [st.abbr, entries[st.abbr] || stubEntry()]));
  return planEpidemicTrend(data, { models, provenance: PROVENANCE });
}

const WY = liveSignals('WY');
const CT = liveSignals('CT');
const plan = planWith({ WY: { signals: WY.signals, model: WY.model }, CT: { signals: CT.signals, model: CT.model } });
const block = (abbr, overrides = {}) => epidemicTrendBlock({ state: find(abbr), plan, signals: (overrides.entry || { WY, CT }[abbr])?.signals, model: (overrides.entry || { WY, CT }[abbr])?.presented, provenance: PROVENANCE, ...overrides.args });

/** A tag-balance check that tolerates void and self-closing elements. */
function assertBalanced(html, label) {
  const stack = [];
  const void_ = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const [, closing, tag, selfClosed] = m;
    if (selfClosed || void_.has(tag.toLowerCase())) continue;
    if (!closing) stack.push(tag.toLowerCase());
    else assert.equal(stack.pop(), tag.toLowerCase(), `${label}: mismatched </${tag}>`);
  }
  assert.deepEqual(stack, [], `${label}: unclosed tags`);
}

// --- wording helpers ------------------------------------------------------- //

test('probabilities are never shown as certainties', () => {
  assert.equal(formatProbability(0.782), '78%');
  assert.equal(formatProbability(0.5), '50%');
  assert.equal(formatProbability(0.996), 'more than 99%');
  assert.equal(formatProbability(1), 'more than 99%');
  assert.equal(formatProbability(0.004), 'less than 1%');
  assert.equal(formatProbability(0), 'less than 1%');
});

test('the category chip carries a word and a direction shape, never colour alone', () => {
  assert.match(categoryChip('likely_growing'), /class="trend trend--up"[\s\S]*<svg[\s\S]*Likely growing/);
  assert.match(categoryChip('declining'), /trend--down[\s\S]*Declining/);
  assert.match(categoryChip('not_changing'), /trend--flat[\s\S]*Not changing/);
  assert.equal(categoryChip('nonsense'), '');
});

// --- the Wyoming case: agreement, dated, with the independence caveat -------- //

test('Wyoming: CDC’s category, probability, Rt and both dates, exactly as published', () => {
  const html = block('WY');
  const text = plain(html);
  assert.match(html, /data-block="epidemic-trend" data-status="shown" data-category="likely_growing"/);
  assert.match(text, /CDC epidemic trend for COVID-19 in Wyoming/);
  assert.match(text, /Likely growing/);
  assert.match(text, /probability that COVID-19 infections are growing in Wyoming at 78%/);
  assert.match(text, /reproduction number \(Rt\) is 1\.02, with a 95% interval of 0\.96 to 1\.07/);
  assert.match(text, /CDC model report dated Oct 7, 2026/);
  assert.match(text, /emergency-department data through Oct 6, 2026/);
  assert.match(text, /75% to 90% of CDC’s estimated range of Rt values is above 1/);
  assert.match(text, /Direction only\. CDC says epidemic trends do not reflect the burden of disease/);
  assert.match(html, new RegExp(`href="${EPIDEMIC_TREND_PAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" rel="noopener"`));
});

test('Wyoming: FluTrack’s own COVID-19 readings are listed, each with its own week and rule, and agree', () => {
  const text = plain(block('WY'));
  assert.match(text, /COVID-19 share of emergency-department visits \(NSSP, FluTrack’s reading\)/);
  assert.match(text, /Week ending Oct 3, 2026 · latest observation compared with the mean of up to three prior observations/);
  assert.match(text, /Rising \+36% in the share of emergency-department visits/);
  assert.match(text, /COVID-19 wastewater viral activity \(NWSS, FluTrack’s reading\)/);
  assert.match(text, /Rising \+17% in the wastewater viral activity index/);
  assert.doesNotMatch(text, /point in different directions/);
});

test('the ED-visit share and CDC’s model share a source, and the page says agreement is not independent', () => {
  assert.match(plain(block('WY')), /same NSSP emergency-department data that produce the ED-visit share listed here, so agreement between the two is not independent confirmation/);
});

// --- the Connecticut case: disagreement is shown, not netted --------------- //

test('Connecticut: wastewater rising against a declining CDC model is stated as a disagreement', () => {
  const html = block('CT');
  const text = plain(html);
  assert.match(html, /data-category="declining"/);
  assert.match(text, /probability that COVID-19 infections are declining in Connecticut at 97%/, 'a declining category quotes the probability of declining');
  assert.match(text, /Holding steady in the share of emergency-department visits/);
  assert.match(text, /Rising \+85% in the wastewater viral activity index/);
  assert.match(text, /These measurements point in different directions\. CDC’s model classifies COVID-19 infections in Connecticut as declining, while COVID-19 wastewater viral activity is rising\./);
  assert.match(text, /neither overrides the other/);
  assert.match(html, /<p class="callout epi__divergence" role="note">/);
});

test('a flat ED share beside a growing category is not a disagreement', () => {
  const flatEd = liveSignals('WY', { edCovid: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], wwCovid: [3.1, 3.2, 3.4, 3.5, 3.9, 4.1, 4.4] });
  const html = block('WY', { entry: flatEd });
  assert.doesNotMatch(html, /epi__divergence/);
});

test('an ED share falling against a growing category is a disagreement too', () => {
  const fallingEd = liveSignals('WY', { edCovid: [0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.45] });
  const text = plain(block('WY', { entry: fallingEd }));
  assert.match(text, /CDC’s model classifies COVID-19 infections in Wyoming as likely growing, while the COVID-19 share of emergency-department visits is falling\./);
});

test('CDC saying “not changing” is never opposed to a rising or falling measurement', () => {
  const nc = planWith({ CT: { signals: CT.signals, model: CT.model } }, (p) => {
    Object.assign(p.rows.find((r) => r.fips === '09'), { category: 'not_changing', p_growing: 0.52, median: 1, lower_95: 0.9, upper_95: 1.1 });
  });
  const html = epidemicTrendBlock({ state: find('CT'), plan: nc, signals: CT.signals, model: CT.presented, provenance: PROVENANCE });
  assert.match(html, /data-category="not_changing"/);
  assert.match(plain(html), /the range spans 1, a mix of growth and decline/);
  assert.match(plain(html), /probability that COVID-19 infections are growing in Connecticut at 52%/);
  assert.doesNotMatch(html, /epi__divergence/);
});

// --- measurements: each is compared on its own ----------------------------- //

test('each COVID-19 measurement gets its own direction, even where the model keeps one trend per pathogen', () => {
  const measures = covidMeasures(CT.signals, CT.presented, PROVENANCE);
  assert.deepEqual(measures.map((m) => [m.key, m.direction, m.weekEnding]), [['edVisits', 'flat', '2026-10-03'], ['wastewater', 'up', '2026-10-03']]);
  // The model's own COVID-19 trend for Connecticut is ED-first and so hides the wastewater movement.
  assert.equal(CT.presented.pathogens.covid.trend.source, 'edVisits');
  assert.equal(CT.presented.pathogens.covid.trend.direction, 'flat');
});

test('a measurement with no usable series, or non-comparable history, is not given a direction', () => {
  const noEd = liveSignals('WY', { edCovid: null });
  assert.deepEqual(covidMeasures(noEd.signals, noEd.presented, PROVENANCE).map((m) => m.key), ['wastewater']);
  const changed = structuredClone(WY.signals);
  changed.pathogens.covid.provenance.metrics.wastewater.comparableHistory = false;
  const m = covidMeasures(changed, WY.presented, PROVENANCE).find((x) => x.key === 'wastewater');
  assert.equal(m.direction, 'unknown');
  assert.equal(m.trend.reason, 'changing-coverage');
});

test('without a current COVID-19 reading there is no comparison, only CDC’s own card', () => {
  // A reading's own provenance outranks the page's, so staleness has to be in the reading itself.
  const stale = { ...PROVENANCE, now: '2026-12-31T00:00:00Z' };
  const old = presentationModel(computeModel(WY.signals, stale), stale);
  assert.deepEqual(covidMeasures(WY.signals, old, stale), []);
  assert.deepEqual(covidMeasures({}, WY.presented, PROVENANCE), []);
  assert.deepEqual(covidMeasures(WY.signals, {}, PROVENANCE), []);
  const html = epidemicTrendBlock({ state: find('WY'), plan, signals: null, model: null, provenance: PROVENANCE });
  assert.match(html, /data-status="shown"/);
  assert.doesNotMatch(html, /epi__compare|How the COVID-19 signals compare/);
});

// --- states that must not show a category ---------------------------------- //

test('Iowa: no category, CDC’s documented gap and its source, and no implication about illness', () => {
  const html = epidemicTrendBlock({ state: find('IA'), plan, provenance: PROVENANCE });
  const text = plain(html);
  assert.match(html, /data-status="withheld"/);
  assert.doesNotMatch(html, /data-category|Likely growing|probability|reproduction number/);
  assert.match(text, /Not shown for Iowa/);
  assert.match(text, /terminated on May 6, 2026/);
  assert.match(text, /May 9, 2026 and later show as Data Unavailable/);
  assert.match(html, /href="https:\/\/www\.cdc\.gov\/respiratory-viruses\/data\/activity-levels\.html" rel="noopener">Source: CDC<\/a>/);
  assert.match(text, /not evidence that COVID-19 is rising, falling or low/);
});

test('South Dakota is withheld on CDC’s statement that no ED data are available', () => {
  assert.match(plain(epidemicTrendBlock({ state: find('SD'), plan, provenance: PROVENANCE })), /no emergency-department visit data are available for South Dakota/);
});

test('a state with no ED series of its own is withheld with a generic reason', () => {
  const p = planWith({ NV: stubEntry({ status: 'missing', contributes: false }) });
  const text = plain(epidemicTrendBlock({ state: find('NV'), plan: p, provenance: PROVENANCE }));
  assert.match(text, /does not currently have a COVID-19 emergency-department series for Nevada that passes its checks/);
  assert.doesNotMatch(text, /Source: CDC/);
});

test('a state CDC did not estimate says so, and that this is not “not changing”', () => {
  const data = parseEpidemicTrend(fixture(), { now: NOW }).data;
  delete data.states.AZ;
  data.notEstimated = { AZ: 'low_data' };
  const p = planEpidemicTrend(data, { models: new Map(states.map((st) => [st.abbr, stubEntry()])), provenance: PROVENANCE });
  const html = epidemicTrendBlock({ state: find('AZ'), plan: p, provenance: PROVENANCE });
  assert.match(html, /data-status="not-estimated"/);
  assert.match(plain(html), /CDC did not publish an epidemic-trend estimate for Arizona in its report dated Oct 7, 2026/);
  assert.match(plain(html), /“Not estimated” is not the same as “not changing”/);
  assert.doesNotMatch(html, /data-category/);
});

test('nothing is rendered without a plan, without a record, or for a sample snapshot', () => {
  assert.equal(epidemicTrendBlock({ state: find('WY'), plan: null, provenance: PROVENANCE }), '');
  assert.equal(epidemicTrendBlock({ state: find('WY'), plan: undefined, provenance: PROVENANCE }), '');
  const data = parseEpidemicTrend(fixture(), { now: NOW }).data;
  delete data.states.AZ;
  const p = planEpidemicTrend(data, { models: new Map(states.map((st) => [st.abbr, stubEntry()])), provenance: PROVENANCE });
  assert.equal(epidemicTrendBlock({ state: find('AZ'), plan: p, provenance: PROVENANCE }), '');
  assert.equal(planEpidemicTrend(data, { models: new Map(), provenance: { live: false, kind: 'sample' } }), null);
});

// --- house rules ----------------------------------------------------------- //

test('direction never borrows the severity scale and never uses alarm language', () => {
  for (const abbr of ['WY', 'CT', 'IA', 'SD']) {
    const html = block(abbr);
    assert.doesNotMatch(html, /level-token|data-sev|gauge|meter|Minimal|Very High/, abbr);
    assert.doesNotMatch(plain(html), /\b(surge|surging|outbreak|spike|alarm|danger|skyrocket|you should|we recommend)\b/i, abbr);
  }
});

test('markup is well formed, labelled and free of leaked values', () => {
  for (const abbr of ['WY', 'CT', 'IA']) {
    const html = block(abbr);
    assertBalanced(html, abbr);
    assert.doesNotMatch(html, /undefined|NaN|\[object|null/, abbr);
    assert.match(html, /aria-labelledby="epi-heading"/, abbr);
    assert.equal((html.match(/id="epi-heading"/g) || []).length, 1, abbr);
    assert.equal((html.match(/<h2[\s>]/g) || []).length, 1, abbr);
  }
  assert.match(block('WY'), /<h3[\s>]/);
});

test('no figure is rendered unrounded or in a different form from the record', () => {
  const text = plain(block('CT'));
  assert.doesNotMatch(text, /0\.9045|0\.8213|1\.0019|0\.028\b/, 'raw upstream precision stays out of the page');
  assert.match(text, /0\.90, with a 95% interval of 0\.82 to 1\.00/);
});

// --- the national line ----------------------------------------------------- //

test('the home line states the report date, CDC’s national category and counts that add up', () => {
  const html = epidemicTrendHomeLine(plan);
  const text = plain(html);
  assert.match(html, /data-block="epidemic-trend-national"/);
  assert.match(text, /report dated Oct 7, 2026; estimated from emergency-department data through Oct 6, 2026/);
  assert.match(text, /The U\.S\. as a whole is classified as not changing/);
  assert.match(text, /In 49 of 51 jurisdictions \(the 50 states and DC\), FluTrack shows CDC’s category: 10 are growing or likely growing, 25 not changing and 14 declining or likely declining\./);
  assert.match(text, /The other 2 are withheld or have no CDC estimate; each state page says why\./);
  assert.match(text, /direction only, not how much COVID-19 is circulating/);
  assert.equal(plan.counts.up + plan.counts.flat + plan.counts.down, plan.counts.shown);
  assertBalanced(html, 'home line');
  assert.doesNotMatch(text, /\b(surge|outbreak|spike|alarm)\b/i);
});

test('the home line uses singular grammar, drops a missing national row, and says nothing when nothing is shown', () => {
  const mini = {
    reportDate: '2026-10-07', trainingDataEnd: '2026-10-06', national: null,
    counts: { shown: 3, up: 1, flat: 1, down: 1 },
    byState: new Map(['AA', 'BB', 'CC', 'DD'].map((k) => [k, {}])),
  };
  const text = plain(epidemicTrendHomeLine(mini));
  assert.match(text, /In 3 of 4 jurisdictions.*: 1 is growing or likely growing, 1 not changing and 1 declining or likely declining\./);
  assert.match(text, /The other 1 is withheld or has no CDC estimate; each state page says why\./);
  assert.doesNotMatch(text, /The U\.S\. as a whole/);
  const noRest = { ...mini, byState: new Map(['AA', 'BB', 'CC'].map((k) => [k, {}])) };
  assert.doesNotMatch(plain(epidemicTrendHomeLine(noRest)), /The other/);
  const noNationalPlan = planWith({}, (p) => { p.rows = p.rows.filter((r) => r.location_type !== 'national'); });
  assert.doesNotMatch(plain(epidemicTrendHomeLine(noNationalPlan)), /The U\.S\. as a whole/);
  assert.equal(epidemicTrendHomeLine(null), '');
  assert.equal(epidemicTrendHomeLine({ counts: { shown: 0 }, byState: new Map() }), '');
});

// --- page integration ------------------------------------------------------ //

function pageContext(epidemicTrend) {
  const generic = (() => {
    const signals = {
      weekEnding: '2026-10-03', ariLevel: 1, edCombinedSeries: [1, 1.1, 1.2, 1.5], wastewaterSeries: [], positivityCombined: null, provenance: PROVENANCE,
      pathogens: {
        influenza: { edPercentSeries: [0.2, 0.2, 0.3, 0.4], wastewaterSeries: [], positivitySeries: [] },
        covid: { edPercentSeries: [0.5, 0.5, 0.5, 0.5], wastewaterSeries: [], positivitySeries: [] },
        rsv: { edPercentSeries: [0.3, 0.2, 0.2, 0.1], wastewaterSeries: [], positivitySeries: [] },
      },
    };
    return { model: computeModel(signals, PROVENANCE), signals };
  })();
  const models = new Map(states.map((st) => [st.abbr, generic]));
  models.set('WY', { model: WY.model, signals: WY.signals });
  models.set('CT', { model: CT.model, signals: CT.signals });
  return {
    site, disclaimers, states, weekEnding: '2026-10-03', provenance: PROVENANCE, models, render: { stateChip },
    national: { state: { name: 'United States', abbr: 'US', slug: '' }, model: generic.model, signals: generic.signals },
    epidemicTrend,
  };
}

test('the state page places the block after “By virus” and before the ad slot, and only when there is a plan', () => {
  const withPlan = statePage(pageContext(plan), find('CT')).body;
  const byVirus = withPlan.indexOf('data-region="pathogen-tiles"');
  const blockAt = withPlan.indexOf('data-block="epidemic-trend"');
  const adAt = withPlan.indexOf('ad-slot', blockAt);
  const signalsAt = withPlan.indexOf('data-region="signal-rows"');
  assert.ok(byVirus > 0 && blockAt > byVirus && adAt > blockAt && signalsAt > blockAt, 'order: by virus → CDC trend → ad slot → what the data shows');
  assert.equal((withPlan.match(/data-block="epidemic-trend"/g) || []).length, 1);
  assert.doesNotMatch(statePage(pageContext(null), find('CT')).body, /epidemic-trend/);
  assert.doesNotMatch(statePage(pageContext(undefined), find('CT')).body, /epidemic-trend/);
});

test('the state page leaves the hydrated regions untouched: the block is not a data-region', () => {
  const body = statePage(pageContext(plan), find('WY')).body;
  assert.doesNotMatch(body.match(/<section class="epi"[^>]*>/)[0], /data-region/);
});

test('the home page carries the national line in the United States section, and only with a plan', () => {
  const html = home(pageContext(plan)).body;
  const sectionAt = html.indexOf('<h2>United States activity</h2>');
  const lineAt = html.indexOf('data-block="epidemic-trend-national"');
  const mapAt = html.indexOf('data-region="us-map"');
  assert.ok(sectionAt > 0 && lineAt > sectionAt && mapAt > lineAt);
  assert.doesNotMatch(home(pageContext(null)).body, /epidemic-trend/);
});

test('the shipped state page for an unaffected state is identical with and without the plan', () => {
  const ctxA = pageContext(plan);
  const ctxB = pageContext(null);
  const strip = (html) => html.replace(/<section class="epi"[\s\S]*?<\/section>/, '');
  const arizona = find('AZ');
  assert.equal(strip(statePage(ctxA, arizona).body), strip(statePage(ctxB, arizona).body));
  assert.equal(statePage(ctxA, arizona).description, statePage(ctxB, arizona).description);
  assert.deepEqual(statePage(ctxA, arizona).jsonld, statePage(ctxB, arizona).jsonld, 'structured data is not changed by the block');
});

// --- the content that explains it ------------------------------------------ //

import methodology from '../build/pages/content/methodology.mjs';
import dataSources from '../build/pages/content/data-sources.mjs';
import faq from '../build/pages/content/faq.mjs';
import changelog from '../build/pages/content/changelog.mjs';
import { CATEGORIES, DOCUMENTED_ED_GAPS, MAX_REPORT_AGE_DAYS } from '../build/lib/epidemic-trend.mjs';

const contentCtx = () => pageContext(plan);

test('the methodology page explains the signal, and its table and limits come from the code', () => {
  const page = methodology(contentCtx());
  const text = plain(page.body);
  assert.match(page.body, /<h2 id="epidemic-trend">/);
  for (const c of Object.values(CATEGORIES)) {
    const band = c.band.charAt(0).toUpperCase() + c.band.slice(1);
    assert.ok(text.includes(`${c.label} ${band}`), `table row for ${c.label}`);
  }
  assert.ok(text.includes(`A report more than ${MAX_REPORT_AGE_DAYS} days old is not shown`));
  for (const abbr of Object.keys(DOCUMENTED_ED_GAPS)) assert.ok(text.includes(states.find((s) => s.abbr === abbr).name), abbr);
  assert.match(text, /not an input to the combined respiratory index and cannot change it/);
  assert.match(text, /direction only and do not reflect the burden of disease/);
  assert.match(text, /not independent of the emergency-department share/i);
  assert.match(text, /left out rather than filled with sample values/);
  assert.match(text, /\/data\/epidemic-trends\.json/);
  assert.match(text, /Rt below 1 does not mean transmission is low, only that infections are declining/);
});

test('the sources page lists the feed, why it is fetched directly, and the October 9 gaps', () => {
  const text = plain(dataSources(contentCtx()).body);
  assert.match(text, /CDC epidemic trends \(Rt\) — COVID-19/);
  assert.match(text, /Direction only, not the burden of disease/);
  assert.match(text, /not a Socrata dataset and is not on the ingestion service, so the build fetches it directly from cdc\.gov/);
  assert.match(text, /Your browser never fetches it/);
  assert.match(text, /never replaced by sample values/);
  assert.match(text, /Documented CDC surveillance gaps — October 9, 2026/);
  assert.match(text, /South Dakota emergency-department data.*no emergency-department visit data are available for South Dakota/);
  assert.match(text, /“not estimated” is not the same as “not changing”/);
  // The existing October 2 notes are untouched.
  assert.match(text, /Iowa's NSSP feed ended on May 6, 2026.*May 9, 2026 and later show Data Unavailable/);
});

test('the FAQ answers both questions a reader of the new block would ask, in the structured data too', () => {
  const page = faq(contentCtx());
  const qs = ['What does “Likely growing” or “Declining” on a state page mean?', "Why can the CDC's trend and a wastewater or emergency-department trend point in different directions?"];
  for (const q of qs) assert.ok(page.body.includes(q.replace(/&/g, '&amp;').replace(/"/g, '&quot;')) || plain(page.body).includes(q), q);
  const ld = page.jsonld.find((x) => x['@type'] === 'FAQPage');
  const asked = ld.mainEntity.map((e) => e.name);
  for (const q of qs) assert.ok(asked.includes(q), `FAQPage JSON-LD should include: ${q}`);
  const answer = ld.mainEntity.find((e) => e.name === qs[0]).acceptedAnswer.text;
  assert.match(answer, /not a FluTrack rating/);
  assert.match(answer, /never adds it to the index/);
});

test('the changelog records the change as append-only history that altered no published reading', () => {
  const html = changelog(contentCtx()).body;
  const text = plain(html);
  assert.match(text, /The CDC’s COVID-19 epidemic trend, shown separately from the index/);
  assert.match(text, /never part of the combined respiratory index, and no existing reading changed/);
  const entryAt = html.indexOf('The CDC’s COVID-19 epidemic trend');
  const next = html.indexOf('<li', entryAt + 10);
  assert.doesNotMatch(html.slice(entryAt, next === -1 ? undefined : next), /Affected published readings/);
});

test('every internal link the block and home line add resolves to an anchor that exists', () => {
  const targets = new Set();
  for (const html of [block('WY'), block('IA'), epidemicTrendHomeLine(plan)]) for (const m of html.matchAll(/href="(\/[^"]*)"/g)) targets.add(m[1]);
  assert.deepEqual([...targets], ['/methodology/#epidemic-trend']);
  assert.match(methodology(contentCtx()).body, /id="epidemic-trend"/);
});
