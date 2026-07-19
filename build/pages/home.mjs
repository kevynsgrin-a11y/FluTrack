import { escapeHtml } from '../../src/scripts/util.js';
import { threatCard, pathogenTiles, signalRows } from '../../src/scripts/render.js';
import { signupBand, trendDisclaimer } from '../lib/partials.mjs';
import { websiteLd, organizationLd, datasetLd } from '../lib/seo.mjs';

export default function home(ctx) {
  const { site, states, national, weekEnding, provenance } = ctx;
  const def = national; // default hero selection = US aggregate

  const stateOptions = states
    .map((s) => `<option value="${s.abbr}">${escapeHtml(s.name)}</option>`)
    .join('');

  const body = `
  <section class="hero">
    <div class="container">
      <div class="hero__grid">
        <div>
          <p class="eyebrow"><span aria-hidden="true">◍</span> ${escapeHtml(site.season.label)}</p>
          <h1>How bad is it near you, in plain English?</h1>
          <p class="lede hero__lede">FluTrack turns the CDC's own surveillance data into one simple answer for your state — a combined flu, RSV and COVID-19 threat level, and which way it's heading.</p>
          <form class="picker hero__cta" id="state-picker" role="search" aria-label="Choose your state">
            <label class="visually-hidden" for="state-select">Choose your state</label>
            <select class="select" id="state-select" name="state" data-default="${escapeHtml(def.state.abbr)}">
              <option value="US">United States (overall)</option>
              ${stateOptions}
            </select>
            <button class="btn btn--primary" type="submit">See my area</button>
            <button class="btn btn--ghost" type="button" id="geo-btn" title="Use my location">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
              Use my location
            </button>
          </form>
          <p class="muted" style="margin-top: var(--space-sm); font-size: var(--step--1)">Updated ${escapeHtml(
            site.dataCadence.toLowerCase()
          )}. We show directional trends, not a live case count.</p>
        </div>
        <div data-region="threat-card" data-week="${escapeHtml(weekEnding)}">
          ${threatCard(def.state, def.model, { weekEnding, provenance })}
        </div>
      </div>
    </div>
  </section>

  <section class="section--tight">
    <div class="container">${trendDisclaimer()}</div>
  </section>

  <section class="section" id="breakdown">
    <div class="container">
      <div class="between section-head">
        <div>
          <h2>By virus, for <span data-region="state-name">the U.S.</span></h2>
          <p class="text-secondary">The same picture, split into flu, RSV and COVID-19.</p>
        </div>
        <a class="btn btn--secondary" href="/states/" data-region="state-link">Full state report →</a>
      </div>
      <div data-region="pathogen-tiles">${pathogenTiles(def.model)}</div>
      <div class="card" style="margin-top: var(--space-lg)">
        <h3 style="font-size: var(--step-1)">Underlying signals</h3>
        <div data-region="signal-rows" style="margin-top: var(--space-sm)">${signalRows(def.signals)}</div>
      </div>
    </div>
  </section>

  <section class="section" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">How it works</p>
        <h2>Authoritative data, translated</h2>
        <p class="text-secondary">Three steps, no jargon, no login.</p>
      </div>
      <div class="steps">
        <div class="step">
          <h3>We read the CDC</h3>
          <p class="text-secondary">Every week we pull the CDC's public-domain surveillance feeds — emergency-department visits, lab positivity and wastewater viral activity.</p>
        </div>
        <div class="step">
          <h3>We combine the signals</h3>
          <p class="text-secondary">Those signals are blended into one transparent 0–4 threat level for your state, with a rising/falling trend. <a href="/methodology/">See the method →</a></p>
        </div>
        <div class="step">
          <h3>You get a plain answer</h3>
          <p class="text-secondary">No epidemiology degree required — just how active respiratory illness is where you live, and where it's headed.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">Where the numbers come from</p>
        <h2>Built on public-domain CDC data</h2>
        <p class="text-secondary">Only U.S. Government public-domain sources — no restrictively licensed feeds.</p>
      </div>
      <div class="grid-2">
        ${sourceCard(
          'Emergency department visits',
          'NSSP',
          'The share of ER visits for respiratory illness (flu, RSV, COVID-19), by state.'
        )}
        ${sourceCard(
          'Wastewater viral activity',
          'NWSS',
          "The CDC's wastewater index — an early indicator that can lead clinical cases by days."
        )}
        ${sourceCard(
          'Laboratory test positivity',
          'NREVSS',
          'The percentage of respiratory tests coming back positive.'
        )}
        ${sourceCard(
          'Acute Respiratory Illness level',
          'NSSP ARI',
          'The CDC\'s categorical activity level, from Very Low to Very High.'
        )}
      </div>
      <div class="callout" style="margin-top: var(--space-lg)">
        <p class="callout__title"><span aria-hidden="true">✓</span> Licensing note</p>
        <p class="text-secondary">FluTrack deliberately uses only public-domain CDC feeds. We exclude non-commercially-licensed datasets (such as WastewaterSCAN, CC BY-NC 4.0) so this free, ad-supported utility stays fully within its rights. <a href="/data-sources/">More on our sources →</a></p>
      </div>
    </div>
  </section>

  <section class="section" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container">
      <div class="between section-head" style="margin-bottom: var(--space-lg)">
        <div><p class="eyebrow">All 50 states + DC</p><h2>Find your state</h2></div>
        <a class="btn btn--secondary" href="/states/">Browse all states →</a>
      </div>
      <div class="state-index">
        ${ctx.states
          .slice(0, 12)
          .map((s) => ctx.render.stateChip(s, ctx.models.get(s.abbr).model))
          .join('')}
      </div>
    </div>
  </section>

  ${signupBand()}
  `;

  return {
    title: '',
    description: site.description,
    path: '/',
    body,
    scripts: ['/assets/js/app.js'],
    jsonld: [websiteLd(), organizationLd(), datasetLd()],
  };
}

function sourceCard(title, badge, desc) {
  return `<div class="card source-card">
    <span class="badge source-card__badge">${escapeHtml(badge)} · Public Domain</span>
    <h3 style="font-size: var(--step-1); margin-top: var(--space-xs)">${escapeHtml(title)}</h3>
    <p class="text-secondary">${escapeHtml(desc)}</p>
  </div>`;
}
