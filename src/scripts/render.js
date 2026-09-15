// ===========================================================================
// Shared render library — pure markup functions for build and live refresh.
// The health-data model and its strings remain unchanged; only the structural
// presentation is rebuilt for the public-health bulletin interface.
// ===========================================================================

import { escapeHtml, formatPct, formatChange, formatDate } from './util.js';
import { SEVERITY_LABELS, levelLabel } from './threat-index.js';

const PATHOGEN_META = {
  influenza: { name: 'Influenza (Flu)', short: 'Flu' },
  covid: { name: 'COVID-19', short: 'COVID' },
  rsv: { name: 'RSV', short: 'RSV' },
};

const LEVEL_GLYPHS = ['·', '−', '=', '≋', '✚'];

/** Decorative sparkline. The accompanying word and trend shape carry meaning. */
export function sparkline(series, { width = 120, height = 32, direction = 'flat' } = {}) {
  const pts = (series || []).filter((n) => Number.isFinite(n));
  const stroke = direction === 'up' ? 'var(--trend-up)' : direction === 'down' ? 'var(--trend-down)' : 'var(--trend-flat)';
  if (pts.length < 2) return `<svg class="spark" width="${width}" height="${height}" aria-hidden="true"></svg>`;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = width / (pts.length - 1);
  const pad = 3;
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
  const coords = pts.map((v, i) => [i * stepX, y(v)]);
  const line = coords.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`).join(' ');
  const [lx, ly] = coords[coords.length - 1];
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.5" fill="${stroke}"/>
  </svg>`;
}

/** A severity specimen always includes pattern, glyph, word and numeric rank. */
export function levelToken(level, label = '') {
  const valid = Number.isFinite(level);
  const safeLevel = valid ? Math.max(0, Math.min(4, Math.round(level))) : 0;
  const word = label || (valid ? levelLabel(safeLevel) : 'No data');
  const glyph = valid ? LEVEL_GLYPHS[safeLevel] : '—';
  return `<span class="level-token"${valid ? ` data-sev="${safeLevel}"` : ''}>
    <span class="level-token__swatch" aria-hidden="true">${glyph}</span>
    <span class="level-token__word">${escapeHtml(word)}</span>
    ${valid ? `<span class="level-token__index" aria-label="level ${safeLevel}">${safeLevel}</span>` : ''}
  </span>`;
}

