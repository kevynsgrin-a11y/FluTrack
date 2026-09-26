// ===========================================================================
// HTML layout shell. The one boot script stays CSP-hashed by build/build.mjs.
// ===========================================================================

import { site, disclaimers } from './site.mjs';
import { escapeHtml } from '../../src/scripts/util.js';
import { icon } from '../../src/scripts/icons.js';

// One inline script, allowlisted by its own SHA-256 in the CSP (build/build.mjs
// derives the hash from this exact string, and build/check.mjs asserts that the
// hash in the emitted policy matches the script in every emitted page).
// It does two things before first paint: applies the stored theme so the page
// never flashes the wrong one, and promotes the non-render-blocking stylesheet
// to media="all" once it has loaded. The stylesheet ships as media="print" so
// it does not block the first paint; the inline critical CSS covers the header
// and the hero readout until it lands, and a <noscript> copy keeps the page
// styled when scripting is off.
export const BOOT_SCRIPT =
  `(function(){try{var t=localStorage.getItem('flutrack-theme');` +
  `if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);` +
  `else if(t==='system')document.documentElement.removeAttribute('data-theme');}catch(e){}` +
  `var l=document.querySelector('link[data-main-css]');` +
  `if(l){var f=function(){l.media='all';};if(l.sheet)f();else l.addEventListener('load',f);}})();`;

export const NAV = [
  { href: '/', label: 'Home', match: (p) => p === '/' },
  { href: '/states/', label: 'All states', match: (p) => p.startsWith('/state') },
  { href: '/methodology/', label: 'How it works', match: (p) => p.startsWith('/methodology') },
  { href: '/alerts/', label: 'Surge alerts', match: (p) => p.startsWith('/alerts') },
  { href: '/about/', label: 'About', match: (p) => p.startsWith('/about') },
];

const FOOTER = {
  Product: [['/states/', 'All states'], ['/alerts/', 'Surge alert signup'], ['/methodology/', 'How the index works'], ['/faq/', 'FAQ']],
  Data: [['/data-sources/', 'Data sources'], ['/methodology/', 'Methodology'], ['https://data.cdc.gov/', 'CDC Open Data ↗']],
  Company: [['/about/', 'About'], ['/contact/', 'Contact']],
  Legal: [['/medical-disclaimer/', 'Medical disclaimer'], ['/privacy/', 'Privacy policy'], ['/terms/', 'Terms of use'], ['/affiliate-disclosure/', 'Affiliate disclosure'], ['/accessibility/', 'Accessibility']],
};

