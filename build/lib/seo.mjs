// ===========================================================================
// SEO helpers — structured data (JSON-LD), sitemap, robots.
// Structured data is central to E-E-A-T for a YMYL topic: it states plainly
// what FluTrack is, who publishes it, and where the data comes from.
// ===========================================================================

import { site } from './site.mjs';

export function organizationLd() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: site.origin,
    logo: `${site.origin}/assets/icon-512.png`,
    description: site.shortDescription,
  };
  // Only advertise a contact email / social profile in structured data once a
  // real one is configured — never a placeholder (RFC-2606 `.example`, or an
  // unverified handle that nothing on the site actually links to).
  if (site.publisher.email && !/\.example$/.test(site.publisher.email)) {
    org.email = site.publisher.email;
  }
  if (site.social && site.social.url) {
    org.sameAs = [site.social.url];
  }
  // The accountable entity and a locatable address are the E-E-A-T signals a
  // health-adjacent site is judged on, and /changelog/ tells readers they are
  // published in the structured data. They were not: the config that held them
  // was never imported by this module. Emitted only when complete, so a partial
  // record never becomes a half-true claim.
  if (site.publisher.legalName) org.legalName = site.publisher.legalName;
  const a = site.publisher.address;
  if (a && a.street && a.locality && a.region && a.postalCode) {
    org.address = {
      '@type': 'PostalAddress',
      streetAddress: a.street,
      addressLocality: a.locality,
      addressRegion: a.region,
      postalCode: a.postalCode,
      ...(a.country ? { addressCountry: a.country } : {}),
    };
  }
  return org;
}

export function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.origin,
    description: site.description,
    inLanguage: 'en-US',
    publisher: { '@type': 'Organization', name: site.name },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${site.origin}/states/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function datasetLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'FluTrack Respiratory Threat Level',
    description:
      'A unified, state-level respiratory threat level for influenza, RSV and ' +
      'COVID-19, derived from public-domain CDC surveillance systems (NSSP, ' +
      'NWSS, NREVSS).',
    creator: { '@type': 'Organization', name: site.name },
    url: `${site.origin}/methodology/`,
    isBasedOn: 'https://data.cdc.gov/',
    license: 'https://www.usa.gov/government-works',
    isAccessibleForFree: true,
    keywords: ['influenza', 'RSV', 'COVID-19', 'respiratory illness', 'CDC', 'wastewater'],
    // temporalCoverage intentionally omitted: the dataset reflects whatever CDC
    // has most recently published, so a fixed/forward-dated window would overstate
    // what is actually available.
  };
}

/** The "Check your area / Report how you feel" tool on the home page. */
export function webApplicationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'FluTrack — Check your area',
    url: `${site.origin}/#check-area`,
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Any (web browser)',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description:
      "See this week's CDC respiratory data for your U.S. county — hospital admissions, " +
      'wastewater and the state level — and add an anonymous symptom report to a privacy-safe community count.',
    publisher: { '@type': 'Organization', name: site.name, url: site.origin },
    isBasedOn: 'https://data.cdc.gov/',
  };
}

/**
 * One schema.org Dataset node per CDC dataset FluTrack reads (/data-sources/).
 * All are U.S. Government works in the public domain.
 */
export function cdcDatasetLd({ id, name, description }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name,
    description,
    identifier: id,
    url: `https://data.cdc.gov/d/${id}`,
    creator: { '@type': 'GovernmentOrganization', name: 'U.S. Centers for Disease Control and Prevention', url: 'https://www.cdc.gov/' },
    license: 'https://www.usa.gov/government-works',
    isAccessibleForFree: true,
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `https://data.cdc.gov/resource/${id}.json` }],
  };
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
/**
 * WebPage node for a page whose reading is a state-level one.
 *
 * `page` lets a caller that is NOT at /state/<slug>/ describe itself. The metro
 * pages render the state reading but live at /metro/<slug>/, and without this
 * they emitted a WebPage node whose url and name pointed at the state page —
 * contradicting their own canonical and og:url, and telling crawlers that three
 * distinct URLs are the same document.
 */
export function statePageLd(state, weekEnding, page = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.name || `Flu in ${state.name}: current activity level`,
    url: `${site.origin}${page.path || `/state/${state.slug}/`}`,
    description:
      page.description ||
      `Current flu (influenza) activity level and weekly trend for ${state.name}, plus RSV and COVID-19, from public CDC surveillance data. Updated weekly.`,
    isPartOf: { '@type': 'WebSite', name: site.name, url: site.origin },
    about: ['Influenza', 'Respiratory syncytial virus', 'COVID-19'],
    ...(weekEnding ? { datePublished: weekEnding, dateModified: weekEnding } : {}),
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
