import { test } from 'node:test';
import assert from 'node:assert/strict';
import home from '../build/pages/home.mjs';
import { metroPage, metros } from '../build/pages/metro.mjs';
import methodology from '../build/pages/content/methodology.mjs';
import dataSources from '../build/pages/content/data-sources.mjs';
import faq from '../build/pages/content/faq.mjs';
import statesPage from '../build/pages/content/states.mjs';
import season from '../build/pages/content/season.mjs';
import medicalDisclaimer from '../build/pages/content/medical-disclaimer.mjs';
import editorialPolicy from '../build/pages/content/editorial-policy.mjs';
import { site, disclaimers } from '../build/lib/site.mjs';
import { datasetLd, webApplicationLd } from '../build/lib/seo.mjs';
import { layout } from '../build/lib/layout.mjs';
import { states } from '../src/scripts/states-data.js';
import { computeModel } from '../src/scripts/model.js';
import { stateChip } from '../src/scripts/render.js';
import { escapeHtml } from '../src/scripts/util.js';

function context(kind = 'live', overrides = {}) {
  const weekEnding = overrides.weekEnding || '2026-09-26';
  const provenance = {
    kind, live: kind === 'live', weekEnding, now: '2026-10-09T12:00:00Z',
    sources: ['NSSP Emergency Department Visits', 'Acute Respiratory Illness (ARI) Activity Level'],
    ...overrides.provenance,
  };
  const signals = {
    weekEnding, ariLevel: 1, edCombinedSeries: [1, 1.1, 1.2, 1.5],
    wastewaterSeries: [], positivityCombined: null, provenance,
    pathogens: {
      influenza: { edPercentSeries: [0.2, 0.2, 0.3, 0.4], wastewaterSeries: [], positivitySeries: [] },
      covid: { edPercentSeries: [0.5, 0.5, 0.5, 0.5], wastewaterSeries: [], positivitySeries: [] },
      rsv: { edPercentSeries: [0.3, 0.2, 0.2, 0.1], wastewaterSeries: [], positivitySeries: [] },
    },
    ...overrides.signals,
  };
  const model = computeModel(signals, provenance);
  return {
    site, disclaimers, states, weekEnding, provenance,
    models: new Map(states.map((s) => [s.abbr, { model, signals }])),
    national: { state: { name: 'United States', abbr: 'US', slug: '' }, model, signals },
    render: { stateChip },
  };
}

