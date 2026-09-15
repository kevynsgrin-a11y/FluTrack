// ===========================================================================
// Static asset sources — favicon, PWA manifest, icon + Open Graph SVG sources.
// Text assets are written directly by the build. The SVG sources here are also
// consumed by build/lib/rasterize.mjs to produce committed PNG fallbacks.
// ===========================================================================

import { TILE } from '../../src/scripts/us-tilegrid.js';

const BRAND = '#127c74';
const BRAND_DEEP = '#083d39';
const SEV = ['#127c74', '#3e8fb0', '#e8b21f', '#d4541e', '#8c1d33'];

/** The FluTrack glyph: a rounded shield with a vitals "pulse" line. */
export function iconSvg({ size = 512, bg = true } = {}) {
  const r = size * 0.22;
  const pad = size * 0.16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg ? `<rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>` : ''}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND}"/>
      <stop offset="1" stop-color="${BRAND_DEEP}"/>
    </linearGradient>
  </defs>
  <path d="M${size / 2} ${pad}
    L${size - pad} ${pad + size * 0.1}
    L${size - pad} ${size * 0.52}
    C${size - pad} ${size * 0.74} ${size * 0.66} ${size - pad} ${size / 2} ${size - pad}
    C${size * 0.34} ${size - pad} ${pad} ${size * 0.74} ${pad} ${size * 0.52}
    L${pad} ${pad + size * 0.1} Z"
    fill="none" stroke="#ffffff" stroke-width="${size * 0.045}" stroke-linejoin="round" opacity="0.95"/>
  <path d="M${pad + size * 0.08} ${size * 0.5}
    h${size * 0.12}
    l${size * 0.07} -${size * 0.16}
    l${size * 0.12} ${size * 0.30}
    l${size * 0.07} -${size * 0.14}
    h${size * 0.14}"
    fill="none" stroke="#ffffff" stroke-width="${size * 0.05}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const MAP_FILLS = SEV;

/** Deterministic plausible severity per state for static art (summer-ish skew). */
function ogLevel(abbr) {
  let h = 0;
  for (let i = 0; i < abbr.length; i += 1) h = (h * 31 + abbr.charCodeAt(i)) >>> 0;
  const r = h % 100;
  return r < 42 ? 0 : r < 72 ? 1 : r < 92 ? 2 : r < 98 ? 3 : 4;
}

