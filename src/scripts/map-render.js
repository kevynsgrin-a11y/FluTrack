// ===========================================================================
// US tile-grid cartogram renderer. It remains server-rendered link markup and
// becomes a roving-tabindex geographic grid when map-keyboard.js is available.
// ===========================================================================

import { escapeHtml } from './util.js';
import { SEVERITY_LABELS } from './threat-index.js';
import { TILE, GRID } from './us-tilegrid.js';

const SIZE = 42;
const PITCH = 50;
const PAD = 4;
const LEVEL_GLYPHS = ['·', '−', '=', '≋', '✚'];

function patternDefs() {
  const colors = ['#127c74', '#3e8fb0', '#e8b21f', '#d4541e', '#8c1d33'];
  const detail = [
    '<path d="M-3 3 3-3M0 12 12 0M9 15 15 9" stroke="#fff" stroke-opacity=".38" stroke-width="1"/>',
    '<circle cx="3" cy="3" r="1.15" fill="#fff" fill-opacity=".65"/>',
    '<path d="M-2 6 6-2M2 12 12 2M8 16 16 8" stroke="#fff" stroke-opacity=".58" stroke-width="1.15"/>',
    '<path d="M-2 6 6-2M2 12 12 2M8 16 16 8M3 0 15 12" stroke="#fff" stroke-opacity=".63" stroke-width="1.15"/>',
    '<path d="M-2 4 4-2M0 10 10 0M6 14 14 6M-2 12 12-2M4 16 16 4" stroke="#fff" stroke-opacity=".72" stroke-width="1.25"/>',
  ];
  return colors.map((color, i) => `<pattern id="map-pattern-${i}" width="${i === 1 ? 6 : 10}" height="${i === 1 ? 6 : 10}" patternUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="${color}"/>${detail[i]}</pattern>`).join('');
}

/** @param entries array of { abbr, name, slug, level, label } */
export function usMap(entries, opts = {}) {
  const byAbbr = new Map(entries.map((e) => [e.abbr, e]));
  const w = GRID.cols * PITCH - (PITCH - SIZE) + PAD * 2;
  const h = GRID.rows * PITCH - (PITCH - SIZE) + PAD * 2;
  const tiles = Object.entries(TILE)
    .map(([abbr, [row, col]]) => {
      const e = byAbbr.get(abbr) || { abbr, name: abbr, slug: '', level: null, label: 'No data' };
      const x = col * PITCH + PAD;
      const y = row * PITCH + PAD;
      const hasData = Number.isFinite(e.level);
      const sevAttr = hasData ? ` data-sev="${e.level}"` : '';
      const selected = opts.selected === abbr ? ' is-selected' : '';
      const aria = `${escapeHtml(e.name)}: ${escapeHtml(e.label || 'No data')}${hasData ? `, level ${e.level}` : ''}. View ${escapeHtml(e.name)} report.`;
      return `<a class="us-tile${selected}"${sevAttr} data-abbr="${abbr}" data-row="${row}" data-col="${col}" href="/state/${escapeHtml(e.slug)}/" aria-label="${aria}" tabindex="0">
        <title>${escapeHtml(e.name)} — ${escapeHtml(e.label || 'No data')}</title>
        <rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="2"></rect>
        <text x="${x + SIZE / 2}" y="${y + SIZE / 2 + 1}" text-anchor="middle" dominant-baseline="central">${abbr}</text>
      </a>`;
    })
    .join('\n    ');
  return `<div class="us-map" role="region" aria-label="United States respiratory activity by state">
    ${mapLegend()}
    <div class="us-map__frame">
      <svg class="us-map__svg" viewBox="0 0 ${w} ${h}" role="group" aria-label="United States respiratory activity map. Use arrow keys after entering the map to move geographically between state reports." preserveAspectRatio="xMidYMid meet">
        <defs>${patternDefs()}</defs>
        ${tiles}
      </svg>
    </div>
    <p class="us-map__hint muted">Tap or select a state for its full report.</p>
  </div>`;
}

export function mapLegend() {
  const chips = SEVERITY_LABELS.map((label, i) => `<span class="map-legend__item" data-sev="${i}"><span class="map-legend__swatch" aria-hidden="true">${LEVEL_GLYPHS[i]}</span><span>${escapeHtml(label)}</span><span aria-label="level ${i}">${i}</span></span>`).join('');
  return `<div class="map-legend"><span class="map-legend__title">Activity</span>${chips}<span class="map-legend__item"><span class="map-legend__swatch map-legend__swatch--empty" aria-hidden="true">—</span><span>No data</span></span></div>`;
}
