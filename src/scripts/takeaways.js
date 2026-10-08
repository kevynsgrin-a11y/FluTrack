// ===========================================================================
// "This week, in plain English" — 3–5 sentence takeaways for a state report.
//
// Built only from the state's own model and signals (plus its HHS-region
// peers' levels), so every sentence restates a figure shown elsewhere on the
// page. Shared by the Node build and the browser so a live refresh rewrites the
// block with exactly the wording the build would have produced.
//
// Rules this module keeps:
//   * LIVE DATA ONLY. On the illustrative sample it renders nothing: a sentence
//     like "Flu is rising in Maryland" is a claim about a real place and must
//     never be generated from fixture numbers (a snippet would carry it off
//     the page without the "Sample data" badge).
//   * Describe, never advise or predict. No "you should", no forecasts.
//   * At low levels, small moves are described as small — a 0.1 → 0.2 point
//     change is "edging up", not a percentage headline.
// ===========================================================================

import { escapeHtml, formatDate, formatPct } from './util.js';
import { BREAKPOINTS, SEVERITY_LABELS, bucketize } from './threat-index.js';

const VIRUS_NAMES = { influenza: 'flu', covid: 'COVID-19', rsv: 'RSV' };
const CONTRIBUTOR_NAMES = {
  edVisits: 'emergency-department visits',
  ari: 'CDC’s acute respiratory illness rating',
  wastewater: 'wastewater',
  positivity: 'lab test positivity',
};

const lastFinite = (arr) => {
  const c = (arr || []).filter(Number.isFinite);
  return c.length ? c[c.length - 1] : null;
};

/** "Maryland’s", but "Texas’" / "Illinois’". */
const possessive = (name) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

