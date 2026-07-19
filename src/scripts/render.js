// ===========================================================================
// Shared render library — pure functions returning HTML strings.
//
// Imported by BOTH the Node build (to emit static HTML) and the browser app
// (to re-render regions when live data arrives). Because both sides call the
// exact same functions, the static markup and the hydrated markup are identical
// — no flicker, no mismatch. No DOM APIs are used here; strings only.
// ===========================================================================

import { escapeHtml, formatPct, formatChange, formatDate, trendGlyph } from './util.js';
import { SEVERITY_LABELS, levelLabel } from './threat-index.js';

const PATHOGEN_META = {
  influenza: { name: 'Influenza (Flu)', short: 'Flu' },
  covid: { name: 'COVID-19', short: 'COVID' },
  rsv: { name: 'RSV', short: 'RSV' },
};

/**
 * Inline SVG sparkline for a numeric series. Colored by trend direction.
 * Decorative for sighted users (the number + trend chip carry the meaning), so
 * it is aria-hidden; callers provide accessible text alongside.
 */
export function sparkline(series, { width = 120, height = 32, direction = 'flat' } = {}) {
  const pts = (series || []).filter((n) => Number.isFinite(n));
  const stroke =
    direction === 'up' ? 'var(--trend-up)' : direction === 'down' ? 'var(--trend-down)' : 'var(--trend-flat)';
  if (pts.length < 2) {
    return `<svg class="spark" width="${width}" height="${height}" aria-hidden="true"></svg>`;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = width / (pts.length - 1);
  const pad = 3;
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
  const coords = pts.map((v, i) => [i * stepX, y(v)]);
  const line = coords.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const [lx, ly] = coords[coords.length - 1];
  // Unique-enough gradient id so multiple sparklines on one page never collide
  // (duplicate SVG ids would make url(#id) resolve to the first gradient).
  const gid = `sp-${direction}-${Math.round(min * 100)}-${Math.round(max * 100)}-${pts.length}-${width}`;
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="${stroke}" stop-opacity="0.18"/>
    <stop offset="1" stop-color="${stroke}" stop-opacity="0"/>
  </linearGradient></defs>
  <path d="${area}" fill="url(#${gid})"/>
  <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.75" fill="${stroke}"/>
</svg>`;
}

/**
 * Semicircular "dashboard" gauge for the 0–100 composite score, stroked in the
 * current severity color. The big number is the editorial headline figure.
 */
export function arcGauge(model) {
  const score = Number.isFinite(model.composite) ? model.composite : 0;
  const level = Number.isFinite(model.level) ? model.level : 0;
  const R = 80;
  const circ = Math.PI * R; // semicircle arc length ≈ 251.3
  const dash = (score / 100) * circ;
  const noData = !Number.isFinite(model.composite);
  return `<svg class="gauge" data-sev="${level}" viewBox="0 0 200 126" role="img" aria-label="Composite activity score ${
    noData ? 'unavailable' : `${score} of 100`
  }, ${escapeHtml(model.label)}">
    <path class="gauge__track" d="M18 100 A82 82 0 0 1 182 100"></path>
    <path class="gauge__value" d="M18 100 A82 82 0 0 1 182 100" stroke-dasharray="${dash.toFixed(1)} ${(
    circ * 1.02
  ).toFixed(1)}"></path>
    <text class="gauge__score" x="100" y="90" text-anchor="middle">${noData ? '—' : score}</text>
    <text class="gauge__unit" x="100" y="112" text-anchor="middle">activity index / 100</text>
  </svg>`;
}

/** Trust-forward provenance strip: source wordmarks + cadence + live/sample dot. */
export function provenanceStrip(provenance = {}) {
  const badge = provenance.live
    ? `<span class="prov__live"><span class="prov__dot"></span>Live CDC data</span>`
    : `<span class="prov__live prov__live--sample">Sample data</span>`;
  return `<div class="prov" role="note">
    <span class="prov__src">CDC surveillance</span>
    <span class="prov__tags"><span>NSSP</span><span>NWSS</span><span>NREVSS</span></span>
    <span class="prov__sep" aria-hidden="true">·</span>
    <span>Updated weekly</span>
    <span class="prov__sep" aria-hidden="true">·</span>
    ${badge}
  </div>`;
}

/** Segmented 5-step severity meter. */
export function severityMeter(level) {
  const on = Number.isFinite(level) ? level : -1;
  const segs = SEVERITY_LABELS.map(
    (_, i) => `<span class="meter__seg" data-on="${i <= on}"></span>`
  ).join('');
  return `<div class="meter" role="img" aria-label="Severity ${
    on >= 0 ? on + 1 : 0
  } of 5: ${escapeHtml(levelLabel(on >= 0 ? on : 0))}">${segs}</div>
  <div class="meter__scale" aria-hidden="true"><span>Minimal</span><span>Very High</span></div>`;
}

/** Live / sample data provenance badge. */
export function provenanceBadge(provenance = {}) {
  if (provenance.live) {
    return `<span class="badge badge--live"><span class="badge__dot"></span>Live CDC data</span>`;
  }
  return `<span class="badge badge--cached" title="Live CDC feed not loaded yet">Sample data</span>`;
}

/** A trend chip: "▲ Rising +14%". */
export function trendChip(trend) {
  if (!trend) return '';
  const cls = `trend trend--${trend.direction}`;
  const glyph = trendGlyph(trend.direction);
  const change =
    trend.direction === 'flat' ? trend.label : `${trend.label} ${formatChange(trend.changePct)}`;
  return `<span class="${cls}"><span aria-hidden="true">${glyph}</span> ${escapeHtml(change)}</span>`;
}

/**
 * The headline threat gauge card for a state.
 * @param state  {name, abbr}
 * @param model  output of buildThreatModel()
 * @param opts   { weekEnding, provenance }
 */
export function threatCard(state, model, opts = {}) {
  const level = Number.isFinite(model.level) ? model.level : 0;
  const noData = !Number.isFinite(model.level);
  const asOf = opts.weekEnding ? formatDate(opts.weekEnding) : '';
  return `<article class="threat" data-sev="${level}" aria-labelledby="threat-level">
    <div class="threat__head">
      <p class="threat__label"><span class="threat__pip" aria-hidden="true"></span> Respiratory threat level · ${escapeHtml(
        state.name
      )}</p>
      ${provenanceBadge(opts.provenance)}
    </div>
    <div class="threat__body">
      <div class="threat__readout">
        <p class="threat__level" id="threat-level">${noData ? 'No data' : escapeHtml(model.label)}</p>
        <p class="threat__meta">${escapeHtml(threatSentence(state, model))}${
    asOf ? ` <span class="muted">· as of ${escapeHtml(asOf)}</span>` : ''
  }</p>
        <div class="cluster" style="margin-top: var(--space-md)">
          ${trendChip(model.trend)}
          <span class="badge">Flu · RSV · COVID-19 combined</span>
        </div>
      </div>
      <div class="threat__gauge" aria-hidden="${noData}">${arcGauge(model)}</div>
    </div>
    <div class="threat__meter">${severityMeter(model.level)}</div>
  </article>`;
}

function threatSentence(state, model) {
  if (!Number.isFinite(model.level)) {
    return `Surveillance data for ${state.name} is not currently available.`;
  }
  const map = {
    up: 'and rising',
    down: 'and easing',
    flat: 'and holding steady',
  };
  const dir = map[model.trend?.direction] || '';
  return `Combined flu, RSV and COVID-19 activity is ${model.label.toLowerCase()} ${dir}`.trim() + '.';
}

/** The three per-pathogen tiles. */
export function pathogenTiles(model) {
  return `<div class="pathogens">${['influenza', 'covid', 'rsv']
    .map((key) => pathogenTile(key, model.pathogens[key]))
    .join('')}</div>`;
}

function pathogenTile(key, p) {
  const meta = PATHOGEN_META[key];
  const level = Number.isFinite(p?.level) ? p.level : 0;
  const label = p && p.label ? p.label : 'No data';
  const spark = p && p.trend ? sparkline(sparkSeriesFor(p), { direction: p.trend.direction }) : '';
  return `<div class="pathogen" data-sev="${level}">
    <p class="pathogen__name">${escapeHtml(meta.name)}</p>
    <p class="pathogen__level">${escapeHtml(label)}</p>
    <div class="pathogen__spark">${spark}</div>
    <p class="pathogen__foot">${p && p.trend ? escapeHtml(p.trend.label) : 'Awaiting data'}${
    p && p.trend && p.trend.direction !== 'flat' ? ` ${escapeHtml(formatChange(p.trend.changePct))}` : ''
  }</p>
  </div>`;
}

// The pathogen model carries its trend but not the raw series; the app attaches
// a `_series` for the sparkline. Fall back gracefully when absent.
function sparkSeriesFor(p) {
  return p._series || [];
}

/** A compact state chip for the all-states index grid. */
export function stateChip(state, model) {
  const level = Number.isFinite(model?.level) ? model.level : -1;
  const label = model && Number.isFinite(model.level) ? model.label : '—';
  return `<a class="state-chip" href="/state/${state.slug}/" data-sev="${level < 0 ? 0 : level}">
    <span class="state-chip__name">${escapeHtml(state.name)}</span>
    <span class="cluster" style="gap: var(--space-xs)">
      <span class="muted">${escapeHtml(label)}</span>
      <span class="state-chip__dot"></span>
    </span>
  </a>`;
}

/** Signal breakdown rows for the state detail column. */
export function signalRows(signals = {}) {
  const rows = [];
  const ed = signals.edCombinedSeries?.at?.(-1);
  if (Number.isFinite(ed)) {
    rows.push(row('ED visits for respiratory illness', formatPct(ed), 'Share of emergency-department visits (NSSP)'));
  }
  const ww = signals.wastewaterSeries?.at?.(-1);
  if (Number.isFinite(ww)) {
    rows.push(row('Wastewater viral activity', ww.toFixed(1), 'CDC NWSS viral activity index (leading indicator)'));
  }
  if (Number.isFinite(signals.positivityCombined)) {
    rows.push(row('Test positivity', formatPct(signals.positivityCombined), 'Share of lab tests positive (NREVSS)'));
  }
  if (!rows.length) return '<p class="muted">No signal detail available for this area.</p>';
  return rows.join('');
}

function row(name, value, hint) {
  return `<div class="signal-row">
    <span class="signal-row__name">${escapeHtml(name)}<br><span class="field__hint">${escapeHtml(hint)}</span></span>
    <span class="signal-row__val">${escapeHtml(value)}</span>
  </div>`;
}
