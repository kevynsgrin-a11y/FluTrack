// ===========================================================================
// "Check your area" result card — pure HTML, shared by the server-rendered
// (no-JS) result page and the browser widget, so both show identical markup.
//
// Order is the editorial contract: OFFICIAL CDC data first (state level,
// hospital admissions, county wastewater), community reports last and
// labeled as unverified. Every official figure carries its source, its week
// ending and when we fetched it. No ad slots live in or next to this card.
// ===========================================================================

import { escapeHtml, formatDate } from './util.js';
import { levelToken, sparkline } from './render.js';
import { labelToLevel } from './threat-index.js';

export const CDC_SYMPTOMS_URL = 'https://www.cdc.gov/flu/signs-symptoms/index.html';

const esc = escapeHtml;
const fmtDate = (iso) => (iso ? formatDate(String(iso).slice(0, 10)) : '');

/** Source, observation week and retrieval date have separate meanings. */
export function sourceChip(chip) {
  if (!chip) return '';
  const age = Number.isFinite(chip.age_days) ? chip.age_days : null;
  const ageBadge = age == null ? '' : `<span class="age-badge"${chip.stale ? ' data-stale="true"' : ''}>${age} day${age === 1 ? '' : 's'} old</span>`;
  return `<li class="source-chip"><span>CDC ${esc(chip.short || chip.system)}${chip.geography ? ` · ${esc(chip.geography)}` : ''}</span><span>${chip.week_ending ? `week ending ${esc(fmtDate(chip.week_ending))}` : 'observation period unavailable'}</span>${
    chip.fetched_at ? `<span>retrieved ${esc(fmtDate(chip.fetched_at))}</span>` : ''
  }${ageBadge}</li>`;
}

function stateBlock(payload) {
  const { level, location } = payload;
  const where = location.state_name || location.state;
  const heading = `<h3 class="result__k">Respiratory level · ${esc(where)} · state</h3>`;
  if (!level || !Number.isFinite(level.level) || !level.week_ending || !['sample', 'live'].includes(level.kind)) {
    return `<div class="result__row">${heading}<p class="muted">No usable dated respiratory index is available. Current activity is unknown; missing data does not mean low activity.</p></div>`;
  }
  const sample = level.kind === 'sample';
  const historic = !sample && level.stale;
  const label = sample ? `${level.label} (sample)` : historic ? `Historical ${level.label}` : level.label;
  return `<div class="result__row">${heading}
    <div class="result__v">${levelToken(level.level, label)}</div>
    <p class="result__note">${sample ? 'Illustrative sample data — demonstration only.' : "FluTrack's combined flu, RSV and COVID-19 index, derived from CDC surveillance observations."} ${sample ? 'Illustrative period ending' : 'Observations for week ending'} ${esc(fmtDate(level.week_ending))}.</p>
    ${historic ? '<p class="result__note"><span class="age-badge" data-stale="true">Historical data</span> Current activity is unknown; newer observation data is unavailable.</p>' : ''}</div>`;
}

function nhsnBlock(h) {
  if (!h) {
    return `<div class="result__row"><h3 class="result__k">Flu hospital admissions · state</h3><p class="muted">No usable hospital admission data is available for this state. Missing data does not mean zero admissions.</p></div>`;
  }
  const lvl = labelToLevel(h.level_label);
  const rate = Number.isFinite(h.rate_per_100k) ? `${h.rate_per_100k.toFixed(2)} per 100,000 people` : '';
  const observations = (h.series || []).filter((p) => Number.isFinite(p.value));
  const pts = observations.map((p) => p.value);
  const dir = pts.length >= 2 ? (pts.at(-1) > pts[0] ? 'up' : pts.at(-1) < pts[0] ? 'down' : 'flat') : 'flat';
  return `<div class="result__row"><h3 class="result__k">Flu hospital admissions · state</h3>
    <div class="result__v">${h.level_label && h.level_label !== 'Data Unavailable' ? levelToken(lvl, h.stale ? `Historical ${h.level_label}` : h.level_label) : '<span class="muted">Level not reported</span>'}${
      rate ? `<span class="result__num">${esc(rate)}</span>` : ''
    }</div>
    <p class="result__note">Statewide hospital admissions for ${h.week_ending ? `week ending ${esc(fmtDate(h.week_ending))}` : 'an unavailable observation period'}.</p>
    ${h.stale ? '<p class="result__note"><span class="age-badge" data-stale="true">Historical admission data</span> Newer admission data is unavailable; this figure does not describe current admissions.</p>' : ''}
    ${pts.length >= 2 ? `<div class="result__spark" role="img" aria-label="Flu admissions per 100,000, ${pts.length} reported periods: ${observations.map((p) => `${esc(fmtDate(p.week_ending))}: ${p.value.toFixed(2)}`).join('; ')}">${sparkline(pts, { width: 160, height: 36, direction: dir })}<span class="muted">${pts.length} reported periods</span></div>` : ''}</div>`;
}

