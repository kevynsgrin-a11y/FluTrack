import { escapeHtml, formatDate } from '../../src/scripts/util.js';
import { threatCard, pathogenTiles, signalRows, levelToken, trendChip } from '../../src/scripts/render.js';
import { signupBand, trendDisclaimer, breadcrumbs, adSlot, seasonKitModule } from '../lib/partials.mjs';
import { breadcrumbLd, statePageLd, faqLd } from '../lib/seo.mjs';
import { metros } from './metro.mjs';
import { takeawaysBlock } from '../../src/scripts/takeaways.js';
import { stateIntro, weekInBrief, stateFaqs, stateDescription, sourceEvidence } from '../../src/scripts/state-narrative.js';
import { presentationModel } from '../../src/scripts/reading-provenance.js';

/** Build a per-state report without changing its data or URL contract. */
export function statePage(ctx, state) {
  const { site, provenance } = ctx;
  const entry = ctx.models.get(state.abbr);
  const model = presentationModel(entry.model, provenance);
  const signals = entry.signals;
  const weekEnding = signals.weekEnding || ctx.weekEnding;
  const description = stateDescription(state, model, signals, weekEnding, provenance);
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'States', path: '/states/' },
    { name: state.name, path: `/state/${state.slug}/` },
  ];
  const faqs = stateFaqs(state, model, signals, weekEnding, provenance);
  const others = neighborsFor(ctx, state);
  // Every other state in the HHS region (neighborsFor caps its list at six).
  const peers = ctx.states
    .filter((s) => s.hhsRegion === state.hhsRegion && s.abbr !== state.abbr)
    .map((s) => ({ name: s.name, level: ctx.models.get(s.abbr)?.model.level, provenance: ctx.models.get(s.abbr)?.model.provenance, weekEnding: ctx.models.get(s.abbr)?.signals.weekEnding }));

  const body = `
  <div class="status-strip" data-sticky-status aria-label="${escapeHtml(state.name)} report status">
    <span class="status-strip__state">${escapeHtml(state.name)}</span>
    <span class="status-strip__level" data-region="sticky-level" ${Number.isFinite(model.level) ? `data-sev="${model.level}"` : ''}>${levelToken(model.level, model.label)}</span>
    <span data-region="sticky-trend">${trendChip(model.trend, { provenance })}</span>
  </div>
  <section class="section section--tight state-masthead" data-state-masthead>
    <div class="container">
      ${breadcrumbs(crumbs)}
      <h1>Respiratory observations in ${escapeHtml(state.name)}: flu, RSV &amp; COVID-19</h1>
      <p class="lede" style="margin-top: var(--space-sm); max-width: 44rem">A combined respiratory index and separate influenza, RSV and COVID-19 readings from available public-domain CDC surveillance observations. Read the period and provenance before interpreting a level or trend.</p>
      <p class="text-secondary" data-region="state-intro" style="margin-top: var(--space-md); max-width: 48rem">${escapeHtml(stateIntro(state, others, model, signals, provenance))}</p>
    </div>
  </section>

  <section class="section" style="padding-top: var(--space-xl)">
    <div class="container">
      <div class="state-layout">
        <div class="stack" style="--flow: var(--space-2xl)">
          <div data-region="threat-card" data-state="${escapeHtml(state.abbr)}" data-week="${escapeHtml(weekEnding)}">
            ${threatCard(state, model, { weekEnding, provenance })}
          </div>
          ${weekInBrief(state, model, weekEnding, provenance)}
          ${trendDisclaimer()}
          <div data-region="takeaways">${takeawaysBlock(state, model, signals, { live: Boolean(provenance?.live), provenance, peers, weekEnding })}</div>
          <div>
            <div class="section-head section-rule">
              <h2>By virus</h2>
              <p class="text-secondary">Separate pathogen indices for the dated observations in ${escapeHtml(state.name)}. Missing readings do not mean no illness.</p>
            </div>
            <div data-region="pathogen-tiles">${pathogenTiles(model, { weekEnding, provenance })}</div>
          </div>
          ${adSlot('state-by-virus')}
          <div>
            <div class="section-head section-rule"><h2 style="font-size: var(--step-2)">What the data shows</h2></div>
            <div data-region="signal-rows">${signalRows(signals, { model, weekEnding, provenance })}</div>
            <div data-region="source-evidence">${sourceEvidence(signals, model, provenance)}</div>
          </div>
          ${adSlot('state-signals')}
          <div>
            <div class="section-head section-rule"><h2 style="font-size: var(--step-2)">HHS regional states</h2></div>
            <div class="comparison-strip" data-region="neighbor-states">${others.map((s) => ctx.render.stateChip(s, ctx.models.get(s.abbr).model)).join('')}</div>
          </div>
          ${seasonKitModule()}
        </div>

        <aside class="state-rail" aria-label="More about ${escapeHtml(state.name)}">
          <div class="card">
            <h2 style="font-size: var(--step-1)">At a glance</h2>
            <dl class="stack" style="--flow: var(--space-sm); margin-top: var(--space-sm)">
              <div class="between"><dt class="text-secondary">Combined respiratory index</dt><dd data-region="glance-level"><strong>${escapeHtml(model.label)}</strong></dd></div>
              <div class="between"><dt class="text-secondary">Trend</dt><dd data-region="glance-trend">${trendChip(model.trend, { provenance })}</dd></div>
              <div class="between"><dt class="text-secondary">Observation week ending</dt><dd data-region="glance-week">${escapeHtml(formatDate(weekEnding))}</dd></div>
            </dl>
          </div>
          <div class="card">
            <h2 style="font-size: var(--step-1)">Get ${escapeHtml(state.name)} alerts</h2>
            <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">We'll email you when activity starts climbing here.</p>
            <a class="btn btn--primary btn--block" href="/alerts/?state=${escapeHtml(state.abbr)}">Set up surge alerts</a>
          </div>
          <div class="card">
            <h2 style="font-size: var(--step-1)">US respiratory map</h2>
            <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">Compare the dated observations for ${escapeHtml(state.name)} with other states; availability and periods can differ.</p>
            <a class="btn btn--block" href="/states/">Open the respiratory map</a>
          </div>
          ${metrosFor(state).map((m) => `<div class="card">
            <h2 style="font-size: var(--step-1)">What's going around in ${escapeHtml(m.titleName || m.name)}</h2>
            <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">${escapeHtml(state.name)}-level context for ${escapeHtml(m.name)}; not independently measured city activity.</p>
            <a class="btn btn--block" href="/metro/${m.slug}/">Open the ${escapeHtml(m.name)} page</a>
          </div>`).join('')}
        </aside>
      </div>
    </div>
  </section>

  <section class="section below-fold" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container container--narrow">
      <h2 style="font-size: var(--step-2)">${escapeHtml(state.name)}: common questions</h2>
      <div data-region="state-faqs" style="margin-top: var(--space-md)">${faqs.map((f) => `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><div class="faq-item__body">${f.a}</div></details>`).join('')}</div>
    </div>
  </section>

  ${signupBand({ compact: true })}
  `;

  return {
    title: `Respiratory observations in ${state.name}: flu, RSV & COVID-19`,
    description,
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
    jsonld: [breadcrumbLd(crumbs), { ...statePageLd(state, weekEnding, { provenance: { ...provenance, ...model.provenance }, description, available: Number.isFinite(model.level) }), description }, faqLd(faqs.map((f) => ({ q: f.q, a: stripTags(f.a) })))],
  };
}

function neighborsFor(ctx, state) { return ctx.states.filter((s) => s.hhsRegion === state.hhsRegion && s.abbr !== state.abbr).slice(0, 6); }
function metrosFor(state) { return metros.filter((m) => m.stateAbbr === state.abbr); }
function stripTags(html) { return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
