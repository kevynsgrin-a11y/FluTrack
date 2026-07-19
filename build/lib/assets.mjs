// ===========================================================================
// Static asset sources — favicon, PWA manifest, icon + Open Graph SVG sources.
// Text assets are written directly by the build. The SVG sources here are also
// consumed by build/lib/rasterize.mjs to produce committed PNG fallbacks.
// ===========================================================================

const BRAND = '#0b7285';
const BRAND_DEEP = '#073f4a';
const SEV = ['#2f9e63', '#8bc34a', '#f4b400', '#ef6c00', '#c62828'];

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

/** 1200×630 Open Graph card. */
export function ogSvg(site) {
  const strip = SEV.map(
    (c, i) => `<rect x="${72 + i * 40}" y="470" width="34" height="14" rx="7" fill="${c}"/>`
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f9fa"/><stop offset="1" stop-color="#e6f4f7"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(72,64)">
    ${iconSvg({ size: 96 }).replace('<svg', '<svg x="0" y="0"')}
  </g>
  <text x="184" y="132" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="40" font-weight="700" fill="#0b7285">FluTrack</text>
  <text x="72" y="300" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="72" font-weight="800" fill="#141a20">Flu, RSV &amp; COVID —</text>
  <text x="72" y="386" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="72" font-weight="800" fill="#141a20">for your state, in plain English.</text>
  <text x="72" y="452" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="30" font-weight="500" fill="#4c5763">One local respiratory threat level, built on public CDC data.</text>
  ${strip}
  <text x="300" y="482" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="22" font-weight="600" fill="#6b7785">Minimal → Very High</text>
</svg>`;
}

export function manifest(site) {
  return JSON.stringify(
    {
      name: `${site.name} — Respiratory Illness Tracker`,
      short_name: site.name,
      description: site.shortDescription,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f7f9fa',
      theme_color: '#0b7285',
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

/** Text assets written into dist/assets (and manifest at root by the build). */
export function assetFiles(site) {
  return {
    'favicon.svg': iconSvg({ size: 64 }),
    'icon-source.svg': iconSvg({ size: 512 }),
    'og-source.svg': ogSvg(site),
    'manifest.webmanifest': manifest(site),
  };
}
