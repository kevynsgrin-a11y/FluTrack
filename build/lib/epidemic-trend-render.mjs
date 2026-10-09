// ===========================================================================
// Markup for CDC's COVID-19 epidemic trend: the state-page block and the one
// national line on the home page. Pure string functions over the plan built by
// planEpidemicTrend(); nothing here fetches or decides what may be shown.
//
// Design rules this file keeps:
//   * Direction is a separate dimension from level. The category is never
//     coloured, scored or worded like the FluTrack severity scale.
//   * Every figure carries its own date. The model's report date and the end of
//     the data it was trained on are different facts and are both shown.
//   * Measurements are listed side by side, never averaged. Where they point
//     opposite ways, the page says so.
//   * Nothing here says "surge", "outbreak" or gives advice.
// ===========================================================================

import { escapeHtml, formatDate } from '../../src/scripts/util.js';
import { computeTrend } from '../../src/scripts/threat-index.js';
import { trendChip, trendShape } from '../../src/scripts/render.js';
import { readingStatus } from '../../src/scripts/reading-provenance.js';
import { CATEGORIES, EPIDEMIC_TREND_PAGE, compareDirections } from './epidemic-trend.mjs';

const HEADING_ID = 'epi-heading';

/** "78%", never "100%" or "0%": a modelled probability is not a certainty. */
export function formatProbability(p) {
  const pct = Math.round(p * 100);
  if (pct >= 100) return 'more than 99%';
  if (pct <= 0) return 'less than 1%';
  return `${pct}%`;
}

/** CDC's category as a labelled direction chip (shape + word, never colour alone). */
export function categoryChip(category) {
  const c = CATEGORIES[category];
  if (!c) return '';
  return `<span class="trend trend--${c.direction}">${trendShape(c.direction)}<span>${escapeHtml(c.label)}</span></span>`;
}

const MEASURES = [
  { key: 'edVisits', field: 'edPercentSeries', name: 'COVID-19 share of emergency-department visits', plain: 'the COVID-19 share of emergency-department visits', source: 'NSSP' },
  { key: 'wastewater', field: 'wastewaterSeries', name: 'COVID-19 wastewater viral activity', plain: 'COVID-19 wastewater viral activity', source: 'NWSS' },
];

/**
 * FluTrack's own COVID-19 readings for a state, each with its OWN direction.
 * The model reports one trend per pathogen, from one chosen source (ED first),
 * which would hide a wastewater movement that differs from the ED share — the
 * Connecticut case. Here each measurement is compared separately, with the same
 * latest-versus-prior-mean rule the rest of the site uses. Empty unless the
 * state's COVID-19 reading is live.
 */
export function covidMeasures(signals, model, provenance = {}) {
  const covid = signals?.pathogens?.covid;
  const presented = model?.pathogens?.covid;
  if (!covid || !presented || readingStatus(presented, provenance) !== 'live') return [];
  const out = [];
  for (const m of MEASURES) {
    const metric = covid.provenance?.metrics?.[m.key];
    const series = covid[m.field];
    if (!metric || metric.status !== 'available' || metric.contributes === false || !Array.isArray(series)) continue;
    const base = computeTrend(series);
    const trend = metric.comparableHistory === false
      ? { direction: 'unknown', changePct: null, label: 'Not enough comparable data', priorCount: 0, reason: 'changing-coverage' }
      : base;
    out.push({
      key: m.key,
      name: m.name,
      plain: m.plain,
      source: m.source,
      direction: ['up', 'down', 'flat'].includes(trend.direction) && Number.isFinite(trend.changePct) ? trend.direction : 'unknown',
      weekEnding: metric.observationPeriod?.weekEnding || null,
      trend: { ...trend, source: m.key, provenance: covid.provenance },
    });
  }
  return out;
}

function heading(state, extra = '') {
  return `<div class="section-head section-rule">
      <h2 id="${HEADING_ID}" style="font-size: var(--step-2)">CDC epidemic trend for COVID-19 in ${escapeHtml(state.name)}</h2>${extra}
    </div>`;
}

