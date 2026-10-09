// ===========================================================================
// Server-rendered pages for the no-JS path: a native <form> post to
// /api/report (or GET to /api/area) gets a complete HTML document back,
// styled with the site's own stylesheet, carrying the same result card the
// widget renders — plus a static US map with the state highlighted in place
// of the canvas globe.
//
// Pages Functions responses do not receive the static _headers file, so the
// security headers are set here, with a policy that allows no script at all.
// ===========================================================================

import { escapeHtml } from '../scripts/util.js';
import { resultCard, shareText } from '../scripts/report-render.js';
import { US_VIEWBOX, STATE_PATHS } from '../scripts/us-svg-paths.js';
import { states } from '../scripts/states-data.js';

export const PAGE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "script-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

export const PAGE_HEADERS = {
  'Content-Security-Policy': PAGE_CSP,
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Robots-Tag': 'noindex',
};

/** Inline SVG of the US (Albers) with one state highlighted by severity. */
export function usStaticMap(stateAbbr, level) {
  const st = states.find((s) => s.abbr === stateAbbr);
  const sev = Number.isFinite(level) ? Math.max(0, Math.min(4, level)) : null;
  const paths = Object.entries(STATE_PATHS)
    .map(([fips, d]) => {
      const on = st && fips === st.fips;
      return `<path d="${d}" class="usmap__state${on ? ' usmap__state--on' : ''}"${on && sev != null ? ` data-sev="${sev}"` : ''}/>`;
    })
    .join('');
  return `<svg class="usmap" viewBox="${US_VIEWBOX}" role="img" aria-label="Map of the United States${st ? ` with ${escapeHtml(st.name)} highlighted` : ''}">${paths}</svg>`;
}

/** The hashed stylesheet name, published by the build at /assets/build.json. */
export async function stylesheetHref(env, request) {
  try {
    const res = await env.ASSETS.fetch(new Request(new URL('/assets/build.json', request.url)));
    if (res.ok) {
      const meta = await res.json();
      if (meta.css) return `/assets/${meta.css}`;
    }
  } catch (e) {
    /* unstyled fallback below */
  }
  return null;
}

export function pageShell({ title, description, body, css }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · FluTrack</title><meta name="robots" content="noindex">
${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
${css ? `<link rel="stylesheet" href="${escapeHtml(css)}">` : ''}</head>
<body><header class="site-header"><div class="container site-header__inner"><a class="brand" href="/"><span class="brand__name">Flu<b>Track</b></span></a></div></header>
<main id="main" class="section"><div class="container container--narrow">${body}
<p style="margin-top:var(--space-xl)"><a class="btn btn--secondary" href="/#check-area">Back to FluTrack</a></p></div></main>
<footer class="site-footer"><div class="container"><p class="muted">Not medical advice. FluTrack is an independent project and is not affiliated with the CDC. <a href="/consumer-health-data-privacy/">Consumer health data privacy</a> · <a href="/privacy/">Privacy</a></p></div></footer>
</body></html>`;
}

export function resultPage({ payload, heading, css }) {
  const level = payload.level;
  const usableIndex = Number.isFinite(level?.level) && level.week_ending && ['sample', 'live'].includes(level.kind);
  const map = usStaticMap(payload.location.state, usableIndex ? level.level : null);
  const place = payload.location.county_name ? `${payload.location.county_name}, ${payload.location.state}` : payload.location.state_name || payload.location.state;
  const description = `${shareText(payload)}. County wastewater and statewide hospital admissions have separate observation periods.`;
  return pageShell({ title: `Respiratory readings for ${place}`, description, css, body: resultCard(payload, { heading, staticMap: map }) });
}

export function messagePage({ title, message, css, extra = '' }) {
  return pageShell({ title, css, body: `<h1>${escapeHtml(title)}</h1><p class="lede">${escapeHtml(message)}</p>${extra}` });
}
