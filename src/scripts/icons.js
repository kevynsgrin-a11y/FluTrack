// ===========================================================================
// Inline SVG icon set — one consistent 24-grid stroke language matching the
// logo's pulse line. Pure (strings only); shared by the build templates and,
// if needed, the browser. Decorative by default (aria-hidden).
// ===========================================================================

const PATHS = {
  pulse: '<path d="M2 12h4l3-8 5 16 3-8h5"/>',
  'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  alert: '<path d="M12 3.2 21 19H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  'map-pin': '<path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 14l3-4 3 3 4-6"/>',
};

/**
 * @param name key in PATHS
 * @param opts { size=18, cls='', stroke=2 }
 * @returns inline SVG string (currentColor stroke, decorative)
 */
export function icon(name, opts = {}) {
  const { size = 18, cls = '', stroke = 2 } = opts;
  const body = PATHS[name] || '';
  return `<svg class="icon${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