function listJoin(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Direction in words, scaled to the level so tiny moves read as tiny. */
function movement(level, trend) {
  const dir = trend?.direction;
  if (!dir || trend.label === 'Not enough data') return '';
  const low = !Number.isFinite(level) || level <= 1;
  if (dir === 'up') return low ? 'edging up' : 'rising';
  if (dir === 'down') return low ? 'easing' : 'falling';
  return 'holding steady';
}

const withMovement = (label, level, trend) => {
  const m = movement(level, trend);
  return m ? `${label.toLowerCase()} and ${m}` : label.toLowerCase();
};

/**
 * @param {object} state  { name, abbr }
 * @param {object} model  computeModel(signals)
 * @param {object} signals the state's signal bundle
 * @param {object} opts   { live: boolean, peers: [{ name, level }] } — peers
 *   are the other states in the same HHS region.
 * @returns {{ lead: string, text: string }[]} empty unless live with data
 */
export function weeklyTakeaways(state, model, signals = {}, { live = false, peers = [] } = {}) {
  if (!live || !Number.isFinite(model?.level)) return [];
  const name = state.name;
  const out = [];

  // 1. Overall, plus CDC's own categorical rating when it reported one.
  const ari = signals.ariLabel || (Number.isFinite(signals.ariLevel) ? ['Very Low', 'Low', 'Moderate', 'High', 'Very High'][signals.ariLevel] : '');
  out.push({
    lead: 'Overall',
    text:
      `Combined flu, RSV and COVID-19 activity in ${name} is ${withMovement(model.label, model.level, model.trend)}.` +
      (ari ? ` CDC rates acute respiratory illness activity in the state as ${ari}.` : ''),
  });

  // 2. Flu — the reading most people came for.
  const flu = model.pathogens?.influenza;
  const fluEd = lastFinite(signals.pathogens?.influenza?.edPercentSeries);
  const fluWw = lastFinite(signals.pathogens?.influenza?.wastewaterSeries);
  if (fluEd != null && Number.isFinite(flu?.level)) {
    out.push({
      lead: 'Flu',
      text: `Influenza accounted for ${formatPct(fluEd)} of emergency-department visits — ${withMovement(flu.label, flu.level, flu.trend)}.`,
    });
  } else if (fluWw != null && Number.isFinite(flu?.level)) {
    out.push({ lead: 'Flu', text: `Flu viral activity in wastewater is ${withMovement(flu.label, flu.level, flu.trend)}.` });
  } else {
    out.push({ lead: 'Flu', text: `There is no current influenza reading for ${name} this week.` });
  }

  // 3. Which of the three is most common in emergency departments.
  const ed = Object.keys(VIRUS_NAMES)
    .map((key) => ({ key, v: lastFinite(signals.pathogens?.[key]?.edPercentSeries) }))
    .filter((x) => x.v != null);
  if (ed.length === 3) {
    const sorted = [...ed].sort((a, b) => b.v - a.v);
    const [top, second] = sorted;
    const others = sorted.slice(1).map((x) => `${formatPct(x.v)} ${VIRUS_NAMES[x.key]}`);
    if (top.v > 0 && top.v > second.v) {
      const topName = VIRUS_NAMES[top.key];
      out.push({
        lead: 'Most common',
        text: `${topName[0].toUpperCase()}${topName.slice(1)} is the most common of the three in ${possessive(name)} emergency departments (${formatPct(top.v)} of visits, against ${listJoin(others)}).`,
      });
    } else if (top.v > 0) {
      out.push({ lead: 'Most common', text: `No single virus leads in ${possessive(name)} emergency departments this week (${listJoin(sorted.map((x) => `${formatPct(x.v)} ${VIRUS_NAMES[x.key]}`))}).` });
    }
  }

  // 4. Wastewater — or, when there is none, what the level rests on.
  const ww = Object.keys(VIRUS_NAMES)
    .map((key) => ({ key, v: lastFinite(signals.pathogens?.[key]?.wastewaterSeries) }))
    .filter((x) => x.v != null)
    .sort((a, b) => b.v - a.v);
  if (ww.length) {
    const top = ww[0];
    const label = SEVERITY_LABELS[bucketize(top.v, BREAKPOINTS.wastewater)].toLowerCase();
    out.push({
      lead: 'Wastewater',
      text: `${VIRUS_NAMES[top.key] === 'flu' ? 'Flu' : VIRUS_NAMES[top.key]} shows the most viral activity in ${possessive(name)} wastewater (activity index ${top.v.toFixed(1)}, ${label} on FluTrack’s scale) — a signal that often moves before clinic visits do.`,
    });
  } else {
    const basis = (model.contributors || []).map((c) => CONTRIBUTOR_NAMES[c]).filter(Boolean);
    out.push({
      lead: 'Wastewater',
      text: `No wastewater reading is available for ${name} this week${basis.length ? `, so this level rests on ${listJoin(basis)}` : ''}.`,
    });
  }

  // 5. Nearby states (same HHS region).
  const ranked = peers.filter((p) => Number.isFinite(p.level));
  if (ranked.length) {
    const higher = ranked.filter((p) => p.level > model.level).length;
    const lower = ranked.filter((p) => p.level < model.level).length;
    const m = ranked.length;
    let text;
    const every = m === 1 ? 'the only other state' : m === 2 ? 'both other states' : `all ${m} other states`;
    const all = (n) => (n === m ? every : `${n} of ${m} other states`);
    if (!higher && !lower) text = `${every[0].toUpperCase()}${every.slice(1)} in ${possessive(name)} HHS region ${m === 1 ? 'is' : 'are'} also at a ${model.label.toLowerCase()} level.`;
    // Ties are stated: "highest" with two states level alongside is not the highest.
    else if (!higher) text = `${name} ${lower < m ? 'is tied for' : 'has'} the highest level in its HHS region — ${all(lower)} ${lower === 1 ? 'is' : 'are'} lower.`;
    else if (!lower) text = `${name} ${higher < m ? 'is tied for' : 'has'} the lowest level in its HHS region — ${all(higher)} ${higher === 1 ? 'is' : 'are'} higher.`;
    else text = `Of the ${m} other states in ${possessive(name)} HHS region, ${higher} ${higher === 1 ? 'is' : 'are'} at a higher level and ${lower} lower.`;
    out.push({ lead: 'Nearby states', text });
  }

  return out.slice(0, 5);
}

/** The rendered block, or '' when there is nothing honest to say. */
export function takeawaysBlock(state, model, signals, { live = false, peers = [], weekEnding = '' } = {}) {
  const items = weeklyTakeaways(state, model, signals, { live, peers });
  if (!items.length) return '';
  const asOf = weekEnding ? `Week ending ${escapeHtml(formatDate(weekEnding))} · ` : '';
  return `<section class="takeaways" aria-labelledby="takeaways-title">
    <div class="section-head section-rule">
      <h2 id="takeaways-title" style="font-size: var(--step-2)">This week in ${escapeHtml(state.name)}, in plain English</h2>
      <p class="text-secondary">${asOf}what the latest public CDC surveillance data shows.</p>
    </div>
    <ul class="takeaways__list">${items.map((t) => `<li><strong>${escapeHtml(t.lead)}:</strong> ${escapeHtml(t.text)}</li>`).join('')}</ul>
  </section>`;
}
