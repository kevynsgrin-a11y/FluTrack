// ===========================================================================
// Google Analytics 4, behind the consent gate.
//
// GA4 sets first-party cookies (_ga, _ga_*), so it is an `analytics` vendor
// and goes through consent.js like any other non-essential tag: nothing here
// runs, and gtag.js is not even requested, until analytics storage has been
// granted. Registering it is what arms the consent banner.
//
// The measurement ID comes from the data-ga4-id attribute on this module's own
// <script> tag (build/lib/layout.mjs, from site.analytics.ga4MeasurementId).
// This file is same-origin, so the bootstrap runs under the site's CSP without
// 'unsafe-inline' or a hash; the loader it inserts is allowed by
// https://www.googletagmanager.com in script-src.
// ===========================================================================

import { register } from './consent.js';

export const GA4_LOADER = 'https://www.googletagmanager.com/gtag/js';
const ID_PATTERN = /^G-[A-Z0-9]{4,16}$/;

/**
 * The consent-gate vendor for one GA4 property. `load()` is called at most once
 * by consent.js, and only after the analytics category is granted.
 */
export function ga4Vendor(measurementId, doc = globalThis.document, win = globalThis) {
  return {
    key: 'google-analytics-4',
    category: 'analytics',
    label: 'Google Analytics 4',
    load() {
      win.dataLayer = win.dataLayer || [];
      // gtag() must push the Arguments object itself, not an array copy.
      function gtag() {
        win.dataLayer.push(arguments);
      }
      win.gtag = win.gtag || gtag;
      gtag('js', new Date());
      gtag('config', measurementId);

      // Exactly one loader, even if something else already added one.
      if (doc.querySelector(`script[src^="${GA4_LOADER}"]`)) return;
      const s = doc.createElement('script');
      s.async = true;
      s.src = `${GA4_LOADER}?id=${encodeURIComponent(measurementId)}`;
      doc.head.appendChild(s);
    },
  };
}

if (typeof document !== 'undefined') {
  const id = document.querySelector('script[data-ga4-id]')?.getAttribute('data-ga4-id') || '';
  if (ID_PATTERN.test(id)) register(ga4Vendor(id));
}