function shown({ state, estimate, plan, measures, provenance }) {
  const c = CATEGORIES[estimate.category];
  const declining = c.direction === 'down';
  const probability = declining ? 1 - estimate.pGrowing : estimate.pGrowing;
  const verb = declining ? 'declining' : 'growing';
  const report = formatDate(plan.reportDate);
  const through = formatDate(plan.trainingDataEnd);
  const bandNote = estimate.category === 'not_changing'
    ? `${c.band} of CDC’s estimated range of Rt values is above 1 (the range spans 1, a mix of growth and decline)`
    : `${c.band} of CDC’s estimated range of Rt values is above 1`;

  const rows = measures.length ? [`<div class="epi__row">
          <span class="epi__row-name">CDC epidemic trend (model)<br><span class="field__hint">Report dated ${escapeHtml(report)} · estimated from emergency-department data through ${escapeHtml(through)}</span></span>
          <span class="epi__row-val">${categoryChip(estimate.category)}</span>
        </div>`] : [];
  for (const m of measures) {
    rows.push(`<div class="epi__row">
          <span class="epi__row-name">${escapeHtml(m.name)} (${escapeHtml(m.source)}, FluTrack’s reading)<br><span class="field__hint">${m.weekEnding ? `Week ending ${escapeHtml(formatDate(m.weekEnding))} · ` : ''}latest observation compared with the mean of up to three prior observations</span></span>
          <span class="epi__row-val">${trendChip(m.trend, { provenance })}</span>
        </div>`);
  }

  const { divergent, opposite } = compareDirections(estimate.category, measures);
  const word = { up: 'rising', down: 'falling' };
  const divergence = divergent
    ? `<p class="callout epi__divergence" role="note"><strong>These measurements point in different directions.</strong> CDC’s model classifies COVID-19 infections in ${escapeHtml(state.name)} as ${escapeHtml(c.label.toLowerCase())}, while ${opposite.map((m) => `${escapeHtml(m.plain)} is ${word[m.direction]}`).join(' and ')}. They measure different things by different methods, and neither overrides the other. Week-to-week movement in small shares can also reflect reporting variation.</p>`
    : '';
  const independence = measures.some((m) => m.key === 'edVisits')
    ? '<p class="field__hint epi__note">CDC estimates this trend from the same NSSP emergency-department data that produce the ED-visit share listed here, so agreement between the two is not independent confirmation.</p>'
    : '';
  const compare = measures.length
    ? `<div class="epi__compare">
      <h3 style="font-size: var(--step-1)">How the COVID-19 signals compare in ${escapeHtml(state.name)}</h3>
      <p class="text-secondary">Each row is a separate measurement with its own period. They are listed together, not averaged or combined into one trend.</p>
      <div class="signal-ledger">
        ${rows.join('\n        ')}
      </div>
      ${divergence}
      ${independence}
    </div>`
    : '';

  return `<section class="epi" data-block="epidemic-trend" data-status="shown" data-category="${escapeHtml(estimate.category)}" aria-labelledby="${HEADING_ID}">
    ${heading(state, '\n      <p class="text-secondary">A separate direction-of-change estimate from CDC’s modeling team. It is not part of the FluTrack combined respiratory index and does not change it.</p>')}
    <div class="card epi__card">
      <div class="epi__headline">
        <span class="epi__eyebrow">CDC category</span>
        ${categoryChip(estimate.category)}
      </div>
      <p>CDC’s model puts the probability that COVID-19 infections are ${verb} in ${escapeHtml(state.name)} at <strong>${escapeHtml(formatProbability(probability))}</strong>.</p>
      <p>Its estimate of the reproduction number (Rt) is <strong>${estimate.median.toFixed(2)}</strong>, with a 95% interval of ${estimate.lower95.toFixed(2)} to ${estimate.upper95.toFixed(2)}. Above 1, infections are growing; below 1, they are declining.</p>
      <dl class="epi__facts">
        <div><dt>CDC model report dated</dt><dd>${escapeHtml(report)}</dd></div>
        <div><dt>Estimated from emergency-department data through</dt><dd>${escapeHtml(through)}</dd></div>
        <div><dt>Why CDC uses this category</dt><dd>${escapeHtml(bandNote)}</dd></div>
      </dl>
      <p class="field__hint epi__note"><strong>Direction only.</strong> CDC says epidemic trends do not reflect the burden of disease and should be read alongside other measures. Estimates are revised as emergency-department data arrive, and can be temporarily off if the share of infected people who visit emergency departments changes, for example with a new variant. <a href="${escapeHtml(EPIDEMIC_TREND_PAGE)}" rel="noopener">How CDC defines it</a> · <a href="/methodology/#epidemic-trend">How FluTrack shows it</a>.</p>
    </div>
    ${compare}
  </section>`;
}

