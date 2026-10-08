import { escapeHtml, formatDate, formatChange } from '../../src/scripts/util.js';
import { threatCard, pathogenTiles, signalRows, levelToken, trendChip } from '../../src/scripts/render.js';
import { signupBand, trendDisclaimer, breadcrumbs, adSlot, seasonKitModule } from '../lib/partials.mjs';
import { breadcrumbLd, statePageLd, faqLd } from '../lib/seo.mjs';
import { metros } from './metro.mjs';
import { takeawaysBlock } from '../../src/scripts/takeaways.js';

/** Build a per-state report without changing its data or URL contract. */
export function statePage(ctx, state) {
  const { site, weekEnding, provenance } = ctx;
  const entry = ctx.models.get(state.abbr);
  const model = entry.model;
  const signals = entry.signals;
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'States', path: '/states/' },
    { name: state.name, path: `/state/${state.slug}/` },
  ];
  const faqs = stateFaqs(state);
  const others = neighborsFor(ctx, state);
  // Every other state in the HHS region (neighborsFor caps its list at six).
  const peers = ctx.states
    .filter((s) => s.hhsRegion === state.hhsRegion && s.abbr !== state.abbr)
    .map((s) => ({ name: s.name, level: ctx.models.get(s.abbr)?.model.level }));

  const body = `
  <div class="status-strip" data-sticky-status aria-label="${escapeHtml(state.name)} report status">
    <span class="status-strip__state">${escapeHtml(state.name)}</span>
    <span class="status-strip__level" data-region="sticky-level" data-sev="${model.level ?? 0}">${levelToken(model.level, model.label)}</span>
    <span data-region="sticky-trend">${trendChip(model.trend)}</span>
  </div>
  <section class="section section--tight state-masthead" data-state-masthead>
    <div class="container">
      ${breadcrumbs(crumbs)}
      <h1>Flu in ${escapeHtml(state.name)}: current activity level &amp; weekly trend</h1>
      <p class="lede" style="margin-top: var(--space-sm); max-width: 44rem">Current influenza (flu) activity in ${escapeHtml(state.name)} for the 2026–27 season, in plain English — plus RSV and COVID-19 levels, built from public-domain CDC surveillance data and refreshed weekly.</p>
      <p class="text-secondary" style="margin-top: var(--space-md); max-width: 48rem">${escapeHtml(stateIntro(state, others))}</p>
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
          <div data-region="takeaways">${takeawaysBlock(state, model, signals, { live: Boolean(provenance?.live), peers, weekEnding })}</div>
          <div>
            <div class="section-head section-rule">
              <h2>By virus</h2>
              <p class="text-secondary">How each respiratory virus is contributing in ${escapeHtml(state.name)} right now.</p>
            </div>
            <div data-region="pathogen-tiles">${pathogenTiles(model)}</div>
          </div>
          ${adSlot('state-by-virus')}
          <div>
            <div class="section-head section-rule"><h2 style="font-size: var(--step-2)">What the data shows</h2></div>
            <div data-region="signal-rows">${signalRows(signals)}</div>
          </div>
          ${adSlot('state-signals')}
          <div>
            <div class="section-head section-rule"><h2 style="font-size: var(--step-2)">Nearby states</h2></div>
            <div class="comparison-strip">${others.map((s) => ctx.render.stateChip(s, ctx.models.get(s.abbr).model)).join('')}</div>
          </div>
          ${seasonKitModule()}
        </div>

        <aside class="state-rail" aria-label="More about ${escapeHtml(state.name)}">
          <div class="card">
            <h2 style="font-size: var(--step-1)">At a glance</h2>
            <dl class="stack" style="--flow: var(--space-sm); margin-top: var(--space-sm)">
              <div class="between"><dt class="text-secondary">Threat level</dt><dd data-region="glance-level"><strong>${escapeHtml(model.label)}</strong></dd></div>
              <div class="between"><dt class="text-secondary">Trend</dt><dd data-region="glance-trend">${model.trend.direction !== 'flat' ? `${escapeHtml(model.trend.label)} ${escapeHtml(formatChange(model.trend.changePct))}` : escapeHtml(model.trend.label)}</dd></div>
              <div class="between"><dt class="text-secondary">Data as of</dt><dd data-region="glance-week">${escapeHtml(formatDate(weekEnding))}</dd></div>
            </dl>
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
          ${metrosFor(state).map((m) => `<div class="card">
            <h2 style="font-size: var(--step-1)">What's going around in ${escapeHtml(m.titleName || m.name)}</h2>
            <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">The metro read for ${escapeHtml(m.name)}, from the same public CDC data.</p>
            <a class="btn btn--block" href="/metro/${m.slug}/">Open the ${escapeHtml(m.name)} page</a>
          </div>`).join('')}
        </aside>
      </div>
    </div>
  </section>

  <section class="section below-fold" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container container--narrow">
      <h2 style="font-size: var(--step-2)">${escapeHtml(state.name)}: common questions</h2>
      <div style="margin-top: var(--space-md)">${faqs.map((f) => `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><div class="faq-item__body">${f.a}</div></details>`).join('')}</div>
    </div>
  </section>

  ${signupBand({ compact: true })}
  `;

  return {
    title: `Flu in ${state.name}: current activity level & weekly trend`,
    description: `Current flu (influenza) activity level and weekly trend for ${state.name}, plus RSV and COVID-19, from public-domain CDC surveillance data. Updated weekly, 2026–27 season. Not medical advice.`,
    path: `/state/${state.slug}/`,
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
    jsonld: [breadcrumbLd(crumbs), statePageLd(state, weekEnding), faqLd(faqs.map((f) => ({ q: f.q, a: stripTags(f.a) })))],
  };
}

