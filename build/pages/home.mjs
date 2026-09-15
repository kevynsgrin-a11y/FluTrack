import { escapeHtml } from '../../src/scripts/util.js';
import { threatCard, pathogenTiles, signalRows, provenanceStrip } from '../../src/scripts/render.js';
import { usMap } from '../../src/scripts/map-render.js';
import { icon } from '../../src/scripts/icons.js';
import { signupBand, trendDisclaimer, adSlot } from '../lib/partials.mjs';
import { websiteLd, organizationLd, datasetLd } from '../lib/seo.mjs';

export default function home(ctx) {
  const { site, states, national, weekEnding, provenance } = ctx;
  const def = national;
  const stateOptions = states.map((s) => `<option value="${s.abbr}">${escapeHtml(s.name)}</option>`).join('');
  const mapEntries = states.map((s) => {
    const m = ctx.models.get(s.abbr).model;
    return { abbr: s.abbr, name: s.name, slug: s.slug, level: m.level, label: m.label };
  });

  const body = `
  <section class="hero">
    <div class="hero__bg" aria-hidden="true" data-sev="${def.model.level ?? 0}"></div>
    <div class="container">
      <div class="hero__grid">
        <div class="home-readout" data-region="threat-card" data-week="${escapeHtml(weekEnding)}">
          ${threatCard(def.state, def.model, { weekEnding, provenance })}
        </div>
        <div class="hero__lead">
          <p class="hero__label">Flu <span aria-hidden="true">/</span> RSV <span aria-hidden="true">/</span> COVID-19 <span aria-hidden="true">/</span> United States</p>
          <h1 class="hero__question">How bad is it near you, in plain English?</h1>
          <p class="lede hero__lede">FluTrack turns the CDC's own surveillance data into one simple answer for your state — a combined flu, RSV and COVID-19 threat level, and which way it's heading.</p>
          <div class="prov" style="margin-top: var(--space-lg)">${provenanceStrip(provenance)}</div>
        </div>
      </div>
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
    </div>
  </section>

  <section class="section section--tight" id="breakdown" style="scroll-margin-top: 5rem">
    <div class="container">
      <div class="trend-note">${trendDisclaimer()}</div>
    </div>
  </section>

  ${adSlot('home-readout')}

  <section class="section below-fold">
    <div class="container">
      <div class="section-head section-rule">
        <h2>By virus, for <span data-region="state-name">the U.S.</span></h2>
        <p class="text-secondary">The same picture, split into flu, RSV and COVID-19.</p>
      </div>
      <div data-region="pathogen-tiles">${pathogenTiles(def.model)}</div>
      <div style="margin-top: var(--space-2xl)">
        <h2 style="font-size: var(--step-2)">Underlying signals</h2>
        <div data-region="signal-rows" style="margin-top: var(--space-md)">${signalRows(def.signals)}</div>
      </div>
    </div>
  </section>

  <section class="section below-fold" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container">
      <div class="section-head section-rule">
        <h2>United States activity</h2>
        <p class="text-secondary">Tap or select a state for its full report.</p>
      </div>
      <div data-region="us-map">${usMap(mapEntries, { selected: '' })}</div>
      <div style="margin-top: var(--space-xl)">
        <a class="btn btn--secondary" href="/states/" data-region="state-link">Full state report</a>
      </div>
    </div>
  </section>

  <section class="section below-fold">
    <div class="container">
      <div class="section-head section-rule">
        <h2>Authoritative data, translated</h2>
        <p class="text-secondary">Three steps, no jargon, no login.</p>
      </div>
      <div class="editorial-columns">
        <div>
          <h3>We read the CDC</h3>
          <p>Every week we pull the CDC's public-domain surveillance feeds — emergency-department visits, lab positivity and wastewater viral activity.</p>
        </div>
        <div>
          <h3>We combine the signals</h3>
          <p>Those signals are blended into one transparent 0–4 threat level for your state, with a rising/falling trend. <a href="/methodology/">See the method</a></p>
        </div>
        <div>
          <h3>You get a plain answer</h3>
          <p>No epidemiology degree required — just how active respiratory illness is where you live, and where it's headed.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section below-fold" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container">
      <div class="section-head section-rule">
        <h2>Built on public-domain CDC data</h2>
        <p class="text-secondary">Only U.S. Government public-domain sources — no restrictively licensed feeds.</p>
      </div>
      <div class="source-ledger">
        ${sourceCard('Emergency department visits', 'NSSP', 'The share of ER visits for respiratory illness (flu, RSV, COVID-19), by state.')}
        ${sourceCard('Wastewater viral activity', 'NWSS', "The CDC's wastewater index — an early indicator that can lead clinical cases by days.")}
        ${sourceCard('Laboratory test positivity', 'NREVSS', 'The percentage of respiratory tests coming back positive.')}
        ${sourceCard('Acute Respiratory Illness level', 'NSSP ARI', "The CDC's categorical activity level, from Very Low to Very High.")}
      </div>
      <div class="callout" style="margin-top: var(--space-xl)">
        <p class="callout__title">${icon('shield-check')} Licensing note</p>
        <p class="text-secondary">FluTrack deliberately uses only public-domain CDC feeds. We exclude non-commercially licensed datasets (such as WastewaterSCAN, CC BY-NC 4.0) so this free, ad-supported utility stays fully within its rights. <a href="/data-sources/">More on our sources</a></p>
      </div>
    </div>
  </section>

  <section class="section below-fold">
    <div class="container">
      <div class="section-head section-rule">
        <h2>Find your state</h2>
      </div>
      <div class="state-index">
        ${ctx.states.slice(0, 12).map((s) => ctx.render.stateChip(s, ctx.models.get(s.abbr).model)).join('')}
      </div>
      <div style="margin-top: var(--space-xl)"><a class="btn btn--secondary" href="/states/">Browse all states</a></div>
    </div>
  </section>

  ${signupBand()}
  ${adSlot('home-footer')}
  `;

  return {
    title: '',
    description: site.description,
    path: '/',
    body,
    scripts: ['/assets/js/app.js', '/assets/js/map-keyboard.js'],
    jsonld: [websiteLd(), organizationLd(), datasetLd()],
  };
}

function sourceCard(title, badge, desc) {
  return `<div class="source-card"><span class="source-card__badge">${escapeHtml(badge)} <span aria-hidden="true">/</span> Public Domain</span><h3>${escapeHtml(title)}</h3><p class="text-secondary">${escapeHtml(desc)}</p></div>`;
}
