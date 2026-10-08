import { escapeHtml, formatDate, formatChange } from '../../src/scripts/util.js';
import { threatCard, pathogenTiles, signalRows, levelToken, trendChip } from '../../src/scripts/render.js';
import { signupBand, trendDisclaimer, breadcrumbs, adSlot, seasonKitModule } from '../lib/partials.mjs';
import { breadcrumbLd, statePageLd, faqLd } from '../lib/seo.mjs';

/**
 * Metro "what's going around" pages. The CDC publishes no combined
 * metro-level respiratory index, so each metro page renders its state's
 * public-domain surveillance picture — labeled as state-level throughout —
 * alongside the official metro-specific sources that do exist (state health
 * department reports, wastewater surveillance). Editorial voice and honesty
 * rules match state.mjs exactly: no medical guidance, no fabricated local
 * data, everything dated to the snapshot week.
 */

export const metros = [
  {
    slug: 'atlanta',
    name: 'Atlanta',
    stateAbbr: 'GA',
    context: `Georgia's public respiratory surveillance is published at state level, and the Georgia Department of Public Health (dph.ga.gov) posts weekly flu and respiratory summary reports during season. The CDC's wastewater viral activity tracker (part of NWSS) also covers participating Georgia sewersheds, which is the closest public signal to neighborhood-level. Until a combined metro index exists, the state-level picture below is the most complete honest answer to "what's going around in Atlanta."`,
  },
  {
    slug: 'boston',
    name: 'Boston',
    stateAbbr: 'MA',
    context: `Massachusetts publishes weekly respiratory surveillance through the Department of Public Health (mass.gov/dph). Boston has something most metros don't: the Massachusetts Water Resources Authority's wastewater tracking at the Deer Island treatment plant, a public, metro-scale viral signal that has run since 2020 and often moves ahead of case reporting. The state-level picture below is the combined flu, RSV and COVID-19 read; MWRA wastewater is the metro-scale complement.`,
  },
  {
    slug: 'bay-area',
    name: 'the SF Bay Area',
    titleName: 'SF Bay Area',
    stateAbbr: 'CA',
    context: `California's respiratory surveillance is published by the state Department of Public Health (cdph.ca.gov), with wastewater viral activity tracked through the CDC's NWSS network across participating Bay Area sewersheds. Several county health departments across the region also publish local respiratory snapshots. The state-level picture below is the combined flu, RSV and COVID-19 read for California — the most complete public picture that covers the whole Bay Area with one consistent method.`,
  },
];

