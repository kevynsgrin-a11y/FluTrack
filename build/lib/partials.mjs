// ===========================================================================
// Shared HTML section builders reused across multiple pages. Keeping these in
// one place lets every page — including those authored independently — share an
// identical signup band, page header, and legal-page chrome.
// ===========================================================================

import { site, disclaimers } from './site.mjs';
import { states } from './states.mjs';
import { escapeHtml } from '../../src/scripts/util.js';
import { icon } from '../../src/scripts/icons.js';

/** A standard page header block for content/legal pages. */
export function pageHeader({ eyebrow, title, lede }) {
  return `<section class="section section--tight page-header">
    <div class="page-header__bg" aria-hidden="true"></div>
    <div class="container container--narrow">
      ${eyebrow ? `<p class="eyebrow">${icon('pulse', { size: 14 })} ${escapeHtml(eyebrow)}</p>` : ''}
      <h1>${escapeHtml(title)}</h1>
      ${lede ? `<p class="lede" style="margin-top: var(--space-md)">${escapeHtml(lede)}</p>` : ''}
    </div>
  </section>`;
}

/** Wrap prose content in the narrow reading column. */
export function prose(html, { updated } = {}) {
  return `<section class="section" style="padding-top: 0">
    <div class="container container--narrow">
      <div class="prose">
        ${updated ? `<p class="muted">Last updated: ${escapeHtml(updated)}</p>` : ''}
        ${html}
      </div>
    </div>
  </section>`;
}

/** The recurring "surge alert" email capture band (Wedge C). */
export function signupBand({ compact = false } = {}) {
  const options = states
    .map((s) => `<option value="${s.abbr}">${escapeHtml(s.name)}</option>`)
    .join('');
  return `<section class="section${compact ? ' section--tight' : ''}">
    <div class="container">
      <div class="signup">
        <p class="eyebrow" style="color: rgba(255,255,255,.85)">Free · one email a week at most</p>
        <h2 style="margin-top: var(--space-xs)">Get a surge alert for your state</h2>
        <p class="lede">We'll email you when CDC data shows respiratory activity climbing where you live — so a rise never catches you off guard. No spam, unsubscribe anytime.</p>
        <form class="signup__form" id="alert-form" method="post" action="/api/subscribe" novalidate>
          <div aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">
            <label for="alert-company">Company (leave blank)</label>
            <input id="alert-company" name="company" type="text" tabindex="-1" autocomplete="off">
          </div>
          <label class="visually-hidden" for="alert-email">Email address</label>
          <input class="input" id="alert-email" name="email" type="email" inputmode="email"
            autocomplete="email" placeholder="you@example.com" required>
          <label class="visually-hidden" for="alert-state">Your state</label>
          <select class="select" id="alert-state" name="state" required>
            <option value="" disabled selected>Choose your state</option>
            ${options}
          </select>
          <button class="btn btn--secondary" type="submit">Notify me</button>
        </form>
        <p class="form-status" id="alert-status" role="status" aria-live="polite"></p>
        <p class="signup__fine">
          By subscribing you agree to our <a href="/privacy/">Privacy Policy</a>. FluTrack is an
          independent utility and is not affiliated with the CDC. ${escapeHtml(disclaimers.short)}
        </p>
      </div>
    </div>
  </section>`;
}

/** A compact "not medical advice / trend not live" callout. */
export function trendDisclaimer() {
  return `<div class="callout callout--warn" role="note">
    <p class="callout__title">${icon('clock')} Trends, not real-time counts</p>
    <p>${escapeHtml(disclaimers.trendNotLive)} ${escapeHtml(disclaimers.short)}</p>
  </div>`;
}

/** Consistent breadcrumb markup. */
export function breadcrumbs(crumbs) {
  const items = crumbs
    .map((c, i) => {
      const last = i === crumbs.length - 1;
      if (last) return `<span aria-current="page">${escapeHtml(c.name)}</span>`;
      return `<a href="${c.path}">${escapeHtml(c.name)}</a><span aria-hidden="true">›</span>`;
    })
    .join(' ');
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items}</nav>`;
}
