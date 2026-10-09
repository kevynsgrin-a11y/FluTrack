import { escapeHtml, formatDate } from '../../../src/scripts/util.js';
import { usMap } from '../../../src/scripts/map-render.js';
import { provenanceBadge } from '../../../src/scripts/render.js';
import { presentationModel } from '../../../src/scripts/reading-provenance.js';
import { signupBand, breadcrumbs } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

export default function states(ctx) {
  const { site } = ctx;
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Respiratory activity map', path: '/states/' }];
  const mapEntries = ctx.states.map((s) => {
    const m = presentationModel(ctx.models.get(s.abbr).model, { ...ctx.provenance, weekEnding: ctx.weekEnding });
    return { abbr: s.abbr, name: s.name, slug: s.slug, level: m.level, label: m.label };
  });
  const chips = ctx.states.map((s) => ctx.render.stateChip(s, ctx.models.get(s.abbr).model)).join('\n');
  // This page publishes a colour-coded level and a numeric rank for all 51
  // jurisdictions and carried no provenance marker at all, while every other
  // number-bearing page carries one — contradicting the site's own Editorial
  // Policy ("Every number, level and map colour is either derived from a
  // reported value or labelled as sample data"). It also loads neither app.js
  // nor any live refresh, so the reading here is whatever was built in: a
  // static badge is the accurate one.
  const asOf = formatDate(ctx.weekEnding);
  const body = `
  <section class="section section--tight state-masthead">
    <div class="container">
      ${breadcrumbs(crumbs)}
      <h1>US respiratory activity map: flu, RSV and COVID-19 by state</h1>
      <p class="lede" style="margin-top: var(--space-sm); max-width: 46rem">Browse all 50 states and DC for a combined respiratory index and the available by-virus readings. These are dated surveillance observations, with coverage that varies by state and source.</p>
      <p style="margin-top: var(--space-sm)">${provenanceBadge(ctx.provenance)}${asOf ? ` <span class="muted">observation period ending ${escapeHtml(asOf)}</span>` : ''}</p>
    </div>
  </section>
  <section class="section" style="padding-top: var(--space-xl)"><div class="container"><div data-region="us-map">${usMap(mapEntries, {})}</div></div></section>
  <section class="section below-fold" style="padding-top: 0">
    <div class="container">
      <div class="section-head section-rule"><h2 style="font-size: var(--step-2)">Browse the full list</h2></div>
      <form class="picker" role="search" aria-label="Filter states" id="state-filter-form" style="margin-top: var(--space-md)">
        <label class="visually-hidden" for="state-filter">Filter states by name</label>
        <input class="input" id="state-filter" type="search" inputmode="search" autocomplete="off" placeholder="Filter states…" style="max-width: 22rem" aria-controls="state-grid">
        <span class="muted" id="state-filter-count" aria-live="polite"></span>
      </form>
      <div class="state-index" id="state-grid" style="margin-top: var(--space-lg)">${chips}</div>
      <p class="notice" id="state-empty" hidden style="margin-top: var(--space-lg)"><span aria-hidden="true">⌕</span> No states match that name. Try a different search.</p>
      <p class="muted" style="margin-top: var(--space-lg); font-size: var(--step--1)">Levels shown reflect the bundled snapshot. State pages may refresh when newer usable CDC observations are available. Sample data is illustrative; no data does not mean no illness. ${escapeHtml(ctx.disclaimers.short)}</p>
    </div>
  </section>
  ${signupBand({ compact: true })}`;
  return {
    // The layout appends "· FluTrack" — no manual brand suffix here.
    title: 'US Respiratory Activity Map — Flu, RSV & COVID by State',
    description: 'Dated flu, RSV and COVID-19 surveillance by state: a combined respiratory index, by-virus readings and coverage limits. Sample and missing data are labeled.',
    path: '/states/',
    body,
    scripts: ['/assets/js/states-filter.js', '/assets/js/map-keyboard.js'],
    changefreq: 'weekly',
    priority: 0.9,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
