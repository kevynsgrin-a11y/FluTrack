// ---------------------------------------------------------------------------
// Global site configuration — single source of truth for metadata, used by the
// build pipeline (SEO tags, sitemap, structured data) and injected into pages.
//
// This module used to have a twin. build/lib/site-main.mjs carried the richer
// publisher record — legal entity, postal address, jurisdiction and verified
// mailboxes — plus postalAddressLine(), hasPublisherEmail(), contactHref(),
// privacyEmail(), processors and SIGNALS. But the BUILD PIPELINE imported the
// other one: build.mjs, layout.mjs, partials.mjs, seo.mjs and rasterize.mjs all
// read site.mjs, and only four content pages read site-main.mjs. So everything
// the richer module added was unreachable from the pages that needed it, and the
// two disagreed about the publisher's contact address — the site published both.
// They are merged here. There is one config module.
// ---------------------------------------------------------------------------

export const site = {
  name: 'FluTrack',
  tagline: 'Dated flu, RSV & COVID surveillance in plain English',
  // Production origin. Override at build time with SITE_ORIGIN env var.
  origin: process.env.SITE_ORIGIN || 'https://flufollower.com',
  locale: 'en_US',
  themeColor: '#0b7285',
  // Descriptions used across meta tags / structured data.
  // Kept ≤155 chars so it is not truncated as the home-page meta / OG description.
  description:
    'A combined respiratory index for your state: dated flu, RSV and COVID-19 ' +
    'surveillance, trends and coverage from public CDC data.',
  shortDescription:
    'A combined state respiratory index for flu, RSV and COVID-19, ' +
    'with dated public CDC surveillance and coverage limits.',
  // Publisher / contact — E-E-A-T transparency signals.
  //
  // A health-adjacent (YMYL) site needs an accountable publisher, not just a
  // brand. `legalName` is the entity that answers for the content; `editorRole`
  // is the named role that maintains the index method. Both are rendered in the
  // /about/ accountability block and in the Organization JSON-LD.
  publisher: {
    name: 'FluTrack',
    // The registered entity that answers for this content. Previously recorded
    // here as "Oak & Main LLC", which is not the entity's legal name.
    legalName: 'Oak and Main Developers LLC',
    // A verifiable postal address is not decoration on a health-adjacent,
    // ad-supported site. It is what makes the publisher a real, locatable
    // entity for an E-E-A-T assessment, and CAN-SPAM requires a valid physical
    // address in any commercial email — so the surge-alert programme could not
    // carry promotional content at all until this existed.
    address: {
      street: '2108 N St.',
      locality: 'Sacramento',
      region: 'CA',
      postalCode: '95816',
      country: 'US',
    },
    // Operating jurisdiction, used for the governing-law clause in /terms/ and
    // for the California-specific privacy rights in /privacy/.
    jurisdiction: 'California',
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
  // GA4 measurement ID for this site. It is emitted in every page's <head>
  // (build/lib/layout.mjs) and read by src/scripts/analytics.js, which registers
  // GA4 with the consent gate — gtag.js never loads until analytics is granted.
  // Zaraz-only delivery of this ID records nothing, so it must be in-page.
  analytics: {
    ga4MeasurementId: 'G-65H1FJWYLR',
  },
  // Ad network publisher ID. While this is empty, adSlot() marks every slot
  // data-empty="true": the collapse rules in src/styles/main.css reduce it to
  // zero height, drop the hatching and hide the label, and the slot stops
  // advertising itself as a landmark. So a reserved integration boundary never
  // renders as an empty box captioned "Advertisement".
  ads: {
    publisherId: '',
  },
  // Cloudflare Turnstile — the bot check on the symptom-report form. The site
  // key is public and belongs here (or in TURNSTILE_SITE_KEY at build time);
  // the secret is a Pages secret, TURNSTILE_SECRET. While the key is empty the
  // report half of the home widget renders as "opens soon" and /api/report
  // stays closed, while "Check your area" works as normal.
  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY || '',
  },
  // Rollback switch, mirrored by FEATURE_REPORT in wrangler.toml [vars]:
  // "false" at build time drops the report form from the home page.
  features: {
    report: String(process.env.FEATURE_REPORT ?? 'true').toLowerCase() !== 'false',
  },
  // The CDC data cadence, surfaced in the UI to set expectations honestly.
  dataCadence: 'Weekly (CDC surveillance systems publish on Fridays)',
  // Content/legal-page revision date (for sitemap <lastmod>). Bump when copy changes.
  contentUpdated: '2026-08-29',
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
 * The publisher's postal address as a single line, for prose and for the
 * CAN-SPAM footer of any commercial email. Returns null when not configured, so
 * nothing ever renders a half-built address.
 */
export function postalAddressLine() {
  const a = site.publisher.address;
  if (!a || !a.street || !a.locality || !a.region || !a.postalCode) return null;
  return `${a.street}, ${a.locality}, ${a.region} ${a.postalCode}`;
}

/**
 * True only when a real, routable publisher mailbox is configured.
 * RFC-2606 reserved TLDs (.example / .invalid / .test / .localhost) never resolve.
 *
 * This started life as a guard against shipping `hello@flutrack.example`. The
 * addresses are real now, but the guard stays: it is what stops a future config
 * edit from quietly publishing a dead contact route on a health site, and
 * build/check.mjs fails the build on any reserved-TLD address in the output.
 */
export function hasPublisherEmail(candidate = site.publisher.email) {
  const e = candidate;
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
    key: 'google-analytics',
    vendor: 'Google LLC',
    service: 'Google Analytics 4',
    purpose: 'Aggregate traffic measurement (pages viewed, approximate location, device type)',
    basis: 'Consent — loads only after you allow analytics storage',
    dataCategories:
      'Page URL, referrer, approximate location derived from IP, device/browser type; _ga and _ga_* cookies',
    retention: 'Per the retention setting of the Google Analytics property',
    deletionPath: 'privacy@flufollower.com; opt out with https://tools.google.com/dlpage/gaoptout',
    consentClass: 'analytics',
    status: 'Live — only after analytics consent',
    docs: 'https://policies.google.com/privacy',
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
    key: 'cloudflare-turnstile',
    vendor: 'Cloudflare, Inc.',
    service: 'Cloudflare Turnstile (bot check on the symptom-report form)',
    purpose: 'Confirming a symptom report is sent by a person, not a bot',
    basis: 'Legitimate interest (abuse prevention); loads only once you use the report form',
    dataCategories: 'Browser and device signals and IP address, processed by Cloudflare for the check; FluTrack receives only pass/fail',
    retention: 'Per Cloudflare; nothing from the check is stored with your report',
    deletionPath: 'privacy@flufollower.com',
    consentClass: 'essential',
    status: site.turnstile.siteKey ? 'Live — only when you use the report form' : 'Engaged — the report form opens once it is configured',
    docs: 'https://www.cloudflare.com/turnstile-privacy-policy/',
  },
  {
    key: 'cloudflare-d1',
    vendor: 'Cloudflare, Inc.',
    service: 'D1 database and Workers KV (anonymous symptom reports; CDC data cache)',
    purpose: 'Storing anonymous symptom reports and the county counts built from them',
    basis: 'Consent (the consent box on every report; never pre-ticked)',
    dataCategories:
      'Symptoms, optional age band / vaccination / test / household answers, county, state, ZIP3 only where over 20,000 people, report day and week, a daily-salted hash of the IP address',
    retention: 'Raw reports 90 days; daily county counts kept; hashing salts deleted daily',
    deletionPath: 'Reports carry no identifier, so none can be traced to a person; all raw reports are deleted at 90 days — see /consumer-health-data-privacy/',
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

/**
 * The implemented live CDC signals, with the model's unavailable input stated.
 *
 * The model retains four weights, but NREVSS has no live adapter. The wording
 * must distinguish supported sample inputs from actual live contributors.
 *
 * `withSystems` names the surveillance system behind each signal (use where the
 * text is about provenance); `plain` is the same list in running prose.
 */
export const SIGNALS = {
  withSystems:
    'emergency-department visits (NSSP), the Acute Respiratory Illness ' +
    'activity level (NSSP) and wastewater viral activity (NWSS); laboratory ' +
    'test positivity (NREVSS) is unavailable live and modeled only in illustrative samples',
  plain:
    'emergency-department visits, the Acute Respiratory Illness activity ' +
    'level and wastewater viral activity; laboratory test positivity is unavailable live and modeled only in illustrative samples',
};

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
  // The cached/offline freshness notice lives in src/scripts/render.js
  // (cachedNotice), because that function is shared by the build and the
  // browser and cannot import this module. A second copy used to sit here,
  // unused, and drifted: it called the bundled artifact the "last verified
  // snapshot", which described deterministic sample data as real surveillance.
};

// Season-kit affiliate module — the ONLY copy it needs, shared by all 51 state
// pages. Four strings total, not four per page.
//
// The module is all-or-nothing: partials.seasonKitModule() renders it only when
// the title and all three products are non-empty. With any one blank it emits
// nothing at all — no container, no heading, no reserved space — so an unfilled
// slot can never reach a visitor. build/check.mjs independently fails the build
// on any placeholder token that does reach the emitted HTML.
export const seasonKit = {
  title: '',
  products: ['', '', ''],
};