function withheld({ state, decision }) {
  const gap = decision.gap;
  const basis = gap
    ? `${escapeHtml(gap.text)} <a href="${escapeHtml(gap.source)}" rel="noopener">Source: CDC</a>.`
    : `FluTrack does not currently have a COVID-19 emergency-department series for ${escapeHtml(state.name)} that passes its checks.`;
  return `<section class="epi" data-block="epidemic-trend" data-status="withheld" aria-labelledby="${HEADING_ID}">
    ${heading(state)}
    <div class="callout" role="note">
      <p class="callout__title">Not shown for ${escapeHtml(state.name)}</p>
      <p>CDC publishes an epidemic-trend category for ${escapeHtml(state.name)}, but FluTrack is not displaying it. CDC estimates this trend from emergency-department visit data. ${basis} Without those observations in view, the direction label cannot be placed beside the data it rests on. This is a gap in the data, not evidence that COVID-19 is rising, falling or low.</p>
    </div>
  </section>`;
}

function notEstimated({ state, plan }) {
  return `<section class="epi" data-block="epidemic-trend" data-status="not-estimated" aria-labelledby="${HEADING_ID}">
    ${heading(state)}
    <div class="callout" role="note">
      <p class="callout__title">No CDC estimate for ${escapeHtml(state.name)}</p>
      <p>CDC did not publish an epidemic-trend estimate for ${escapeHtml(state.name)} in its report dated ${escapeHtml(formatDate(plan.reportDate))}. CDC does not estimate a trend when emergency-department data are too sparse, show recent anomalies, or the model does not pass its reliability checks. “Not estimated” is not the same as “not changing”. <a href="${escapeHtml(EPIDEMIC_TREND_PAGE)}" rel="noopener">How CDC defines it</a>.</p>
    </div>
  </section>`;
}

/**
 * The state-page block, or '' when the plan has nothing to say for the state.
 * @param {{ state: object, plan: object|null, signals?: object, model?: object, provenance?: object }} args
 */
export function epidemicTrendBlock({ state, plan, signals, model, provenance }) {
  const decision = plan?.byState.get(state.abbr);
  if (!decision) return '';
  if (decision.status === 'shown') {
    return shown({ state, estimate: decision.estimate, plan, measures: covidMeasures(signals, model, provenance), provenance });
  }
  if (decision.status === 'withheld') return withheld({ state, decision });
  if (decision.status === 'not-estimated') return notEstimated({ state, plan });
  return '';
}

/** The single national line for the home page, or '' when there is nothing shown. */
export function epidemicTrendHomeLine(plan) {
  if (!plan || !plan.counts.shown) return '';
  const { counts } = plan;
  const total = plan.byState.size;
  const national = plan.national
    ? ` The U.S. as a whole is classified as <strong>${escapeHtml(plan.national.label.toLowerCase())}</strong>.`
    : '';
  const rest = total - counts.shown;
  const upVerb = counts.up === 1 ? 'is' : 'are';
  const restText = rest ? ` The other ${rest} ${rest === 1 ? 'is' : 'are'} withheld or ${rest === 1 ? 'has' : 'have'} no CDC estimate; each state page says why.` : '';
  return `<p class="text-secondary epi__national" data-block="epidemic-trend-national"><strong>COVID-19 direction, per CDC’s epidemic-trend model</strong> (report dated ${escapeHtml(formatDate(plan.reportDate))}; estimated from emergency-department data through ${escapeHtml(formatDate(plan.trainingDataEnd))}).${national} In ${counts.shown} of ${total} jurisdictions (the 50 states and DC), FluTrack shows CDC’s category: ${counts.up} ${upVerb} growing or likely growing, ${counts.flat} not changing and ${counts.down} declining or likely declining.${restText} This is direction only, not how much COVID-19 is circulating. <a href="/methodology/#epidemic-trend">How this is shown</a></p>`;
}