/** The gauge uses tick marks and named thresholds instead of a dashboard arc. */
export function arcGauge(model) {
  const score = Number.isFinite(model.composite) ? model.composite : 0;
  const level = Number.isFinite(model.level) ? model.level : 0;
  const noData = !Number.isFinite(model.composite);
  const angle = -90 + (score / 100) * 180;
  const tick = (i) => {
    const a = (-180 + i * 45) * (Math.PI / 180);
    const x1 = 120 + Math.cos(a) * 84;
    const y1 = 120 + Math.sin(a) * 84;
    const x2 = 120 + Math.cos(a) * 91;
    const y2 = 120 + Math.sin(a) * 91;
    return `<line class="gauge__threshold" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  };
  const labels = SEVERITY_LABELS.map((name, i) => {
    const a = (-180 + i * 45) * (Math.PI / 180);
    const x = 120 + Math.cos(a) * 106;
    const y = 120 + Math.sin(a) * 106;
    return `<text class="gauge__threshold-label" x="${x.toFixed(1)}" y="${(y + (i === 0 || i === 4 ? 4 : 0)).toFixed(1)}" text-anchor="middle">${escapeHtml(name)}</text>`;
  }).join('');
  const ticks = Array.from({ length: 5 }, (_, i) => tick(i)).join('');
  return `<svg class="gauge" data-sev="${level}" viewBox="0 0 240 146" role="img" aria-label="Composite activity score ${noData ? 'unavailable' : `${score} of 100`}, ${escapeHtml(model.label)}">
    <path class="gauge__track" d="M36 120 A84 84 0 0 1 204 120"></path>
    ${ticks}
    <line class="gauge__needle" x1="120" y1="120" x2="120" y2="49" style="--needle-angle:${angle}deg"></line>
    <circle class="gauge__hub" cx="120" cy="120" r="4"></circle>
    <text class="gauge__score" x="120" y="105" text-anchor="middle">${noData ? '—' : score}</text>
    <text class="gauge__unit" x="120" y="139" text-anchor="middle">activity index / 100</text>
    ${labels}
  </svg>`;
}

/** Structural provenance removes the inherited middle-dot metadata string. */
export function provenanceStrip(provenance = {}) {
  const badge = provenance.live
    ? `<span class="prov__live"><span class="prov__dot" aria-hidden="true"></span>Live CDC data</span>`
    : `<span class="prov__live prov__live--sample">Sample data</span>`;
  return `<div class="prov" role="note">
    <span class="prov__src">CDC surveillance</span>
    <span class="prov__tags" aria-label="Sources"><span>NSSP</span><span>NWSS</span><span>NREVSS</span></span>
    <span>Updated weekly</span>
    ${badge}
  </div>`;
}

export function severityMeter(level) {
  const on = Number.isFinite(level) ? level : -1;
  const segs = SEVERITY_LABELS.map((_, i) => `<span class="meter__seg" data-on="${i <= on}"></span>`).join('');
  return `<div class="meter" role="img" aria-label="Severity ${on >= 0 ? on + 1 : 0} of 5: ${escapeHtml(levelLabel(on >= 0 ? on : 0))}">${segs}</div>
  <div class="meter__scale" aria-hidden="true"><span>Minimal</span><span>Very High</span></div>`;
}

export function provenanceBadge(provenance = {}) {
  if (provenance.live) return `<span class="badge badge--live"><span class="badge__dot" aria-hidden="true"></span>Live CDC data</span>`;
  return `<span class="badge badge--cached" title="Live CDC feed not loaded yet">Sample data</span>`;
}

function trendShape(direction) {
  const shapes = {
    up: '<path d="M1 10 6 5l4 3 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><path d="M13 2h3v3" fill="none" stroke="currentColor" stroke-width="2"/>',
    down: '<path d="M1 3 6 8l4-3 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><path d="M13 14h3v-3" fill="none" stroke="currentColor" stroke-width="2"/>',
    flat: '<path d="M1 8h15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><path d="M5 5v6M12 5v6" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  };
  return `<svg class="trend__shape" viewBox="0 0 17 16" aria-hidden="true" focusable="false">${shapes[direction] || shapes.flat}</svg>`;
}

export function trendChip(trend) {
  if (!trend) return '';
  const cls = `trend trend--${trend.direction}`;
  const change = trend.direction === 'flat' ? trend.label : `${trend.label} ${formatChange(trend.changePct)}`;
  return `<span class="${cls}">${trendShape(trend.direction)}<span>${escapeHtml(change)}</span></span>`;
}

export function threatCard(state, model, opts = {}) {
  const level = Number.isFinite(model.level) ? model.level : 0;
  const noData = !Number.isFinite(model.level);
  const asOf = opts.weekEnding ? formatDate(opts.weekEnding) : '';
  return `<article class="threat" data-sev="${level}" aria-labelledby="threat-level">
    <div class="threat__head">
      <h2 class="threat__label" id="threat-level"><span>Respiratory threat level</span><span aria-hidden="true">/</span><span>${escapeHtml(state.name)}</span></h2>
      ${provenanceBadge(opts.provenance)}
    </div>
    <div class="threat__body">
      <div class="threat__readout">
        <p class="threat__level">${noData ? 'No data' : escapeHtml(model.label)}</p>
        <p class="threat__meta">${escapeHtml(threatSentence(state, model))}${asOf ? ` <span class="muted">as of ${escapeHtml(asOf)}</span>` : ''}</p>
        <div class="cluster">
          ${trendChip(model.trend)}
          ${levelToken(model.level, model.label)}
          <span class="badge"><span>Flu</span><span>RSV</span><span>COVID-19</span><span>combined</span></span>
        </div>
      </div>
      <div class="threat__gauge" aria-hidden="${noData}">${arcGauge(model)}</div>
    </div>
    <div class="threat__meter">${severityMeter(model.level)}</div>
  </article>`;
}

function threatSentence(state, model) {
  if (!Number.isFinite(model.level)) return `Surveillance data for ${state.name} is not currently available.`;
  const map = { up: 'and rising', down: 'and easing', flat: 'and holding steady' };
  const dir = map[model.trend?.direction] || '';
  return `Combined flu, RSV and COVID-19 activity is ${model.label.toLowerCase()} ${dir}`.trim() + '.';
}

export function pathogenTiles(model) {
  return `<div class="pathogens">${['influenza', 'covid', 'rsv'].map((key) => pathogenTile(key, model.pathogens[key])).join('')}</div>`;
}

function pathogenTile(key, p) {
  const meta = PATHOGEN_META[key];
  const level = Number.isFinite(p?.level) ? p.level : null;
  const label = p?.label || 'No data';
  const spark = p?.trend ? sparkline(sparkSeriesFor(p), { direction: p.trend.direction }) : '';
  return `<div class="pathogen"${level != null ? ` data-sev="${level}"` : ''}>
    <p class="pathogen__name">${escapeHtml(meta.name)}</p>
    <div class="pathogen__level">${levelToken(level, label)}</div>
    <div class="pathogen__spark">${spark}</div>
    <p class="pathogen__foot">${p?.trend ? trendChip(p.trend) : 'Awaiting data'}</p>
  </div>`;
}

function sparkSeriesFor(p) { return p._series || []; }

export function stateChip(state, model) {
  const level = Number.isFinite(model?.level) ? model.level : null;
  const label = level != null ? model.label : '—';
  const glyph = level != null ? LEVEL_GLYPHS[level] : '—';
  return `<a class="state-chip" href="/state/${state.slug}/"${level != null ? ` data-sev="${level}"` : ''}>
    <span class="state-chip__name">${escapeHtml(state.name)}</span>
    <span class="state-chip__status"><span class="state-chip__mark" aria-hidden="true">${glyph}</span><span>${escapeHtml(label)}</span>${level != null ? `<span aria-label="level ${level}">${level}</span>` : ''}</span>
  </a>`;
}

export function signalRows(signals = {}) {
  const rows = [];
  const ed = signals.edCombinedSeries?.at?.(-1);
  if (Number.isFinite(ed)) rows.push(row('ED visits for respiratory illness', formatPct(ed), 'Share of emergency-department visits (NSSP)'));
  const ww = signals.wastewaterSeries?.at?.(-1);
  if (Number.isFinite(ww)) rows.push(row('Wastewater viral activity', ww.toFixed(1), 'CDC NWSS viral activity index (leading indicator)'));
  if (Number.isFinite(signals.positivityCombined)) rows.push(row('Test positivity', formatPct(signals.positivityCombined), 'Share of lab tests positive (NREVSS)'));
  if (!rows.length) return '<p class="muted">No signal detail available for this area.</p>';
  return `<div class="signal-ledger">${rows.join('')}</div>`;
}

function row(name, value, hint) {
  return `<div class="signal-row"><span class="signal-row__name">${escapeHtml(name)}<br><span class="field__hint">${escapeHtml(hint)}</span></span><span class="signal-row__val">${escapeHtml(value)}</span></div>`;
}
