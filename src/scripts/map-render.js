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
      <rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="8" style="animation-delay:${
        Math.min(row + col, 6) * 22
      }ms"></rect>
      <text x="${x + SIZE / 2}" y="${y + SIZE / 2 - 3}" text-anchor="middle" dominant-baseline="central">${abbr}</text>${
        hasData
          ? `\n      <text class="us-tile__lvl" x="${x + SIZE / 2}" y="${
              y + SIZE - 8
            }" text-anchor="middle" dominant-baseline="central" aria-hidden="true">${e.level}</text>`
          : ''
      }
    </a>`;
    })
    .join('\n    ');

  // The map is 51 consecutive tab stops in the middle of the page; give keyboard
  // users a way past it that does not require 51 presses.
  const skipId = `${opts.idPrefix || ''}skip-map`;
  return `<div class="us-map" role="group" aria-label="United States respiratory activity by state">
    <a class="skip-link skip-link--inline" href="#${skipId}">Skip the state map</a>
    ${mapLegend()}
    <svg class="us-map__svg" viewBox="0 0 ${w} ${h}" role="presentation" preserveAspectRatio="xMidYMid meet">
    ${tiles}
    </svg>
    <p class="us-map__hint muted" id="${skipId}" tabindex="-1">Tap or select a state for its full report.</p>
  </div>`;
}

/** The severity legend (Minimal → Very High) — placed above the map. */
export function mapLegend() {
  const chips = SEVERITY_LABELS.map(
    (label, i) =>
      `<span class="map-legend__item"><span class="map-legend__swatch" data-sev="${i}" aria-hidden="true"></span>${escapeHtml(
        label
      )}</span>`
  ).join('');
  // Not aria-hidden: the swatches are decorative, but the scale itself is
  // meaningful to anyone trying to understand what the tile levels mean.
  return `<div class="map-legend"><span class="map-legend__title">Activity</span>${chips}<span class="map-legend__item"><span class="map-legend__swatch map-legend__swatch--empty" aria-hidden="true"></span>No data</span></div>`;
}
