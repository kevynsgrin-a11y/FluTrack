// Round-2 coverage: build/lib/seo.mjs — structured data, sitemap and robots.
// Assertions are derived from `site` rather than hardcoded, so a deliberate
// config change does not read as a test failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { site, hasPublisherEmail } from '../build/lib/site.mjs';
import { contentRevised, revisedOn, revisedLabel } from '../build/lib/partials.mjs';
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

test('organizationLd advertises the publisher email now that it is deliverable', () => {
  // This test used to assert the opposite, because the build pipeline read a
  // config whose publisher email was the RFC-2606 placeholder hello@flutrack
  // .example. The richer config carrying the verified mailbox was never
  // imported by the pipeline, so the site shipped a contactless Organization
  // node. The two configs are now one module.
  assert.equal(hasPublisherEmail(), true);
  assert.equal(organizationLd().email, site.publisher.email);
});

test('a reserved-domain address is still refused as a contact claim', () => {
  // The guard is what keeps a placeholder out of structured data; it must hold
  // for every RFC-2606 reserved domain, case-insensitively.
  for (const bad of ['hello@flutrack.example', 'x@y.invalid', 'x@y.test', 'x@y.localhost', 'X@Y.EXAMPLE']) {
    assert.equal(hasPublisherEmail(bad), false, bad);
  }
  assert.equal(hasPublisherEmail('hello@flufollower.com'), true);
});

test('organizationLd names the accountable entity and a complete postal address', () => {
  const org = organizationLd();
  assert.equal(org.legalName, site.publisher.legalName);
  assert.equal(org.address['@type'], 'PostalAddress');
  assert.equal(org.address.streetAddress, site.publisher.address.street);
  assert.equal(org.address.addressLocality, site.publisher.address.locality);
  assert.equal(org.address.addressRegion, site.publisher.address.region);
  assert.equal(org.address.postalCode, site.publisher.address.postalCode);
  assert.equal(org.address.addressCountry, site.publisher.address.country);
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

test('statePageLd describes the calling page, not always the state page', () => {
  // The metro pages render a state-level reading but live at /metro/<slug>/.
  // Without an override they emitted a WebPage node whose url and name pointed
  // at /state/<slug>/, contradicting their own canonical and og:url and telling
  // crawlers that three distinct URLs were the same document.
  const state = { name: 'Georgia', slug: 'georgia' };
  const metro = statePageLd(state, '2026-10-02', {
    path: '/metro/atlanta/',
    name: "What's Going Around in Atlanta: Flu, RSV & COVID",
    description: 'Metro-specific description.',
  });
  assert.equal(metro.url, `${site.origin}/metro/atlanta/`);
  assert.equal(metro.name, "What's Going Around in Atlanta: Flu, RSV & COVID");
  assert.equal(metro.description, 'Metro-specific description.');
  // The state page keeps its own identity when nothing is passed.
  assert.equal(statePageLd(state, '2026-10-02').url, `${site.origin}/state/georgia/`);
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

// --- content revision dates ------------------------------------------------ //

test('every content page declares its own revision date, not a site-wide constant', () => {
  // All 16 content pages used to take sitemap <lastmod> from site.contentUpdated
  // while printing their own hardcoded month, so the two drifted: nine pages
  // displayed July or August 2026 though git shows each was revised in September.
  const paths = Object.keys(contentRevised);
  assert.ok(paths.length >= 16, `expected every content page, got ${paths.length}`);
  for (const p of paths) {
    assert.match(p, /^\/[a-z0-9./-]*\/$/, `${p} is a rooted directory path`);
    assert.match(contentRevised[p], /^\d{4}-\d{2}-\d{2}$/, `${p} has an ISO date`);
    assert.equal(revisedOn(p), contentRevised[p]);
  }
});

test('the rendered month and the sitemap date are the same value', () => {
  // The defect was that these were two independent literals. They are now one.
  assert.equal(revisedLabel('/privacy/'), 'September 2026');
  assert.equal(revisedOn('/privacy/'), contentRevised['/privacy/']);
  assert.equal(revisedLabel('/terms/'), 'September 2026');
  for (const [p, iso] of Object.entries(contentRevised)) {
    const [y, m] = iso.split('-');
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    assert.equal(revisedLabel(p), `${MONTHS[Number(m) - 1]} ${y}`, p);
  }
});

test('an unknown path falls back to the site-wide date rather than throwing', () => {
  assert.equal(revisedOn('/not-a-page/'), site.contentUpdated);
});
