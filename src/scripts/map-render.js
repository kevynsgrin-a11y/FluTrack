// ===========================================================================
// US tile-grid cartogram renderer — the site's signature data visual.
// Pure functions (strings only), shared by the Node build (SSR, pre-colored)
// and the browser (recolor on live CDC data). Each state is an <a> link, so the
// map is fully keyboard-navigable and works with zero JavaScript.
// ===========================================================================

import { escapeHtml } from './util.js';
import { SEVERITY_LABELS } from './threat-index.js';
import { TILE, GRID } from './us-tilegrid.js';

const SIZE = 42; // tile size
const PITCH = 50; // tile size + gap
const PAD = 4;

/**
 * @param entries array of { abbr, name, slug, level (0-4|null), label }
 * @param opts { selected: abbr, idPrefix }
 */
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
      const aria = `${escapeHtml(e.name)}: ${escapeHtml(e.label || 'No data')}. View ${escapeHtml(e.name)} report.`;
      return `<a class="us-tile${selected}"${sevAttr} data-abbr="${abbr}" href="/state/${escapeHtml(
        e.slug
      )}/" aria-label="${aria}" tabindex="0">
      <title>${escapeHtml(e.name)} — ${escapeHtml(e.label || 'No data')}</title>
      <rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="8" style="animation-delay:${(row + col) * 22}ms"></rect>
      <text x="${x + SIZE / 2}" y="${y + SIZE / 2 + 1}" text-anchor="middle" dominant-baseline="central">${abbr}</text>
    </a>`;
    })
    .join('\n    ');

  return `<div class="us-map" role="group" aria-label="United States respiratory activity by state">
    ${mapLegend()}
    <svg class="us-map__svg" viewBox="0 0 ${w} ${h}" role="presentation" preserveAspectRatio="xMidYMid meet">
    ${tiles}
    </svg>
    <p class="us-map__hint muted">Tap or select a state for its full report.</p>
  </div>`;
}

/** The severity legend (Minimal → Very High) — placed above the map. */
export function mapLegend() {
  const chips = SEVERITY_LABELS.map(
    (label, i) =>
      `<span class="map-legend__item"><span class="map-legend__swatch" data-sev="${i}"></span>${escapeHtml(
        label
      )}</span>`
  ).join('');
  return `<div class="map-legend" aria-hidden="true"><span class="map-legend__title">Activity</span>${chips}<span class="map-legend__item"><span class="map-legend__swatch map-legend__swatch--empty"></span>No data</span></div>`;
}
