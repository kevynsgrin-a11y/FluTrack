// Round-2 coverage: build/lib/seo.mjs — structured data, sitemap and robots.
// Assertions are derived from `site` rather than hardcoded, so a deliberate
// config change does not read as a test failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { site } from '../build/lib/site.mjs';
import {
  organizationLd,
  websiteLd,
  datasetLd,
  breadcrumbLd,
  faqLd,
  statePageLd,
  sitemapXml,
  robotsTxt,
} from '../build/lib/seo.mjs';

test('organizationLd describes the site against schema.org and its production origin', () => {
  const org = organizationLd();
  assert.equal(org['@context'], 'https://schema.org');
  assert.equal(org['@type'], 'Organization');
  assert.equal(org.name, site.name);
  assert.equal(org.url, site.origin);
  assert.equal(org.logo, `${site.origin}/assets/icon-512.png`);
  assert.equal(org.description, site.shortDescription);
});

test('organizationLd omits a placeholder .example publisher email', () => {
  // RFC-2606 `.example` is not deliverable; advertising it in structured data
  // would be a false contact claim.
  assert.match(site.publisher.email, /\.example$/);
  assert.equal('email' in organizationLd(), false);
});

test('organizationLd omits sameAs unless a real social profile URL is configured', () => {
  // `social.twitter` is a handle, not a URL — a handle is not a sameAs target.
  assert.equal('url' in site.social, false);
  assert.equal('sameAs' in organizationLd(), false);
});

test('websiteLd advertises a search action whose query input matches its placeholder', () => {
  const web = websiteLd();
  assert.equal(web['@type'], 'WebSite');
  const action = web.potentialAction;
  assert.equal(action['@type'], 'SearchAction');
  assert.equal(action.target, `${site.origin}/states/?q={search_term_string}`);
  // The placeholder inside `target` and the required parameter name must agree,
  // or the structured data is invalid.
  assert.match(action.target, /\{(.+?)\}/);
  assert.equal(action['query-input'], `required name=${action.target.match(/\{(.+?)\}/)[1]}`);
});

test('datasetLd credits the public-domain CDC sources and claims no date window it cannot keep', () => {
  const ds = datasetLd();
  assert.equal(ds['@type'], 'Dataset');
  assert.equal(ds.isBasedOn, 'https://data.cdc.gov/');
  assert.equal(ds.license, 'https://www.usa.gov/government-works');
  assert.equal(ds.isAccessibleForFree, true);
  // Omitted on purpose: the dataset tracks whatever CDC most recently published.
  assert.equal('temporalCoverage' in ds, false);
});

test('breadcrumbLd numbers crumbs from one and absolutizes each path', () => {
  const bc = breadcrumbLd([
    { name: 'Home', path: '/' },
    { name: 'States', path: '/states/' },
  ]);
  assert.equal(bc['@type'], 'BreadcrumbList');
  assert.deepEqual(
    bc.itemListElement.map((i) => i.position),
    [1, 2]
  );
  assert.equal(bc.itemListElement[0].name, 'Home');
  assert.equal(bc.itemListElement[0].item, `${site.origin}/`);
  assert.equal(bc.itemListElement[1].item, `${site.origin}/states/`);
});

test('faqLd maps question/answer pairs onto Question/acceptedAnswer nodes', () => {
  const faq = faqLd([{ q: 'Is this medical advice?', a: 'No.' }]);
  assert.equal(faq['@type'], 'FAQPage');
  const [only] = faq.mainEntity;
  assert.equal(only['@type'], 'Question');
  assert.equal(only.name, 'Is this medical advice?');
  assert.equal(only.acceptedAnswer['@type'], 'Answer');
  assert.equal(only.acceptedAnswer.text, 'No.');
});

test('statePageLd targets the state slug and only claims dates when a week is supplied', () => {
  const state = { name: 'Alabama', slug: 'alabama' };
  const undated = statePageLd(state, null);
  assert.equal(undated['@type'], 'WebPage');
  assert.equal(undated.url, `${site.origin}/state/alabama/`);
  assert.match(undated.name, /Alabama/);
  assert.equal('datePublished' in undated, false);
  assert.equal('dateModified' in undated, false);
});

test('statePageLd stamps the same week as both published and modified when dated', () => {
  const dated = statePageLd({ name: 'Alabama', slug: 'alabama' }, '2026-07-11');
  assert.equal(dated.datePublished, '2026-07-11');
  assert.equal(dated.dateModified, '2026-07-11');
});

test('sitemapXml emits a well-formed urlset and applies the documented defaults', () => {
  const xml = sitemapXml([{ path: '/' }, { path: '/states/', lastmod: '2026-07-19', priority: 0.9 }]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<\/urlset>$/);
  // Missing changefreq/priority fall back rather than emitting an empty element.
  assert.match(xml, /<changefreq>weekly<\/changefreq>/);
  assert.match(xml, /<priority>0\.6<\/priority>/);
  // lastmod is only emitted when the entry actually has one.
  assert.equal((xml.match(/<lastmod>/g) || []).length, 1);
  assert.match(xml, /<lastmod>2026-07-19<\/lastmod>/);
  assert.match(xml, /<loc>https?:\/\/[^<]*\/states\/<\/loc>/);
  assert.equal((xml.match(/<url>/g) || []).length, 2);
});

test('sitemapXml emits a valid, entry-free urlset rather than malformed output', () => {
  const xml = sitemapXml([]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset[^>]*>[\s\S]*<\/urlset>$/);
  // No entry, so no <url> children — and the document still closes cleanly.
  assert.equal((xml.match(/<url>/g) || []).length, 0);
  assert.equal((xml.match(/<loc>/g) || []).length, 0);
});

test('robotsTxt allows crawling and points at the sitemap', () => {
  const txt = robotsTxt();
  assert.match(txt, /^User-agent: \*$/m);
  assert.match(txt, /^Allow: \/$/m);
  assert.match(txt, new RegExp(`^Sitemap: ${site.origin}/sitemap\\.xml$`, 'm'));
});
