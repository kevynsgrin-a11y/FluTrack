// ===========================================================================
// Shared page sections. Existing form names, endpoints, and legal strings are
// deliberately preserved while the visual wrapper changes to bulletin form.
// ===========================================================================

import { site, disclaimers, seasonKit } from './site.mjs';
import { states } from './states.mjs';
import { escapeHtml } from '../../src/scripts/util.js';
import { icon } from '../../src/scripts/icons.js';

export function pageHeader({ eyebrow, title, lede }) {
  return `<section class="section section--tight page-header">
    <div class="page-header__bg" aria-hidden="true"></div>
    <div class="container container--narrow">
      <h1>${escapeHtml(title)}</h1>
      ${lede ? `<p class="lede" style="margin-top: var(--space-md)">${escapeHtml(lede)}</p>` : ''}
    </div>
  </section>`;
}

export function prose(html, { updated } = {}) {
  return `<section class="section" style="padding-top: 0"><div class="container container--narrow"><div class="prose">${updated ? `<p class="muted">Last updated: ${escapeHtml(updated)}</p>` : ''}${html}</div></div></section>`;
}

export function signupBand({ compact = false } = {}) {
  const options = states.map((s) => `<option value="${s.abbr}">${escapeHtml(s.name)}</option>`).join('');
  return `<section class="section${compact ? ' section--tight' : ''}">
    <div class="container">
      <div class="signup">
        <p class="section-kicker"><span>Free</span><span>one email a week at most</span></p>
        <h2 style="margin-top: var(--space-xs)">Get a surge alert for your state</h2>
        <p class="lede">We'll email you when CDC data shows respiratory activity climbing where you live — so a rise never catches you off guard. No spam, unsubscribe anytime.</p>
        <form class="signup__form" id="alert-form" method="post" action="/api/subscribe" novalidate>
          <div aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">
            <label for="alert-company">Company (leave blank)</label>
            <input id="alert-company" name="company" type="text" tabindex="-1" autocomplete="off">
          </div>
          <label class="visually-hidden" for="alert-email">Email address</label>
          <input class="input" id="alert-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required>
          <label class="visually-hidden" for="alert-state">Your state</label>
          <select class="select" id="alert-state" name="state" required><option value="" disabled selected>Choose your state</option>${options}</select>
          <button class="btn btn--primary" type="submit">Notify me</button>
        </form>
        <p class="form-status" id="alert-status" role="status" aria-live="polite"></p>
        <p class="signup__fine">By subscribing you agree to our <a href="/privacy/">Privacy Policy</a>. FluTrack is an independent utility and is not affiliated with the CDC. ${escapeHtml(disclaimers.short)}</p>
      </div>
    </div>
  </section>`;
}

export function trendDisclaimer() {
  return `<div class="callout callout--warn" role="note"><p class="callout__title">${icon('clock')} Trends, not real-time counts</p><p>${escapeHtml(disclaimers.trendNotLive)} ${escapeHtml(disclaimers.short)}</p></div>`;
}

export function breadcrumbs(crumbs) {
  const items = crumbs.map((c, i) => {
    const last = i === crumbs.length - 1;
    if (last) return `<span aria-current="page">${escapeHtml(c.name)}</span>`;
    return `<a href="${c.path}">${escapeHtml(c.name)}</a><span aria-hidden="true">›</span>`;
  }).join(' ');
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items}</nav>`;
}

/**
 * Reserved integration boundary: 970×90 desktop and 320×100 mobile.
 *
 * All-or-nothing, the same way seasonKitModule() is. Until an ad network
 * publisher ID is configured there is no creative to place, so the slot renders
 * as a collapsed boundary: `data-empty="true"` triggers the rules already in
 * src/styles/main.css, and the label and the landmark name are omitted. Without
 * this the default `.ad-slot` style applied and every page showed a 90px hatched
 * box captioned "Advertisement" — 110 of them across 55 pages — each one an
 * <aside> named "Advertisement" in the accessibility tree.
 */
export function adSlot(slot) {
  const configured = Boolean(site.ads && site.ads.publisherId);
  if (!configured) {
    return `<aside class="ad-slot" data-empty="true" data-ad-slot="${escapeHtml(slot)}"></aside>`;
  }
  return `<aside class="ad-slot" data-ad-slot="${escapeHtml(slot)}" aria-label="Advertisement"><span class="ad-slot__label">Advertisement</span></aside>`;
}

/**
 * Season-kit affiliate module. Renders only when every slot has real copy;
 * otherwise it emits the empty string, so no empty container, reserved height
 * or margin reaches the page. `.stack > * + *` supplies the spacing, so an
 * absent element also removes its own gap — nothing shifts.
 * Copy lives in one place: `seasonKit` in build/lib/site.mjs.
 */
export function seasonKitModule() {
  const title = (seasonKit?.title || '').trim();
  const products = (seasonKit?.products || []).map((t) => (t || '').trim());
  const complete = title && products.length === 3 && products.every(Boolean);
  if (!complete) return '';
  const slots = products
    .map((t) => `<div class="season-kit__slot"><span>${escapeHtml(t)}</span></div>`)
    .join('');
  return `<aside class="season-kit" aria-label="Affiliate content">
            <div class="season-kit__head"><span class="season-kit__label">Affiliate content</span><span>${escapeHtml(title)}</span></div>
            <div class="season-kit__grid">${slots}</div>
          </aside>`;
}

// Per-page revision dates for the content and legal pages.
//
// Every one of these pages used to take its sitemap <lastmod> from
// site.contentUpdated — a single site-wide constant — while printing its own
// hardcoded month in its body. The two drifted: nine pages displayed "July" or
// "August 2026" though git shows every one of them was last revised in
// September 2026, and the sitemap told crawlers something different again.
//
// Both the rendered line and the sitemap entry now read from this map, so they
// cannot disagree. Dates are the real last-revision dates from git history.
export const contentRevised = Object.freeze({
  '/accessibility/': '2026-09-21',
  '/affiliate-disclosure/': '2026-09-21',
  '/changelog/': '2026-10-09',
  '/consent/': '2026-09-26',
  '/consumer-health-data-privacy/': '2026-10-09',
  '/editorial-policy/': '2026-10-08',
  '/faq/': '2026-09-21',
  '/medical-disclaimer/': '2026-09-21',
  '/methodology/': '2026-10-09',
  '/privacy/': '2026-10-09',
  '/terms/': '2026-09-21',
  '/vendors/': '2026-10-09',
  '/about/': '2026-09-21',
  '/alerts/': '2026-09-21',
  '/contact/': '2026-09-21',
  '/data-sources/': '2026-10-09',
  '/season/2026-27/': '2026-09-29',
});

/** ISO revision date for a content page, for sitemap <lastmod>. */
export function revisedOn(path) {
  return contentRevised[path] || site.contentUpdated;
}

/** The same date as "September 2026", for the rendered "Last updated" line. */
export function revisedLabel(path) {
  const iso = revisedOn(path);
  const [y, m] = String(iso).split('-');
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : String(iso);
}