export function metroPage(ctx, metro) {
  const { site, weekEnding, provenance } = ctx;
  const state = ctx.states.find((s) => s.abbr === metro.stateAbbr);
  const entry = ctx.models.get(state.abbr);
  const model = entry.model;
  const signals = entry.signals;
  const displayName = metro.titleName || metro.name;
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'States', path: '/states/' },
    { name: state.name, path: `/state/${state.slug}/` },
    { name: displayName, path: `/metro/${metro.slug}/` },
  ];
  const faqs = metroFaqs(metro, state);

  const body = `
  <div class="status-strip" data-sticky-status aria-label="${escapeHtml(displayName)} report status">
    <span class="status-strip__state">${escapeHtml(displayName)} · ${escapeHtml(state.name)}</span>
    <span class="status-strip__level" data-region="sticky-level" data-sev="${model.level ?? 0}">${levelToken(model.level, model.label)}</span>
    <span data-region="sticky-trend">${trendChip(model.trend)}</span>
  </div>
  <section class="section section--tight state-masthead" data-state-masthead>
    <div class="container">
      ${breadcrumbs(crumbs)}
      <h1>What's going around in ${escapeHtml(displayName)}: flu, RSV &amp; COVID-19</h1>
      <p class="lede" style="margin-top: var(--space-sm); max-width: 44rem">The respiratory picture for ${escapeHtml(displayName)}, from public-domain CDC surveillance — honestly labeled: the combined index is published at ${escapeHtml(state.name)} state level, refreshed weekly.</p>
      <p class="text-secondary" style="margin-top: var(--space-md); max-width: 48rem">${escapeHtml(metro.context)}</p>
    </div>
  </section>

  <section class="section" style="padding-top: var(--space-xl)">
    <div class="container">
      <div class="state-layout">
        <div class="stack" style="--flow: var(--space-2xl)">
          <div data-region="threat-card" data-state="${escapeHtml(state.abbr)}" data-week="${escapeHtml(weekEnding)}">
            ${threatCard(state, model, { weekEnding, provenance })}
          </div>
          ${trendDisclaimer()}
          <div>
            <div class="section-head section-rule">
              <h2>By virus</h2>
              <p class="text-secondary">How each respiratory virus is contributing across ${escapeHtml(state.name)} right now — the public data that covers ${escapeHtml(displayName)}.</p>
            </div>
            <div data-region="pathogen-tiles">${pathogenTiles(model)}</div>
          </div>
          ${adSlot('metro-by-virus')}
          <div>
            <div class="section-head section-rule"><h2 style="font-size: var(--step-2)">What the data shows</h2></div>
            <div data-region="signal-rows">${signalRows(signals)}</div>
          </div>
          ${adSlot('metro-signals')}
          ${seasonKitModule()}
        </div>

        <aside class="state-rail" aria-label="More about ${escapeHtml(displayName)}">
          <div class="card">
            <h2 style="font-size: var(--step-1)">At a glance</h2>
            <dl class="stack" style="--flow: var(--space-sm); margin-top: var(--space-sm)">
              <div class="between"><dt class="text-secondary">Threat level</dt><dd data-region="glance-level"><strong>${escapeHtml(model.label)}</strong> <span class="text-secondary">(${escapeHtml(state.name)})</span></dd></div>
              <div class="between"><dt class="text-secondary">Trend</dt><dd data-region="glance-trend">${model.trend.direction !== 'flat' ? `${escapeHtml(model.trend.label)} ${escapeHtml(formatChange(model.trend.changePct))}` : escapeHtml(model.trend.label)}</dd></div>
              <div class="between"><dt class="text-secondary">Data as of</dt><dd data-region="glance-week">${escapeHtml(formatDate(weekEnding))}</dd></div>
            </dl>
          </div>
          <div class="card">
            <h2 style="font-size: var(--step-1)">The full ${escapeHtml(state.name)} report</h2>
            <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">Every signal behind this level, on the state page.</p>
            <a class="btn btn--block" href="/state/${state.slug}/">Open ${escapeHtml(state.name)}</a>
          </div>
          <div class="card">
            <h2 style="font-size: var(--step-1)">Get ${escapeHtml(state.name)} alerts</h2>
            <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">We'll email you when activity starts climbing here.</p>
            <a class="btn btn--primary btn--block" href="/alerts/?state=${escapeHtml(state.abbr)}">Set up surge alerts</a>
          </div>
          <div class="card">
            <h2 style="font-size: var(--step-1)">US flu map</h2>
            <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">See how ${escapeHtml(state.name)} compares with every other state right now.</p>
            <a class="btn btn--block" href="/states/">Open the flu map</a>
          </div>
        </aside>
      </div>
    </div>
  </section>

  <section class="section below-fold" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container container--narrow">
      <h2 style="font-size: var(--step-2)">${escapeHtml(displayName)}: common questions</h2>
      <div style="margin-top: var(--space-md)">${faqs.map((f) => `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><div class="faq-item__body">${f.a}</div></details>`).join('')}</div>
    </div>
  </section>

  ${signupBand({ compact: true })}
  `;

  // Hoisted so the WebPage JSON-LD describes THIS page with the same strings the
  // <head> uses, instead of inheriting the state page's identity.
  const title = `What's Going Around in ${displayName}: Flu, RSV & COVID`;
  const description = `Is flu, RSV or COVID-19 going around in ${displayName}? Current ${state.name}-level respiratory threat level and weekly trend from public-domain CDC surveillance, plus metro-specific official sources. Not medical advice.`;
  const path = `/metro/${metro.slug}/`;

  return {
    title,
    description,
    path,
    body,
    scripts: ['/assets/js/app.js', '/assets/js/sticky-status.js'],
    ogType: 'article',
    // No per-page ogImage: layout.mjs falls back to /assets/og-default.png.
    // The per-state card is an SVG, and no major social or chat consumer renders
    // SVG in a link preview — so pointing at it produced a BLANK card on every
    // share, while the page still declared og:image:width 1200 / height 630.
    // A rasterised per-state PNG is not the fix either: the card encodes a
    // threat reading that changes weekly, so a committed PNG would freeze it and
    // start contradicting the page. A dataless brand card is correct until the
    // cards are generated per request.
    jsonld: [breadcrumbLd(crumbs), statePageLd(state, weekEnding, { path, name: title, description }), faqLd(faqs.map((f) => ({ q: f.q, a: stripTags(f.a) })))],
  };
}

function metroFaqs(metro, state) {
  const dn = metro.titleName || metro.name;
  return [
    { q: `What sickness is going around in ${dn} right now?`, a: `<p>The combined flu, RSV and COVID-19 picture shown at the top of this page comes from ${escapeHtml(state.name)}-level CDC surveillance — the most complete public read that covers ${escapeHtml(dn)} with one consistent method. It is a directional weekly trend, not a real-time case count. For metro-specific detail, the official sources listed above go deeper than the combined index.</p>` },
    { q: `Is this data specific to ${dn} itself?`, a: `<p>No — and we label that plainly. The CDC publishes no combined metro-level respiratory index, so the threat level here is the ${escapeHtml(state.name)} state reading. Metro-scale public signals that do exist, like wastewater surveillance, are linked in the introduction above.</p>` },
    { q: `Where does the data come from?`, a: `<p>From the CDC's public-domain surveillance systems — emergency-department visits (NSSP), wastewater viral activity (NWSS) and laboratory test positivity (NREVSS). See our <a href="/methodology/">methodology</a> and <a href="/data-sources/">data sources</a>.</p>` },
    { q: `How often is it updated?`, a: `<p>Weekly. CDC surveillance systems publish on Fridays, and reported data typically reflects illness from one to two weeks earlier — so FluTrack emphasizes the trend rather than a single day's number.</p>` },
    { q: 'Is this medical advice?', a: '<p>No. FluTrack is an independent data-visualization utility and is not affiliated with the CDC. The information here is general and is not a substitute for professional medical advice. For guidance about your health, consult a qualified provider.</p>' },
  ];
}
function stripTags(html) { return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
