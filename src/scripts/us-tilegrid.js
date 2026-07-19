// ===========================================================================
// US tile-grid cartogram layout. Each state/DC occupies one cell in an 8-row ×
// 11-col grid that approximates the geographic arrangement of the country
// (the NYT/Axios "tile grid map" style). A cartogram is used instead of a true
// geographic choropleth because it is fully self-contained (no external
// TopoJSON), uniform and legible at a glance, and every tile is an equal,
// keyboard-navigable target.
//
// Coordinates are [row, col], 0-indexed, row 0 = north, col 0 = west.
// Verified visually so states land in recognizable positions.
// ===========================================================================

export const GRID = { rows: 8, cols: 11 };

/** [row, col] per state — shared by the build (SSR) and the browser (hydrate). */
export const TILE = {
  AK: [0, 0], ME: [0, 10],
  VT: [1, 9], NH: [1, 10],
  WA: [2, 0], ID: [2, 1], MT: [2, 2], ND: [2, 3], MN: [2, 4], WI: [2, 6], MI: [2, 7], NY: [2, 8], MA: [2, 9], RI: [2, 10],
  OR: [3, 0], NV: [3, 1], WY: [3, 2], SD: [3, 3], IA: [3, 4], IL: [3, 5], IN: [3, 6], OH: [3, 7], PA: [3, 8], NJ: [3, 9], CT: [3, 10],
  CA: [4, 0], UT: [4, 1], CO: [4, 2], NE: [4, 3], MO: [4, 4], KY: [4, 5], WV: [4, 6], VA: [4, 7], MD: [4, 8], DE: [4, 9],
  AZ: [5, 1], NM: [5, 2], KS: [5, 3], AR: [5, 4], TN: [5, 5], NC: [5, 6], SC: [5, 7], DC: [5, 8],
  OK: [6, 3], LA: [6, 4], MS: [6, 5], AL: [6, 6], GA: [6, 7],
  HI: [7, 0], TX: [7, 3], FL: [7, 8],
};