function wastewaterBlock(h, location) {
  const county = location.county_name || 'your county';
  if (!location.county_fips) {
    return `<div class="result__row"><h3 class="result__k">Wastewater · flu A</h3><p class="muted">Add your ZIP code to see county wastewater data.</p></div>`;
  }
  if (!h) {
    return `<div class="result__row"><h3 class="result__k">Wastewater · flu A · ${esc(county)}</h3><p class="muted">No usable wastewater reading is available from sites serving this county. Missing data does not mean low viral activity.</p></div>`;
  }
  if (h.stale) {
    return `<div class="result__row"><h3 class="result__k">Wastewater · flu A · ${esc(county)}</h3><p class="muted">No recent wastewater data — the last report was for the week ending ${esc(fmtDate(h.week_ending))}.</p></div>`;
  }
  const lvl = labelToLevel(h.level_label);
  return `<div class="result__row"><h3 class="result__k">Wastewater · flu A · ${esc(county)}</h3>
    <div class="result__v">${levelToken(lvl, h.level_label || 'Reported')}<span class="result__num">WVAL ${esc(Number(h.value).toFixed(1))}</span></div>
    <p class="result__note">${h.sites ? `${esc(h.sites)} reporting sampling site${h.sites === 1 ? '' : 's'} serving this county. ` : ''}WVAL is a viral activity index, not a percentage of people infected. ${h.week_ending ? `Week ending ${esc(fmtDate(h.week_ending))}.` : 'Observation period unavailable.'}</p></div>`;
}

function communityBlock(c, location) {
  const county = location.county_name || location.state_name || 'your area';
  if (!c) return '';
  if (c.suppressed) {
    return `<div class="result__row result__row--community"><h3 class="result__k">Community reports · ${esc(county)}</h3>
      <p><span class="badge">${esc(c.badge)}</span></p><p class="result__note">${esc(c.label)}</p>
      <p class="result__note muted">${esc(c.note)}</p></div>`;
  }
  const pos = c.n_pos_flu > 0 ? `<p class="result__note">${esc(c.n_pos_flu)} reported a positive flu test (self-reported).</p>` : '';
  return `<div class="result__row result__row--community"><h3 class="result__k">Community reports · ${esc(county)}</h3>
    <p><span class="badge"${c.elevated ? ' data-elevated="true"' : ''}>${esc(c.badge)}</span></p>
    <p class="result__note">${esc(c.label)}</p>${pos}
    <p class="result__note muted">${esc(c.note)}</p></div>`;
}

/** The text shared via the Web Share API: the OFFICIAL level only, never symptoms. */
export function shareText(payload) {
  const where = payload.location.state_name || payload.location.state;
  const level = payload.level;
  if (!level || !Number.isFinite(level.level) || !level.week_ending || !['sample', 'live'].includes(level.kind)) {
    return `No usable dated respiratory index for ${where}; current activity is unknown — via FluTrack`;
  }
  const period = fmtDate(level.week_ending);
  if (level.kind === 'sample') return `Illustrative sample respiratory index for ${where}, period ending ${period}; demonstration only — via FluTrack`;
  return `${level.stale ? 'Historical' : 'Reported'} CDC-based respiratory index for ${where}: ${level.label}, week ending ${period}${level.stale ? '; current activity is unknown' : ''} — via FluTrack`;
}

/**
 * @param {object} payload  /api/area payload
 * @param {object} [opts]
 * @param {string} [opts.heading]  e.g. "Thanks — your report was counted."
 * @param {string} [opts.staticMap] server-rendered SVG for the no-JS page
 */
export function resultCard(payload, opts = {}) {
  const { location, highlights = {}, community, meaning, sources = [] } = payload;
  const placeName = location.county_name ? `${location.county_name}, ${location.state}` : location.state_name || location.state;
  const via = location.source === 'zip' ? 'from the ZIP code you entered' : 'approximate, from your internet connection';
  const anyStale = sources.some((s) => s.stale);
  return `<article class="result" aria-labelledby="result-title" data-state="${esc(location.state)}" data-level="${esc(payload.level?.level ?? '')}">
    ${opts.heading ? `<p class="result__thanks" role="status">${esc(opts.heading)}</p>` : ''}
    <header class="result__head">
      <h2 id="result-title" class="result__title">${esc(placeName)}</h2>
      <p class="muted result__where">Location ${esc(via)}. ${anyStale ? '<span class="age-badge" data-stale="true">Some data is more than 14 days old</span>' : ''}</p>
    </header>
    <div class="result__official">
      ${stateBlock(payload)}
      ${nhsnBlock(highlights.nhsn_flu)}
      ${wastewaterBlock(highlights.wastewater_flu, location)}
    </div>
    ${opts.staticMap ? `<div class="result__map">${opts.staticMap}</div>` : '<div class="globe" data-globe aria-hidden="true"><span class="globe__placeholder">🌎</span></div>'}
    <p class="result__meaning"><strong>What this means:</strong> ${esc(meaning)}</p>
    ${communityBlock(community, location)}
    ${sources.length ? `<ul class="source-chips" aria-label="Data sources">${sources.map(sourceChip).join('')}</ul>` : ''}
    <div class="result__actions">
      <button class="btn btn--secondary" type="button" data-share="${esc(shareText(payload))}" hidden>Share this reading</button>
      <a class="btn btn--ghost" href="/state/${esc(slug(location.state_name || ''))}/">Full ${esc(location.state_name || location.state)} report</a>
    </div>
    <p class="result__emergency"><strong>Emergency?</strong> Trouble breathing, chest pain or pressure, confusion, or bluish lips — call 911 or go to the nearest emergency room.</p>
    <p class="result__fine muted">Not medical advice. FluTrack shows surveillance data, not a diagnosis. <a href="${CDC_SYMPTOMS_URL}" rel="noopener">CDC: flu symptoms</a> · <a href="/medical-disclaimer/">Medical disclaimer</a></p>
  </article>`;
}

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
