import { escapeHtml, formatDate, formatChange } from '../../src/scripts/util.js';
import { threatCard, pathogenTiles, signalRows } from '../../src/scripts/render.js';
import { signupBand, trendDisclaimer, breadcrumbs } from '../lib/partials.mjs';
import { breadcrumbLd, statePageLd, faqLd } from '../lib/seo.mjs';

/**
 * Build a per-state report page.
 * @param ctx global build context
 * @param state a single state record
 */
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

  // Non-prescriptive, data-only "what this means" copy.
  const faqs = stateFaqs(state, model, weekEnding);

  const others = neighborsFor(ctx, state);

  const body = `
  <section class="section section--tight">
    <div class="container">
      ${breadcrumbs(crumbs)}
      <p class="eyebrow">State respiratory report</p>
      <h1>${escapeHtml(state.name)} flu, RSV &amp; COVID-19 activity</h1>
      <p class="lede" style="margin-top: var(--space-sm); max-width: 44rem">A plain-English respiratory threat level for ${escapeHtml(
        state.name
      )}, built from public-domain CDC surveillance data and refreshed weekly.</p>
    </div>
  </section>

  <section class="section" style="padding-top: 0">
    <div class="container">
      <div class="state-layout">
        <div class="stack" style="--flow: var(--space-lg)">
          <div data-region="threat-card" data-state="${escapeHtml(state.abbr)}" data-week="${escapeHtml(weekEnding)}">
            ${threatCard(state, model, { weekEnding, provenance })}
          </div>
          ${trendDisclaimer()}
          <div>
            <h2 style="font-size: var(--step-2)">By virus</h2>
            <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">How each respiratory virus is contributing in ${escapeHtml(
              state.name
            )} right now.</p>
            <div data-region="pathogen-tiles">${pathogenTiles(model)}</div>
          </div>
          <div class="card">
            <h2 style="font-size: var(--step-1)">What the data shows</h2>
            <div data-region="signal-rows" style="margin-top: var(--space-sm)">${signalRows(signals)}</div>
          </div>
        </div>

        <aside class="stack" style="--flow: var(--space-lg)" aria-label="More about ${escapeHtml(state.name)}">
          <div class="card">
            <h2 style="font-size: var(--step-1)">At a glance</h2>
            <dl class="stack" style="--flow: var(--space-sm); margin-top: var(--space-sm)">
              <div class="between"><dt class="text-secondary">Threat level</dt><dd data-region="glance-level"><strong>${escapeHtml(
                model.label
              )}</strong></dd></div>
              <div class="between"><dt class="text-secondary">Trend</dt><dd data-region="glance-trend">${escapeHtml(
                model.trend.label
              )} ${model.trend.direction !== 'flat' ? escapeHtml(formatChange(model.trend.changePct)) : ''}</dd></div>
              <div class="between"><dt class="text-secondary">Data as of</dt><dd data-region="glance-week">${escapeHtml(
                formatDate(weekEnding)
              )}</dd></div>
            </dl>
          </div>
          <div class="card">
            <h2 style="font-size: var(--step-1)">Get ${escapeHtml(state.name)} alerts</h2>
            <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">We'll email you when activity starts climbing here.</p>
            <a class="btn btn--primary btn--block" href="/alerts/?state=${escapeHtml(state.abbr)}">Set up surge alerts</a>
          </div>
          <div class="card">
            <h2 style="font-size: var(--step-1)">Nearby states</h2>
            <div class="state-index" style="grid-template-columns: 1fr; margin-top: var(--space-sm)">
              ${others.map((s) => ctx.render.stateChip(s, ctx.models.get(s.abbr).model)).join('')}
            </div>
          </div>
        </aside>
      </div>
    </div>
  </section>

  <section class="section" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container container--narrow">
      <h2 style="font-size: var(--step-2)">${escapeHtml(state.name)}: common questions</h2>
      <div style="margin-top: var(--space-md)">
        ${faqs
          .map(
            (f) => `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><div class="faq-item__body">${f.a}</div></details>`
          )
          .join('')}
      </div>
    </div>
  </section>

  ${signupBand({ compact: true })}
  `;

  return {
    title: `${state.name} flu, RSV & COVID activity`,
    description: `Current flu, RSV and COVID-19 respiratory threat level and weekly trend for ${state.name}, from public-domain CDC surveillance data. Not medical advice.`,
    path: `/state/${state.slug}/`,
    body,
    scripts: ['/assets/js/app.js'],
    ogType: 'article',
    jsonld: [breadcrumbLd(crumbs), statePageLd(state, weekEnding), faqLd(faqs.map((f) => ({ q: f.q, a: stripTags(f.a) })))],
  };
}

function neighborsFor(ctx, state) {
  // Simple "same HHS region" grouping keeps this dependency-free and relevant.
  return ctx.states
    .filter((s) => s.hhsRegion === state.hhsRegion && s.abbr !== state.abbr)
    .slice(0, 6);
}

function stateFaqs(state, model, weekEnding) {
  const lvl = model.label.toLowerCase();
  return [
    {
      q: `How much respiratory illness is going around in ${state.name} right now?`,
      a: `<p>As of ${escapeHtml(
        formatDate(weekEnding)
      )}, FluTrack rates combined flu, RSV and COVID-19 activity in ${escapeHtml(
        state.name
      )} as <strong>${escapeHtml(model.label)}</strong>, ${escapeHtml(
        model.trend.label.toLowerCase()
      )}. This reflects CDC surveillance data and is a directional trend, not a real-time case count.</p>`,
    },
    {
      q: `Where does this ${escapeHtml(state.name)} data come from?`,
      a: `<p>From the CDC's public-domain surveillance systems — emergency-department visits (NSSP), wastewater viral activity (NWSS) and laboratory test positivity (NREVSS). See our <a href="/methodology/">methodology</a> and <a href="/data-sources/">data sources</a>.</p>`,
    },
    {
      q: `How often is the ${escapeHtml(state.name)} threat level updated?`,
      a: `<p>Weekly. CDC surveillance systems publish on Fridays, and reported data typically reflects illness from one to two weeks earlier — so FluTrack emphasizes the trend rather than a single day's number.</p>`,
    },
    {
      q: `Is this medical advice?`,
      a: `<p>No. FluTrack is an independent data-visualization utility and is not affiliated with the CDC. The information here is general and is not a substitute for professional medical advice. For guidance about your health, consult a qualified provider.</p>`,
    },
  ];
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