function brandMark() {
  return `<svg class="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M16 2.5 27 6.6v8.1c0 6.9-4.6 12.2-11 14.8C9.6 26.9 5 21.6 5 14.7V6.6L16 2.5Z" fill="var(--brand-500)" opacity="0.14"/>
    <path d="M16 2.5 27 6.6v8.1c0 6.9-4.6 12.2-11 14.8C9.6 26.9 5 21.6 5 14.7V6.6L16 2.5Z" stroke="var(--brand-500)" stroke-width="1.6"/>
    <path d="M8 16.5h4l2-5 3.5 9 2.2-4h4.3" stroke="var(--brand-500)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function head(page) {
  const cssHref = site.assets?.css || 'styles.css';
  const title = page.title ? `${page.title} · ${site.name}` : `${site.name} — ${site.tagline}`;
  const desc = page.description || site.description;
  const canonical = `${site.origin}${page.path}`;
  const ogType = page.ogType || 'website';
  const ogImage = `${site.origin}${page.ogImage || '/assets/og-default.png'}`;
  const jsonld = (page.jsonld || []).map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`).join('\n  ');
  // GA4 goes through the consent gate: analytics.js registers it with
  // consent.js and gtag.js loads only once analytics storage is granted. The
  // tag sits at the top of <head> on purpose — the fleet's edge ga4-inject
  // Worker only looks at the first 5,000 characters for an existing G- ID, and
  // injects an ungated second copy of GA4 if it finds none there.
  const ga4 = site.analytics?.ga4MeasurementId;
  const analyticsTag = ga4
    ? `\n  <script type="module" src="/assets/js/analytics.js" data-ga4-id="${escapeHtml(ga4)}"></script>`
    : '';
  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${analyticsTag}
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <meta name="author" content="${escapeHtml(site.publisher.name)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="theme-color" content="#f5f0e6" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#102126" media="(prefers-color-scheme: dark)">
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
  <link rel="preload" href="/assets/fonts/newsreader-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/public-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
  ${page.body && page.body.includes('class="gauge"')
    ? '<link rel="preload" href="/assets/fonts/ibm-plex-mono-numerals.woff2" as="font" type="font/woff2" crossorigin>'
    : ''}
  <style>${site.assets?.critical || ''}</style>
  <link rel="stylesheet" href="/assets/${cssHref}" media="print" data-main-css>
  <noscript><link rel="stylesheet" href="/assets/${cssHref}"></noscript>
  ${jsonld ? '\n  ' + jsonld : ''}
  <script>${BOOT_SCRIPT}</script>`;
}

function header(page) {
  const links = NAV.map((n) => `<a href="${n.href}"${n.match(page.path) ? ' aria-current="page"' : ''}>${escapeHtml(n.label)}</a>`).join('\n');
  return `<header class="site-header"><div class="container site-header__inner">
    <a class="brand" href="/" aria-label="${escapeHtml(site.name)} home">${brandMark()}<span class="brand__name">Flu<b>Track</b></span></a>
    <nav class="primary-nav" id="primary-nav" aria-label="Primary">${links}</nav>
    <div class="header-actions">
      <div class="theme-control" id="theme-toggle" role="group" aria-label="Color theme">
        <button type="button" data-theme-choice="system" aria-pressed="true">System</button>
        <button type="button" data-theme-choice="light" aria-pressed="false">Light</button>
        <button type="button" data-theme-choice="dark" aria-pressed="false">Dark</button>
      </div>
      <button class="icon-btn nav-toggle" id="nav-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="primary-nav">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
    </div>
  </div></header>`;
}

function footer() {
  const cols = Object.entries(FOOTER).map(([heading, links]) => `<div class="footer-col"><h3>${escapeHtml(heading)}</h3><ul>${links.map(([href, label]) => `<li><a href="${href}"${href.startsWith('http') ? ' rel="noopener"' : ''}>${escapeHtml(label)}</a></li>`).join('')}</ul></div>`).join('');
  const year = site.season.label.split('–')[0];
  return `<footer class="site-footer"><div class="container">
    <div class="disclaimer-strip">${icon('info', { size: 16 })}<span><strong>Not medical advice.</strong> ${escapeHtml(disclaimers.notAffiliated)}</span></div>
    <div class="footer-grid" style="margin-top: var(--space-xl)">
      <div class="footer-col"><a class="brand" href="/" aria-label="${escapeHtml(site.name)} home">${brandMark()}<span class="brand__name">Flu<b>Track</b></span></a><p class="muted" style="margin-top: var(--space-sm); max-width: 26ch">${escapeHtml(site.shortDescription)}</p></div>${cols}
    </div>
    <div class="footer-bottom"><span>© ${escapeHtml(year)} ${escapeHtml(site.name)}. Built on public-domain CDC data.</span><span class="cluster"><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/medical-disclaimer/">Disclaimer</a></span></div>
  </div></footer>`;
}

export function layout(page) {
  const scripts = (page.scripts || []).map((src) => `<script type="module" src="${src}"></script>`).join('\n  ');
  return `<!doctype html><html lang="en"><head>${head(page)}</head><body${page.bodyClass ? ` class="${page.bodyClass}"` : ''}>
  <a class="skip-link" href="#main">Skip to content</a>${header(page)}<main id="main" tabindex="-1">${page.body}</main>${footer()}<p class="visually-hidden" id="live-status" role="status" aria-live="polite"></p>
  <script type="module" src="/assets/js/ui.js"></script><script type="module" src="/assets/js/alerts.js"></script>${scripts}</body></html>`;
}
