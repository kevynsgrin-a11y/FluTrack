import { escapeHtml } from '../../../src/scripts/util.js';
import { usMap } from '../../../src/scripts/map-render.js';
import { signupBand, breadcrumbs } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

/**
 * /states/ — the all-states directory. Statically renders every state as a
 * severity-tinted chip (from the sample snapshot), progressively enhanced with
 * a client-side name filter. The chips' live levels are refreshed by app.js? No —
 * this page is a directory; chips reflect the build-time snapshot and link to the
 * per-state reports where live data loads.
 */
export default function states(ctx) {
  const { site } = ctx;
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'All states', path: '/states/' },
  ];

  const mapEntries = ctx.states.map((s) => {
    const m = ctx.models.get(s.abbr).model;
    return { abbr: s.abbr, name: s.name, slug: s.slug, level: m.level, label: m.label };
  });

  const chips = ctx.states
    .map((s) => ctx.render.stateChip(s, ctx.models.get(s.abbr).model))
    .join('\n        ');

  const body = `
  <section class="section section--tight">
    <div class="container">
      ${breadcrumbs(crumbs)}
      <p class="eyebrow">Directory</p>
      <h1>Respiratory activity by state</h1>
      <p class="lede" style="margin-top: var(--space-sm); max-width: 46rem">Pick your state for a plain-English flu, RSV and COVID-19 threat level and weekly trend, built on public-domain CDC surveillance data.</p>
    </div>
  </section>

  <section class="section" style="padding-top: 0">
    <div class="container">
      <div class="card card--pad-lg" data-region="us-map">${usMap(mapEntries, {})}</div>
    </div>
  </section>

  <section class="section" style="padding-top: 0">
    <div class="container">
      <h2 style="font-size: var(--step-2)">Browse the full list</h2>
      <form class="picker" role="search" aria-label="Filter states" id="state-filter-form" style="margin-top: var(--space-md)">
        <label class="visually-hidden" for="state-filter">Filter states by name</label>
        <input class="input" id="state-filter" type="search" inputmode="search" autocomplete="off"
          placeholder="Filter states…" style="max-width: 22rem" aria-controls="state-grid">
        <span class="muted" id="state-filter-count" aria-live="polite"></span>
      </form>
      <div class="state-index" id="state-grid" style="margin-top: var(--space-lg)">
        ${chips}
      </div>
      <p class="notice" id="state-empty" hidden style="margin-top: var(--space-lg)">
        <span aria-hidden="true">🔍</span> No states match that name. Try a different search.
      </p>
      <p class="muted" style="margin-top: var(--space-lg); font-size: var(--step--1)">Levels shown reflect the most recent bundled snapshot and refresh with live CDC data on each state's page. ${escapeHtml(
        ctx.disclaimers.short
      )}</p>
    </div>
  </section>

  ${signupBand({ compact: true })}
  `;

  return {
    title: 'All states — respiratory activity directory',
    description:
      'Browse flu, RSV and COVID-19 respiratory activity for all 50 states and DC. Pick your state for a plain-English threat level and weekly trend from public CDC data.',
    path: '/states/',
    body,
    scripts: ['/assets/js/states-filter.js'],
    changefreq: 'weekly',
    priority: 0.9,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
