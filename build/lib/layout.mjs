// ===========================================================================
// HTML layout shell. Wraps page content with <head> (SEO, Open Graph, JSON-LD),
// an accessible sticky header, and a transparency-forward footer.
// ===========================================================================

import { site, disclaimers } from './site.mjs';
import { escapeHtml } from '../../src/scripts/util.js';
import { icon } from '../../src/scripts/icons.js';

// The single inline script on the site: a FOUC-free theme boot that runs before
// first paint. Kept as one exact string so the build can hash it for the CSP
// (script-src uses 'sha256-…' instead of 'unsafe-inline').
export const BOOT_SCRIPT =
  `(function(){try{var t=localStorage.getItem('flutrack-theme');` +
  `if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export const NAV = [
  { href: '/', label: 'Home', match: (p) => p === '/' },
  { href: '/states/', label: 'All states', match: (p) => p.startsWith('/state') },
  { href: '/methodology/', label: 'How it works', match: (p) => p.startsWith('/methodology') },
  { href: '/alerts/', label: 'Surge alerts', match: (p) => p.startsWith('/alerts') },
  { href: '/about/', label: 'About', match: (p) => p.startsWith('/about') },
];

const FOOTER = {
  Product: [
    ['/states/', 'All states'],
    ['/alerts/', 'Surge alert signup'],
    ['/methodology/', 'How the index works'],
    ['/faq/', 'FAQ'],
  ],
  Data: [
    ['/data-sources/', 'Data sources'],
    ['/methodology/', 'Methodology'],
    ['https://data.cdc.gov/', 'CDC Open Data ↗'],
  ],
  Company: [
    ['/about/', 'About'],
    ['/contact/', 'Contact'],
  ],
  Legal: [
    ['/medical-disclaimer/', 'Medical disclaimer'],
    ['/privacy/', 'Privacy policy'],
    ['/terms/', 'Terms of use'],
    ['/affiliate-disclosure/', 'Affiliate disclosure'],
    ['/accessibility/', 'Accessibility'],
  ],
};

/** Brand mark (inline SVG) — a stylized "pulse + shield" motif. */
function brandMark() {
  return `<svg class="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M16 2.5 27 6.6v8.1c0 6.9-4.6 12.2-11 14.8C9.6 26.9 5 21.6 5 14.7V6.6L16 2.5Z" fill="var(--brand-500)" opacity="0.14"/>
    <path d="M16 2.5 27 6.6v8.1c0 6.9-4.6 12.2-11 14.8C9.6 26.9 5 21.6 5 14.7V6.6L16 2.5Z" stroke="var(--brand-500)" stroke-width="1.6"/>
    <path d="M8 16.5h4l2-5 3.5 9 2.2-4h4.3" stroke="var(--brand-500)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function head(page) {
  // Content-hashed stylesheet name set by the build (falls back for safety).
  const cssHref = site.assets?.css || 'styles.css';
  const title = page.title
    ? `${page.title} · ${site.name}`
    : `${site.name} — ${site.tagline}`;
  const desc = page.description || site.description;
  const canonical = `${site.origin}${page.path}`;
  const ogType = page.ogType || 'website';
  const ogImage = `${site.origin}/assets/og-default.png`;
  const jsonld = (page.jsonld || [])
    .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join('\n  ');

  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <meta name="author" content="${escapeHtml(site.publisher.name)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0c1116" media="(prefers-color-scheme: dark)">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="${page.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}">
  <meta name="format-detection" content="telephone=no">

  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="${escapeHtml(site.name)}">
  <meta property="og:title" content="${escapeHtml(page.title || site.name)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:locale" content="${escapeHtml(site.locale)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(site.name)} — a local respiratory threat level for flu, RSV and COVID-19">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="${escapeHtml(site.social.twitter)}">
  <meta name="twitter:title" content="${escapeHtml(page.title || site.name)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">

  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/assets/favicon-32.png" sizes="32x32">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="stylesheet" href="/assets/${cssHref}">
  ${jsonld ? '\n  ' + jsonld : ''}
  <script>${BOOT_SCRIPT}</script>`;
}

function header(page) {
  const links = NAV.map((n) => {
    const current = n.match(page.path) ? ' aria-current="page"' : '';
    return `<a href="${n.href}"${current}>${escapeHtml(n.label)}</a>`;
  }).join('\n        ');

  return `<header class="site-header">
    <div class="container site-header__inner">
      <a class="brand" href="/" aria-label="${escapeHtml(site.name)} home">
        ${brandMark()}
        <span class="brand__name">Flu<b>Track</b></span>
      </a>
      <nav class="primary-nav" id="primary-nav" aria-label="Primary">
        ${links}
      </nav>
      <div class="header-actions">
        <button class="icon-btn" id="theme-toggle" type="button" aria-label="Switch color theme" aria-pressed="false">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        </button>
        <button class="icon-btn nav-toggle" id="nav-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="primary-nav">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>
    </div>
  </header>`;
}

function footer() {
  const cols = Object.entries(FOOTER)
    .map(
      ([heading, links]) => `<div class="footer-col">
        <h3>${escapeHtml(heading)}</h3>
        <ul>
          ${links
            .map(([href, label]) => {
              const ext = href.startsWith('http') ? ' rel="noopener"' : '';
              return `<li><a href="${href}"${ext}>${escapeHtml(label)}</a></li>`;
            })
            .join('\n          ')}
        </ul>
      </div>`
    )
    .join('\n      ');

  const year = site.season.label.split('–')[0]; // stable, avoids build-time Date
  return `<footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-col">
          <a class="brand" href="/" aria-label="${escapeHtml(site.name)} home">
            ${brandMark()}<span class="brand__name">Flu<b>Track</b></span>
          </a>
          <p class="muted" style="margin-top: var(--space-sm); max-width: 26ch">${escapeHtml(
            site.shortDescription
          )}</p>
        </div>
        ${cols}
      </div>
      <div class="disclaimer-strip" style="margin-top: var(--space-2xl)">
        ${icon('info', { size: 16 })}
        <span><strong>Not medical advice.</strong> ${escapeHtml(disclaimers.notAffiliated)}</span>
      </div>
      <div class="footer-bottom">
        <span>© ${escapeHtml(year)} ${escapeHtml(site.name)}. Built on public-domain CDC data.</span>
        <span class="cluster">
          <a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/medical-disclaimer/">Disclaimer</a>
        </span>
      </div>
    </div>
  </footer>`;
}

/**
 * Compose a full HTML document.
 * @param page { title, description, path, body, jsonld, bodyClass, scripts, noindex }
 */
export function layout(page) {
  const scripts = (page.scripts || [])
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join('\n  ');

  return `<!doctype html>
<html lang="en">
<head>
  ${head(page)}
</head>
<body${page.bodyClass ? ` class="${page.bodyClass}"` : ''}>
  <a class="skip-link" href="#main">Skip to content</a>
  ${header(page)}
  <main id="main" tabindex="-1">
${page.body}
  </main>
  ${footer()}
  <p class="visually-hidden" id="live-status" role="status" aria-live="polite"></p>
  <script type="module" src="/assets/js/ui.js"></script>
  <script type="module" src="/assets/js/alerts.js"></script>
  ${scripts}
</body>
</html>`;
}