function plain(html) { return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

test('public source explanations distinguish implemented live inputs and unavailable positivity', () => {
  const ctx = context();
  for (const page of [home(ctx), metroPage(ctx, metros[0]), methodology(ctx), dataSources(ctx), faq(ctx), season(ctx), medicalDisclaimer(ctx)]) {
    assert.match(plain(page.body), /Acute Respiratory Illness/i, page.path);
    assert.match(plain(page.body), /positivity.*(?:no live adapter|unavailable live)|(?:no live adapter|unavailable live).*positivity/i, page.path);
    assert.match(plain(page.body), /(?:illustrative|labeled) sample/i, page.path);
    assert.match(plain(page.body), /mean of up to three prior observations/i, page.path);
  }
  assert.match(datasetLd().description, /NREVSS positivity is unavailable live/);
  assert.doesNotMatch(webApplicationLd().description, /this week|current|city hospital admissions/i);
  const documentedSources = plain(dataSources(ctx).body);
  assert.match(documentedSources, /updated October 2, 2026.*September 28, 2026.*about 200 sites/);
  assert.match(documentedSources, /This notice alone does not establish why a September 26 observation is missing/);
  assert.match(documentedSources, /Iowa's NSSP feed ended on May 6, 2026.*May 9, 2026 and later show Data Unavailable/);
  assert.match(documentedSources, /Missouri's ARI baseline.*March 2&ndash;8.*separate from FluTrack's editorial index thresholds/);
  assert.match(documentedSources, /provider name or contract notice alone does not establish a dataset's license/);
  for (const page of [dataSources(ctx), faq(ctx), editorialPolicy(ctx)]) {
    assert.match(plain(page.body), /(?:also excludes|also drops) Verily-marked rows/);
    assert.doesNotMatch(plain(page.body), /WastewaterSCAN.*also referenced as SCAN or Verily/);
  }
  const policy = plain(editorialPolicy(ctx).body);
  assert.match(policy, /may ship either a live or sample snapshot/);
  assert.match(policy, /lists the actual contributors and unavailable inputs/);
  assert.match(policy, /direction requires enough comparable history/);
  assert.match(policy, /Explicitly unknown readings remain unverified even inside a live bundle/);
  const seasonalContext = plain(season(ctx).body);
  assert.match(seasonalContext, /national respiratory summary published October 2, 2026.*COVID-19 activity remains elevated in some regions but is declining nationally/);
  assert.match(seasonalContext, /not a current-week measurement or a trend for the selected state/);
  assert.match(season(ctx).body, /href="https:\/\/www\.cdc\.gov\/respiratory-viruses\/data\/"/);
});

test('metro body, metadata and FAQ retain state geography and separate measurements', () => {
  const ctx = context();
  for (const metro of metros) {
    const page = metroPage(ctx, metro);
    const state = states.find((s) => s.abbr === metro.stateAbbr);
    assert.match(page.body, /not an independent city measurement/);
    assert.ok(page.description.includes(`${state.name} state surveillance`));
    assert.match(page.description, /No independent city measurement/);
    assert.doesNotMatch(page.body, /most complete public|contributing.*right now|published at.*state level/);
    assert.match(page.body, /Hospital admissions, case counts and test positivity are separate measures/);
    const webPage = page.jsonld.find((node) => node['@type'] === 'WebPage');
    assert.equal(webPage.description, page.description);
    assert.equal(webPage.temporalCoverage, '2026-09-26');
    assert.equal('datePublished' in webPage, false);
    assert.equal('dateModified' in webPage, false);
  }
});

test('visible FAQ answers and FAQ structured data use the same content', () => {
  const ctx = context();
  for (const page of [faq(ctx), methodology(ctx), ...metros.map((metro) => metroPage(ctx, metro))]) {
    const node = page.jsonld.find((item) => item['@type'] === 'FAQPage');
    const visible = [...page.body.matchAll(/<details class="faq-item"><summary>([\s\S]*?)<\/summary><div class="faq-item__body">([\s\S]*?)<\/div><\/details>/g)];
    assert.equal(visible.length, node.mainEntity.length, page.path);
    node.mainEntity.forEach((item, i) => {
      assert.equal(visible[i][1], escapeHtml(item.name), `${page.path}: question ${i}`);
      assert.equal(plain(visible[i][2]), item.acceptedAnswer.text, `${page.path}: answer ${i}`);
    });
  }
});

test('sample and stale metro contexts cannot advertise current city conditions', () => {
  for (const ctx of [context('sample'), context('live', { weekEnding: '2026-08-01' })]) {
    const page = metroPage(ctx, metros[0]);
    assert.doesNotMatch(page.description, /current|this week|right now/i);
    assert.match(page.body, /Sample data|stale/i);
    assert.match(page.body, /sample, missing, insufficient or stale data cannot support a current-week conclusion/);
    assert.match(page.body, /No data does not mean no illness/);
  }
});

test('a missing metro pathogen remains unavailable while state context stays dated', () => {
  const ctx = context('live', { signals: { pathogens: {} } });
  const page = metroPage(ctx, metros[0]);
  const pathogenRegion = page.body.match(/data-region="pathogen-tiles">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || '';
  assert.match(pathogenRegion, /No data/);
  assert.doesNotMatch(pathogenRegion, /Holding steady|Minimal|Low/);
  assert.match(page.body, /Observation period ending/);
});

test('unavailable sources cannot become inputs on the home or metro reading', () => {
  const ctx = context('live', {
    provenance: {
      metrics: {
        edVisits: { status: 'unavailable', contributes: false },
        wastewater: { status: 'unavailable', contributes: false },
        positivity: { status: 'unavailable', contributes: false },
      },
    },
    signals: { positivityCombined: 95, wastewaterSeries: [80, 90, 100] },
  });
  for (const page of [home(ctx), metroPage(ctx, metros[0])]) {
    const ledger = page.body.slice(page.body.indexOf('data-region="signal-rows"'), page.body.indexOf('</section>', page.body.indexOf('data-region="signal-rows"')));
    assert.match(ledger, /Acute respiratory illness activity/);
    assert.doesNotMatch(ledger, /signal-row__name">Combined.*ED visits|signal-row__name">Wastewater|signal-row__name">Laboratory/);
    assert.match(ledger, /positivity is unavailable/);
  }
});

test('metro readings use the selected state instead of a different national trend', () => {
  const ctx = context();
  ctx.national.model = computeModel({ edCombinedSeries: [9, 12, 13, 16], pathogens: {} }, ctx.provenance);
  const page = metroPage(ctx, metros[0]);
  const stateModel = ctx.models.get('GA').model;
  const readout = page.body.match(/id="threat-reading">([^<]+)<\/p>/)?.[1];
  assert.equal(readout, stateModel.label);
  assert.notEqual(readout, ctx.national.model.label);
});

test('national and state map metadata describe dated respiratory coverage, including sample provenance', () => {
  const ctx = context('sample');
  const homepage = home(ctx);
  assert.match(homepage.body, /unweighted rollup of available state signals/);
  assert.match(homepage.body, /data-region="provenance-strip"/);
  const imageAlt = layout(homepage).match(/property="og:image:alt" content="([^"]+)"/)?.[1];
  assert.match(imageAlt, /combined respiratory index.*illustrative U\.S\. map/);
  assert.doesNotMatch(imageAlt, /local respiratory threat|current activity|Minimal|Very High/);
  const page = statesPage(ctx);
  assert.match(page.title, /Respiratory Activity Map/);
  assert.doesNotMatch(page.description, /current|every state.*data/i);
  assert.match(page.body, /Sample data/);
  assert.match(page.body, /observation period ending/);
  assert.match(page.body, /no data does not mean no illness/i);
});

test('static source badges name only actual national contributors, even when other states supplied wastewater', () => {
  const ctx = context('live', { provenance: { sources: ['NSSP Emergency Department Visits', 'NWSS wastewater'] } });
  const page = home(ctx);
  const strip = page.body.match(/data-region="provenance-strip"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
  assert.match(strip, /<span>NSSP<\/span>/);
  assert.doesNotMatch(strip, /<span>NWSS<\/span>/);
});

test('missing home and metro readings never acquire a Minimal severity wrapper', () => {
  const ctx = context('live', { signals: { ariLevel: null, edCombinedSeries: [], wastewaterSeries: [], pathogens: {} } });
  const hero = home(ctx).body.match(/<div class="hero__bg"[^>]*>/)?.[0];
  assert.ok(hero);
  assert.doesNotMatch(hero, /data-sev=/);
  const sticky = metroPage(ctx, metros[0]).body.match(/<span class="status-strip__level"[^>]*>/)?.[0];
  assert.ok(sticky);
  assert.doesNotMatch(sticky, /data-sev=/);
});

test('explicitly unverified inputs retain unknown presentation on home, metro and both static maps', () => {
  const ctx = context('live', { signals: { provenance: { kind: 'unknown', kindExplicit: true } } });
  assert.ok(Number.isFinite(ctx.national.model.level), 'arithmetic remains available for review');
  for (const page of [home(ctx), metroPage(ctx, metros[0]), statesPage(ctx)]) {
    const coloredReadings = [...page.body.matchAll(/<(?:div|span|g|a)[^>]+(?:hero__bg|status-strip__level|class="us-tile|class="state-chip)[^>]*>/g)];
    assert.ok(coloredReadings.length > 0, `${page.path}: inspected the rendered severity wrappers`);
    for (const [element] of coloredReadings) assert.doesNotMatch(element, /data-sev=/, `${page.path}: no severity color on ${element}`);
    if (page.path !== '/states/') {
      assert.match(page.body, /Unverified provenance/);
      const glance = page.body.match(/data-region="glance-level">([\s\S]*?)<\/dd>/)?.[1];
      if (glance) assert.match(glance, /Unknown/);
      assert.doesNotMatch(page.body, /id="threat-reading">(?:Minimal|Low|Moderate|High|Very High)<\/p>/);
    }
  }
});
