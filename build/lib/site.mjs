// ---------------------------------------------------------------------------
// Global site configuration — single source of truth for metadata, used by the
// build pipeline (SEO tags, sitemap, structured data) and injected into pages.
// ---------------------------------------------------------------------------

export const site = {
  name: 'FluTrack',
  tagline: 'Local flu, RSV & COVID activity in plain English',
  // Production origin. Override at build time with SITE_ORIGIN env var.
  origin: process.env.SITE_ORIGIN || 'https://flutrack.pages.dev',
  locale: 'en_US',
  themeColor: '#0b7285',
  // Descriptions used across meta tags / structured data.
  description:
    'FluTrack turns public-domain CDC surveillance data into a simple, ' +
    'plain-English respiratory threat level for your state — tracking flu, ' +
    'RSV and COVID-19 trends so you can make everyday decisions with confidence.',
  shortDescription:
    'A simple, local respiratory threat level for flu, RSV and COVID-19, ' +
    'built on public CDC surveillance data.',
  // Publisher / contact — E-E-A-T transparency signals.
  publisher: {
    name: 'FluTrack',
    email: 'hello@flutrack.example',
    // Editorial responsibility statement shown in the footer / about page.
    role: 'Independent data-visualization utility',
  },
  social: {
    twitter: '@flutrack',
  },
  // The CDC data cadence, surfaced in the UI to set expectations honestly.
  dataCadence: 'Weekly (CDC surveillance systems publish on Fridays)',
  // Season framing — 2026–2027 respiratory season (MMWR Week 40 → Week 20).
  season: {
    label: '2026–2027 respiratory season',
    startsISO: '2026-10-04', // MMWR Week 40
    endsISO: '2027-05-22', //   MMWR Week 20
  },
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
};