/** 1200×630 Open Graph card — features the signature tile-grid map. */
export function ogSvg(site) {
  const FONT = "-apple-system, Segoe UI, Roboto, sans-serif";
  const tile = 40;
  const pitch = 46;
  const ox = 686;
  const oy = 150;
  const tiles = Object.entries(TILE)
    .map(([abbr, [row, col]]) => {
      const x = ox + col * pitch;
      const y = oy + row * pitch;
      return `<g><rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="9" fill="${
        MAP_FILLS[ogLevel(abbr)]
      }"/><text x="${x + tile / 2}" y="${y + tile / 2 + 4}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="#fff">${abbr}</text></g>`;
    })
    .join('');
  const legend = MAP_FILLS.map(
    (c, i) => `<rect x="${72 + i * 30}" y="486" width="24" height="12" rx="6" fill="${c}"/>`
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f9fa"/><stop offset="1" stop-color="#e6f4f7"/>
    </linearGradient>
    <radialGradient id="aura" cx="80%" cy="0%" r="80%">
      <stop offset="0" stop-color="#8fc9d6" stop-opacity="0.55"/><stop offset="1" stop-color="#8fc9d6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#aura)"/>
  <g transform="translate(72,58)">${iconSvg({ size: 84 }).replace('<svg', '<svg x="0" y="0"')}</g>
  <text x="172" y="112" font-family="${FONT}" font-size="38" font-weight="700" fill="#0b7285">FluTrack</text>
  <text x="72" y="250" font-family="${FONT}" font-size="60" font-weight="800" fill="#141a20">Flu, RSV &amp; COVID-19,</text>
  <text x="72" y="322" font-family="${FONT}" font-size="60" font-weight="800" fill="#141a20">for your state —</text>
  <text x="72" y="394" font-family="${FONT}" font-size="60" font-weight="800" fill="#0b7285">in plain English.</text>
  <text x="72" y="456" font-family="${FONT}" font-size="27" font-weight="500" fill="#4c5763">One local respiratory threat level, built on public CDC data.</text>
  ${legend}
  <text x="${72 + 5 * 30 + 12}" y="496" font-family="${FONT}" font-size="20" font-weight="600" fill="#5b6773">Minimal → Very High</text>
  ${tiles}
</svg>`;
}

/**
 * State-specific social card. It uses only the existing state report values and
 * authored SVG geometry—no stock art, remote fonts, or new health copy.
 */
export function stateOgSvg(site, state, model, provenance = {}) {
  const level = Number.isFinite(model?.level) ? model.level : 0;
  const label = model?.label || 'No data';
  const score = Number.isFinite(model?.composite) ? model.composite : '—';
  const trend = model?.trend?.label || 'Holding steady';
  const pattern = [
    '<path d="M0 34 34 0M0 68 68 0" stroke="#fff" stroke-opacity=".22" stroke-width="3"/>',
    '<circle cx="12" cy="12" r="3" fill="#fff" fill-opacity=".35"/>',
    '<path d="M0 24 24 0M0 48 48 0M24 72 72 24" stroke="#fff" stroke-opacity=".4" stroke-width="3"/>',
    '<path d="M0 18 18 0M0 36 36 0M0 54 54 0M0 72 72 0M0 0 72 72" stroke="#fff" stroke-opacity=".44" stroke-width="3"/>',
    '<path d="M0 14 14 0M0 28 28 0M0 42 42 0M0 56 56 0M0 70 70 0M0 0 72 72M-14 0 72 86" stroke="#fff" stroke-opacity=".52" stroke-width="3"/>',
  ][level];
  const color = SEV[level];
  // A share card is stripped of the page's badge and disclaimer, so it has to
  // carry its own. Until the build input is verified live this is fixture data,
  // and the card says so in the same words the page uses.
  const sample = provenance.live
    ? ''
    : '<text x="82" y="112" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#8a6d1f">Sample data</text>';
  const safeState = String(state.name).replace(/&/g, '&amp;');
  const safeLabel = String(label).replace(/&/g, '&amp;');
  const safeTrend = String(trend).replace(/&/g, '&amp;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><pattern id="density" width="72" height="72" patternUnits="userSpaceOnUse"><rect width="72" height="72" fill="${color}"/>${pattern}</pattern></defs>
  <rect width="1200" height="630" fill="#f5f0e6"/>
  <rect x="0" width="18" height="630" fill="${color}"/>
  <rect x="746" width="454" height="630" fill="url(#density)"/>
  <path d="M82 108h510" stroke="#18272b" stroke-width="4"/>
  <text x="82" y="78" font-family="Arial, sans-serif" font-size="29" font-weight="700" fill="#127c74">FluTrack</text>
  ${sample}
  <text x="82" y="184" font-family="Georgia, serif" font-size="66" font-weight="700" fill="#18272b">${safeState}</text>
  <text x="82" y="252" font-family="Georgia, serif" font-size="49" font-weight="700" fill="#18272b">Respiratory threat level</text>
  <text x="82" y="458" font-family="Georgia, serif" font-size="132" font-weight="700" fill="${color}">${safeLabel}</text>
  <text x="82" y="532" font-family="Arial, sans-serif" font-size="32" font-weight="600" fill="#4f5450">${safeTrend}</text>
  <text x="1035" y="292" text-anchor="middle" font-family="monospace" font-size="148" font-weight="700" fill="#fff">${score}</text>
  <text x="1035" y="348" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#fff">ACTIVITY INDEX / 100</text>
</svg>`;
}

export function manifest(site) {
  return JSON.stringify(
    {
      id: '/',
      name: `${site.name} — Respiratory Illness Tracker`,
      short_name: site.name,
      description: site.shortDescription,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      // Match the light-mode <meta name="theme-color"> so the installed-PWA UI
      // tint agrees with the in-browser tint.
      theme_color: '#ffffff',
      categories: ['health', 'medical', 'utilities'],
      icons: [
        { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/assets/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2
  );
}

/**
 * Wrap a single PNG (ideally 32×32) in a minimal .ico container so /favicon.ico
 * resolves for legacy clients and bots that request it by convention. Modern
 * ICO supports an embedded PNG payload.
 * @param {Buffer} png raw PNG bytes
 * @param {number} size pixel dimension (0 encodes 256)
 * @returns {Buffer}
 */
export function icoFromPng(png, size = 32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // size of image data
  entry.writeUInt32LE(6 + 16, 12); // offset to image data
  return Buffer.concat([header, entry, png]);
}

/** Text assets written into dist/assets. The manifest is emitted once at the
 *  site root by the build (see writeRootFiles), not duplicated here. */
export function assetFiles(site) {
  return {
    'favicon.svg': iconSvg({ size: 64 }),
    'icon-source.svg': iconSvg({ size: 512 }),
    'og-source.svg': ogSvg(site),
  };
}
