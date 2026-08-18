// ---------------------------------------------------------------------------
// Global site configuration — single source of truth for metadata, used by the
// build pipeline (SEO tags, sitemap, structured data) and injected into pages.
// ---------------------------------------------------------------------------

export const site = {
  name: 'FluTrack',
  tagline: 'Local flu, RSV & COVID activity in plain English',
  // Production origin. Override at build time with SITE_ORIGIN env var.
  origin: process.env.SITE_ORIGIN || 'https://flufollower.com',
  locale: 'en_US',
  themeColor: '#0b7285',
  // Descriptions used across meta tags / structured data.
  // Kept ≤155 chars so it is not truncated as the home-page meta / OG description.
  description:
    'A plain-English respiratory threat level for your state — tracking flu, ' +
    'RSV and COVID-19 trends from public-domain CDC surveillance data.',
  shortDescription:
    'A simple, local respiratory threat level for flu, RSV and COVID-19, ' +
    'built on public CDC surveillance data.',
  // Publisher / contact — E-E-A-T transparency signals.
  //
  // A health-adjacent (YMYL) site needs an accountable publisher, not just a
  // brand. `legalName` is the entity that answers for the content; `editorRole`
  // is the named role that maintains the index method. Both are rendered in the
  // /about/ accountability block and in the Organization JSON-LD.
  publisher: {
    name: 'FluTrack',
    legalName: 'Oak & Main LLC',
    // A named ROLE, deliberately not an individual. It must stay reachable:
    // whoever holds it answers mail at `email` below.
    editorRole: 'responsible editor',
    // Live mailboxes (Cloudflare Email Routing → central inbox). Every one of
    // these is verified to deliver; see the note on hasPublisherEmail().
    email: 'hello@flufollower.com',
    privacyEmail: 'privacy@flufollower.com',
    securityEmail: 'security@flufollower.com',
    // Editorial responsibility statement shown in the footer / about page.
    role: 'Independent data-visualization utility',
  },
  // FluTrack is health-ADJACENT, never health advice. Nothing on the site is
  // reviewed by a clinician, and the accountability block says so in as many
  // words. Flip this only when a named, qualified reviewer is actually listed —
  // implying medical review that does not exist is the failure mode this guards.
  medicallyReviewed: false,
  social: {
    twitter: '@flutrack',
  },
  // The CDC data cadence, surfaced in the UI to set expectations honestly.
  dataCadence: 'Weekly (CDC surveillance systems publish on Fridays)',
  // Content/legal-page revision date (for sitemap <lastmod>). Bump when copy changes.
  contentUpdated: '2026-08-18',
  // First-publication date for the state reports. Fixed on purpose: JSON-LD
  // datePublished must not move with the CDC data week, or every rebuild claims
  // the pages are newly published rather than newly updated.
  contentPublished: '2026-07-19',
  // Season framing — 2026–2027 respiratory season (MMWR Week 40 → Week 20).
  season: {
    label: '2026–2027 respiratory season',
    startsISO: '2026-10-04', // MMWR Week 40
    endsISO: '2027-05-22', //   MMWR Week 20
  },
};

/**
 * True only when a real, routable publisher mailbox is configured.
 * RFC-2606 reserved TLDs (.example / .invalid / .test / .localhost) never resolve.
 *
 * This started life as a guard against shipping `hello@flutrack.example`. The
 * addresses are real now, but the guard stays: it is what stops a future config
 * edit from quietly publishing a dead contact route on a health site, and
 * build/check.mjs fails the build on any reserved-TLD address in the output.
 */
export function hasPublisherEmail() {
  const e = site.publisher.email;
  return Boolean(e) && !/\.(example|invalid|test|localhost)$/i.test(e);
}

/** The contact route to advertise: a real mailbox if configured, else the form. */
export function contactHref() {
  return hasPublisherEmail() ? `mailto:${site.publisher.email}` : '/contact/';
}

/**
 * The address for privacy rights requests (access / correction / deletion).
 * Falls back to the general mailbox, then to the contact form, so the policy
 * never promises a route that does not exist.
 */
export function privacyEmail() {
  const e = site.publisher.privacyEmail || site.publisher.email;
  return e && !/\.(example|invalid|test|localhost)$/i.test(e) ? e : null;
}

/**
 * Processor register — every third party that touches a visitor's data, named
 * by legal entity. This is the single source for the privacy policy's
 * third-party section AND the machine-readable register at /vendors/, so the
 * two cannot drift apart: describing a vendor by role in one place and by brand
 * in another is exactly how a policy stops matching the deployment.
 *
 * `consentClass` drives the consent gate:
 *   'essential'  — no storage on the visitor's device, no consent gate.
 *   'analytics'  — gated where consent is required.
 *   'advertising'— gated where consent is required.
 * `status` is honest about what is actually live today.
 */
