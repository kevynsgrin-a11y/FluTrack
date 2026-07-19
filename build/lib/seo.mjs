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