function stateIntro(state, neighbors) {
  const names = neighbors.slice(0, 4).map((s) => s.name);
  const neighborText = names.length ? ` You can also compare nearby states such as ${listJoin(names)}.` : '';
  return `FluTrack blends four public CDC surveillance signals for ${state.name} — emergency-department visits, wastewater viral activity, laboratory test positivity, and the Acute Respiratory Illness (ARI) activity level — into the single, plain-English influenza threat level shown here, refreshed every week of the season.${neighborText}`;
}
function listJoin(items) { if (items.length <= 1) return items[0] || ''; return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`; }
function neighborsFor(ctx, state) { return ctx.states.filter((s) => s.hhsRegion === state.hhsRegion && s.abbr !== state.abbr).slice(0, 6); }
function metrosFor(state) { return metros.filter((m) => m.stateAbbr === state.abbr); }
function stateFaqs(state) {
  return [
    { q: `How much flu is going around in ${state.name} right now?`, a: `<p>The current combined flu, RSV and COVID-19 threat level for ${escapeHtml(state.name)} — and whether it is rising, falling or holding steady — is shown at the top of this page. It reflects the CDC's latest public surveillance data and is a directional weekly trend, not a real-time case count.</p>` },
    { q: `When is flu season in ${state.name}?`, a: `<p>The 2026–27 respiratory season runs from early October 2026 through late May 2027. Flu activity in ${escapeHtml(state.name)} typically stays low in October, climbs from November through the winter peak, and fades by spring. This page updates every week of the season.</p>` },
    { q: `Where does this ${escapeHtml(state.name)} data come from?`, a: `<p>From the CDC's public-domain surveillance systems — emergency-department visits (NSSP), wastewater viral activity (NWSS) and laboratory test positivity (NREVSS). See our <a href="/methodology/">methodology</a> and <a href="/data-sources/">data sources</a>.</p>` },
    { q: `How often is the ${state.name} flu level updated?`, a: `<p>Weekly. CDC surveillance systems publish on Fridays, and reported data typically reflects illness from one to two weeks earlier — so FluTrack emphasizes the trend rather than a single day's number.</p>` },
    { q: 'Is this medical advice?', a: '<p>No. FluTrack is an independent data-visualization utility and is not affiliated with the CDC. The information here is general and is not a substitute for professional medical advice. For guidance about your health, consult a qualified provider.</p>' },
  ];
}
function stripTags(html) { return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
