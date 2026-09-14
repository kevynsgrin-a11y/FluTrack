import { escapeHtml, formatDate, formatChange } from '../../src/scripts/util.js';
import { threatCard, pathogenTiles, signalRows, levelToken, trendChip } from '../../src/scripts/render.js';
import { signupBand, trendDisclaimer, breadcrumbs, adSlot } from '../lib/partials.mjs';
import { breadcrumbLd, statePageLd, faqLd } from '../lib/seo.mjs';

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

  const body = `
  <div class="status-strip" data-sticky-status aria-label="${escapeHtml(state.name)} report status">
    <span class="status-strip__state">${escapeHtml(state.name)}</span>
    <span class="status-strip__level" data-region="sticky-level" data-sev="${model.level ?? 0}">${levelToken(model.level, model.label)}</span>
    <span data-region="sticky-trend">${trendChip(model.trend)}</span>
  </div>
  <section class="section section--tight state-masthead" data-state-masthead>
    <div class="container">
      ${breadcrumbs(crumbs)}
      <h1>${escapeHtml(state.name)} flu, RSV &amp; COVID-19 activity</h1>
      <p class="lede" style="margin-top: var(--space-sm); max-width: 44rem">A plain-English respiratory threat level for ${escapeHtml(state.name)}, built from public-domain CDC surveillance data and refreshed weekly.</p>
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
          <aside class="season-kit" aria-label="Affiliate content">
            <div class="season-kit__head"><span class="season-kit__label">Affiliate content</span><span class="copy-slot">[COPY NEEDED: season kit module title, max 8 words]</span></div>
            <div class="season-kit__grid">
              <div class="season-kit__slot"><span class="copy-slot">[COPY NEEDED: affiliate product one, max 18 words]</span></div>
              <div class="season-kit__slot"><span class="copy-slot">[COPY NEEDED: affiliate product two, max 18 words]</span></div>
              <div class="season-kit__slot"><span class="copy-slot">[COPY NEEDED: affiliate product three, max 18 words]</span></div>
            </div>
          </aside>
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
    title: `${state.name} flu, RSV & COVID activity`,
    description: `Current flu, RSV and COVID-19 respiratory threat level and weekly trend for ${state.name}, from public-domain CDC surveillance data. Not medical advice.`,
    path: `/state/${state.slug}/`,
    body,
    scripts: ['/assets/js/app.js', '/assets/js/sticky-status.js'],
    ogType: 'article',
    ogImage: `/assets/og/${state.slug}.svg`,
    jsonld: [breadcrumbLd(crumbs), statePageLd(state, weekEnding), faqLd(faqs.map((f) => ({ q: f.q, a: stripTags(f.a) })))],
  };
}

function stateIntro(state, neighbors) {
  const names = neighbors.slice(0, 4).map((s) => s.name);
  const neighborText = names.length ? ` You can also compare nearby states such as ${listJoin(names)}.` : '';
  return `FluTrack blends four public CDC surveillance signals for ${state.name} — emergency-department visits, wastewater viral activity, laboratory test positivity, and the Acute Respiratory Illness (ARI) activity level — into the single, plain-English threat level shown here, refreshed every week.${neighborText}`;
}
function listJoin(items) { if (items.length <= 1) return items[0] || ''; return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`; }
function neighborsFor(ctx, state) { return ctx.states.filter((s) => s.hhsRegion === state.hhsRegion && s.abbr !== state.abbr).slice(0, 6); }
function stateFaqs(state) {
  return [
    { q: `How much respiratory illness is going around in ${state.name} right now?`, a: `<p>The current combined flu, RSV and COVID-19 threat level for ${escapeHtml(state.name)} — and whether it is rising, falling or holding steady — is shown at the top of this page. It reflects the CDC's latest public surveillance data and is a directional weekly trend, not a real-time case count.</p>` },
    { q: `Where does this ${escapeHtml(state.name)} data come from?`, a: `<p>From the CDC's public-domain surveillance systems — emergency-department visits (NSSP), wastewater viral activity (NWSS) and laboratory test positivity (NREVSS). See our <a href="/methodology/">methodology</a> and <a href="/data-sources/">data sources</a>.</p>` },
    { q: `How often is the ${state.name} threat level updated?`, a: `<p>Weekly. CDC surveillance systems publish on Fridays, and reported data typically reflects illness from one to two weeks earlier — so FluTrack emphasizes the trend rather than a single day's number.</p>` },
    { q: 'Is this medical advice?', a: '<p>No. FluTrack is an independent data-visualization utility and is not affiliated with the CDC. The information here is general and is not a substitute for professional medical advice. For guidance about your health, consult a qualified provider.</p>' },
  ];
}
function stripTags(html) { return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
