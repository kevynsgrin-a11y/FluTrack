// ===========================================================================
// SEO helpers — structured data (JSON-LD), sitemap, robots.
// Structured data is central to E-E-A-T for a YMYL topic: it states plainly
// what FluTrack is, who publishes it, and where the data comes from.
// ===========================================================================

import { site, hasPublisherEmail } from './site.mjs';

// Stable node identifiers. Without these, the Organization emitted on /, /about/
// and /contact/ was three unconnected anonymous nodes that no consumer could
// reconcile into one publisher entity — precisely the E-E-A-T signal a YMYL site
// depends on. Everything that references the publisher now points at one @id.
export const ORG_ID = `${site.origin}/#organization`;
export const SITE_ID = `${site.origin}/#website`;

export function organizationLd() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: site.name,
    url: site.origin,
    logo: `${site.origin}/assets/icon-512.png`,
    description: site.shortDescription,
  };
  // The accountable entity behind a health-adjacent site is exactly the signal
  // consumers of this markup are looking for, so name it rather than leaving
  // the brand to stand in for a publisher. `parentOrganization`, not
  // `legalName`: FluTrack is a brand operated BY the LLC, so claiming the LLC
  // as FluTrack's own registered name would be the wrong relationship.
  if (site.publisher.legalName && site.publisher.legalName !== site.name) {
    org.parentOrganization = {
      '@type': 'Organization',
      '@id': `${site.origin}/#publisher`,
      name: site.publisher.legalName,
    };
  }
  // The brand and the domain differ (FluTrack vs flufollower.com). Declaring the
  // alternate name lets the two resolve to one entity instead of competing.
  const domain = site.origin.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0];
  if (domain && domain.toLowerCase() !== site.name.toLowerCase()) {
    org.alternateName = domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  // Only advertise a contact email / social profile in structured data once a
  // real one is configured — never a placeholder (RFC-2606 reserved TLD, or an
  // unverified handle that nothing on the site actually links to).
  if (hasPublisherEmail()) org.email = site.publisher.email;
  if (site.social && site.social.url) {
    org.sameAs = [site.social.url];
  }
  return org;
}

export function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: site.name,
    url: site.origin,
    description: site.description,
    inLanguage: 'en-US',
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${site.origin}/states/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * The Dataset node for the FluTrack Respiratory Threat Level.
 *
 * `DataDownload` is emitted ONLY when the bundled artifact is a verified
 * published snapshot (`kind: 'published'`). The artifact shipped today is
 * deterministic, clearly-labelled ILLUSTRATIVE sample data that the browser
 * replaces with a live CDC pull — advertising it as a distribution made stale
 * demonstration content look like a current public data product, which is the
 * one claim a health-adjacent dataset must never make loosely. When the
 * artifact is illustrative the node says so in `description` instead, and the
 * page labels it the same way, so the HTML and the schema agree.
 *
 * @param snapshot the bundled snapshot object (kind, version, generatedAt,
 *                 weekEnding, temporalCoverage)
 */
export function datasetLd(snapshot = {}) {
  const isPublished = snapshot.kind === 'published';
  const illustrative =
    ' The JSON artifact bundled with this page is an illustrative example used for ' +
    'first paint and offline fallback, not a published data product; the live ' +
    'reading is fetched from the CDC in the visitor\u2019s browser.';

  const ds = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${site.origin}/#dataset`,
    name: 'FluTrack Respiratory Threat Level',
    description:
      'A unified, state-level respiratory threat level for influenza, RSV and ' +
      'COVID-19, derived from public-domain CDC surveillance systems (NSSP, ' +
      'NWSS, NREVSS).' + (isPublished ? '' : illustrative),
    creator: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    // The node is emitted on the home page, so it must describe that URL;
    // /methodology/ is documentation about the dataset, not the dataset itself.
    url: site.origin,
    sameAs: `${site.origin}/methodology/`,
    isBasedOn: 'https://data.cdc.gov/',
    license: 'https://www.usa.gov/government-works',
    isAccessibleForFree: true,
    spatialCoverage: { '@type': 'Place', name: 'United States' },
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'Wastewater viral activity level (WVAL)' },
      { '@type': 'PropertyValue', name: 'Acute respiratory illness activity level' },
      { '@type': 'PropertyValue', name: 'Emergency department visits for respiratory illness' },
      { '@type': 'PropertyValue', name: 'Laboratory test positivity' },
    ],
    keywords: ['influenza', 'RSV', 'COVID-19', 'respiratory illness', 'CDC', 'wastewater'],
  };

  // Provenance fields, all sourced from the artifact itself rather than from
  // build time — a forward-dated or rebuild-tracking value would overstate how
  // current the served reading is.
  if (snapshot.generatedAt) ds.dateModified = snapshot.generatedAt;
  else if (snapshot.weekEnding) ds.dateModified = snapshot.weekEnding;
  if (snapshot.temporalCoverage) ds.temporalCoverage = snapshot.temporalCoverage;
  if (snapshot.version) ds.version = snapshot.version;

  if (isPublished) {
    ds.distribution = [
      {
        '@type': 'DataDownload',
        name: 'FluTrack state threat-level snapshot (JSON)',
        encodingFormat: 'application/json',
        contentUrl: `${site.origin}/data/snapshot.json`,
        ...(snapshot.generatedAt ? { dateModified: snapshot.generatedAt } : {}),
      },
    ];
  }

  return ds;
}

export function breadcrumbLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `${site.origin}${c.path}`,
    })),
  };
}

export function faqLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.q,
      acceptedAnswer: { '@type': 'Answer', text: q.a },
    })),
  };
}

/** A WebPage node describing a state report (dated, medical-webpage flavored). */
export function statePageLd(state, weekEnding) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${state.name} respiratory illness activity`,
    url: `${site.origin}/state/${state.slug}/`,
    description: `Current flu, RSV and COVID-19 activity level and trend for ${state.name}, from public CDC surveillance data.`,
    isPartOf: { '@id': SITE_ID },
    // schema.org/about expects a Thing, not a bare string — plain strings are a
    // type error and cannot resolve to the actual disease entities.
    about: [
      {
        '@type': 'MedicalCondition',
        name: 'Influenza',
        sameAs: 'https://en.wikipedia.org/wiki/Influenza',
      },
      {
        '@type': 'MedicalCondition',
        name: 'Respiratory syncytial virus',
        sameAs: 'https://en.wikipedia.org/wiki/Respiratory_syncytial_virus',
      },
      {
        '@type': 'MedicalCondition',
        name: 'COVID-19',
        sameAs: 'https://en.wikipedia.org/wiki/COVID-19',
      },
    ],
    // datePublished is the page's first publication and must NOT track the data
    // week — advancing it on every rebuild claims the page is newly published
    // rather than newly updated.
    datePublished: site.contentPublished,
    ...(weekEnding ? { dateModified: weekEnding } : {}),
  };
}

/** Build sitemap.xml from a list of { path, changefreq, priority }. */
export function sitemapXml(entries) {
  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${site.origin}${e.path}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}
    <changefreq>${e.changefreq || 'weekly'}</changefreq>
    <priority>${e.priority ?? 0.6}</priority>
  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export function robotsTxt() {
  return `# FluTrack robots
User-agent: *
Allow: /

Sitemap: ${site.origin}/sitemap.xml
`;
}