export const processors = [
  {
    key: 'cloudflare-hosting',
    vendor: 'Cloudflare, Inc.',
    service: 'Site hosting, CDN and edge security (Cloudflare Pages)',
    purpose: 'Serving the site; security and abuse prevention',
    basis: 'Legitimate interest (operating and securing the service)',
    dataCategories: 'IP address, request time, URL requested, user-agent (server logs)',
    retention: 'Short operational window, then deleted or aggregated by Cloudflare',
    deletionPath: 'privacy@flufollower.com',
    consentClass: 'essential',
    status: 'Live',
    docs: 'https://www.cloudflare.com/privacypolicy/',
  },
  {
    key: 'cloudflare-analytics',
    vendor: 'Cloudflare, Inc.',
    service: 'Cloudflare Web Analytics',
    purpose: 'Aggregate page performance and visit measurement',
    basis:
      'Legitimate interest — cookieless and storage-free, so it sets nothing on your device',
    dataCategories: 'Page URL, referrer, coarse device/browser class, performance timings',
    retention: 'Aggregate only; no visitor-level profile is created',
    deletionPath: 'No visitor-level record exists to delete',
    consentClass: 'analytics',
    status: 'Live',
    docs: 'https://www.cloudflare.com/web-analytics/',
  },
  {
    key: 'cloudflare-kv',
    vendor: 'Cloudflare, Inc.',
    service: 'Workers KV (surge-alert subscription store)',
    purpose: 'Storing the email address and state you submit for surge alerts',
    basis: 'Consent (you submit the form)',
    dataCategories: 'Email address, chosen state, submission timestamp, country, user-agent',
    retention: 'Until you unsubscribe or ask us to delete it',
    deletionPath: 'privacy@flufollower.com',
    consentClass: 'essential',
    status: 'Live',
    docs: 'https://www.cloudflare.com/privacypolicy/',
  },
  {
    key: 'resend',
    vendor: 'Resend, Inc.',
    service: 'Transactional email delivery for surge alerts',
    purpose: 'Sending the surge-alert emails you subscribe to',
    basis: 'Consent (you subscribe, and can withdraw at any time)',
    dataCategories: 'Email address, delivery metadata',
    retention: 'Until you unsubscribe; delivery logs per the processor’s own retention',
    deletionPath: 'privacy@flufollower.com',
    consentClass: 'essential',
    status: 'Engaged — no alert email has been sent yet',
    docs: 'https://resend.com/legal/privacy-policy',
  },
  {
    key: 'fcc-geocoder',
    vendor: 'U.S. Federal Communications Commission',
    service: 'Area API geocoder (geo.fcc.gov)',
    purpose: 'Resolving “Use my location” to a U.S. state, on tap only',
    basis: 'Consent (you tap the button and grant browser permission)',
    dataCategories: 'Approximate coordinates, sent once and never stored by us',
    retention: 'Not retained — discarded as soon as the state picker is set',
    deletionPath: 'Nothing is stored, so there is nothing to delete',
    consentClass: 'essential',
    status: 'Live',
    docs: 'https://www.fcc.gov/privacy-policy',
  },
  {
    key: 'cdc-socrata',
    vendor: 'U.S. Centers for Disease Control and Prevention',
    service: 'Open data API (data.cdc.gov)',
    purpose: 'Fetching public-domain surveillance data directly in your browser',
    basis: 'Legitimate interest (delivering the requested content)',
    dataCategories: 'Your browser’s own request metadata, sent to the CDC, not to us',
    retention: 'Governed by the CDC, not by FluTrack',
    deletionPath: 'Contact the CDC; FluTrack holds no record of these requests',
    consentClass: 'essential',
    status: 'Live',
    docs: 'https://www.cdc.gov/other/privacy.html',
  },
];

// The disclaimer text is referenced in many places; keep it centralized so the
// legal wording stays identical everywhere it appears.
export const disclaimers = {
  short: 'For general information only — not medical advice.',
  notAffiliated:
    'FluTrack is an independent project and is not affiliated with, endorsed ' +
    'by, or sponsored by the Centers for Disease Control and Prevention (CDC) ' +
    'or any government agency.',
  notMedical:
    'The information on FluTrack is provided for general informational purposes ' +
    'only and is not a substitute for professional medical advice, diagnosis, ' +
    'or treatment. Always seek the advice of a qualified health provider with ' +
    'any questions you may have regarding a medical condition.',
  trendNotLive:
    'Surveillance data is reported with an inherent lag of roughly one to two ' +
    'weeks. FluTrack shows directional trends, not a real-time case count.',
  // Rendered immediately before every commercial link. Verbatim from the audit.
  affiliate:
    'Affiliate link — FluTrack may earn a commission if you buy through this ' +
    'link, at no extra cost to you. This does not affect our data or editorial ' +
    'content.',
  // The cached/offline freshness boundary. Verbatim from the audit; the
  // `[timestamp]` slot is filled at render time with the real snapshot date.
  cachedData:
    'You are viewing a cached FluTrack page. Data may not be current. Last ' +
    'verified snapshot: {timestamp}. Reconnect and refresh for the latest ' +
    'CDC-derived update.',
};
