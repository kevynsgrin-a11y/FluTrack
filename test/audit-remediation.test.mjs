import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cachedNotice, stateEvidence } from '../src/scripts/render.js';
import { computeModel } from '../src/scripts/model.js';
import { datasetLd } from '../build/lib/seo.mjs';
import { affiliateLink } from '../build/lib/partials.mjs';
import {
  processors,
  privacyEmail,
  hasPublisherEmail,
  postalAddressLine,
  site,
  disclaimers,
} from '../build/lib/site.mjs';

// ---------------------------------------------------------------------------
// Regression cover for the portfolio-audit remediation (findings 8–17).
//
// Each of these guards a claim the SITE makes about itself. They are the kind
// of defect that never shows up as a broken page: a policy that names a vendor
// the code no longer uses, a schema that advertises a data product that is only
// a sample, a cached page that reads like a live one. The page renders fine in
// every case — it just says something untrue.
// ---------------------------------------------------------------------------

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = JSON.parse(readFileSync(resolve(root, 'src/data/snapshot.json'), 'utf8'));

// --- Finding 12: the sample artifact is not a data product ---------------- //

test('an illustrative snapshot is never advertised as a DataDownload', () => {
  const ld = datasetLd(snapshot);
  assert.equal(snapshot.kind, 'sample', 'the bundled artifact is still illustrative');
  assert.equal(ld.distribution, undefined, 'no distribution may be claimed for sample data');
  assert.match(ld.description, /illustrative example/);
});

test('a verified published snapshot does advertise its distribution', () => {
  const ld = datasetLd({ ...snapshot, kind: 'published' });
  assert.equal(ld.distribution.length, 1);
  assert.match(ld.distribution[0].contentUrl, /\/data\/snapshot\.json$/);
  assert.doesNotMatch(ld.description, /illustrative example/);
});

test('the Dataset node carries provenance sourced from the artifact itself', () => {
  const ld = datasetLd(snapshot);
  assert.equal(ld.dateModified, snapshot.generatedAt);
  assert.equal(ld.temporalCoverage, snapshot.temporalCoverage);
  assert.equal(ld.version, snapshot.version);
  // The coverage must be an interval ending at the week actually on screen —
  // a forward-dated window would overstate what is available.
  assert.match(ld.temporalCoverage, /^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/);
  assert.ok(ld.temporalCoverage.endsWith(snapshot.weekEnding));
});

// --- Finding 17: the cached/offline freshness boundary -------------------- //

test('the cached notice states the freshness boundary and names the snapshot', () => {
  // Assert the invariants, not the prose. Pinning the exact sentence meant a
  // correction to that sentence read as a regression — and the sentence needed
  // correcting, because it called the bundled artifact the "last verified
  // snapshot" when it is deterministic sample data, not surveillance.
  const html = cachedNotice({ weekEnding: '2026-07-11' });
  assert.match(html, /cached FluTrack page/i, 'says the page is cached');
  assert.match(html, /may not be current/i, 'states the freshness boundary');
  assert.match(html, /reconnect and refresh/i, 'tells the reader how to get a live figure');
  assert.match(html, /Jul 11, 2026/, 'names the snapshot it is showing');
});

test('the cached notice never presents the bundled sample as verified surveillance', () => {
  // The offline page was the one place on the site describing the PRNG sample
  // artifact as real, verified data.
  const html = cachedNotice({ weekEnding: '2026-07-11' });
  assert.match(html, /sample data/i, 'names the artifact as sample data');
  assert.doesNotMatch(html, /verified snapshot/i, 'must not call sample data verified');
});

test('the cached notice offers a visible retry control', () => {
  const html = cachedNotice({ weekEnding: '2026-07-11' });
  assert.match(html, /data-action="retry-refresh"/);
  assert.match(html, />Retry refresh</);
  // Opt-out exists for contexts that cannot act on it.
  assert.doesNotMatch(cachedNotice({ weekEnding: '2026-07-11', retry: false }), /retry-refresh/);
});

test('a missing snapshot date is reported as such, never as a plausible date', () => {
  const html = cachedNotice({});
  assert.match(html, /not recorded/, 'an absent date is stated, not invented');
  assert.doesNotMatch(html, /\b(19|20)\d\d\b/, 'no year may be fabricated when none is known');
});

test('no severity may be announced as current while offline', () => {
  // The invariant is enforced in app.js; assert the guard is present rather
  // than letting a refactor quietly drop it.
  const app = readFileSync(resolve(root, 'src/scripts/app.js'), 'utf8');
  assert.match(app, /function isOffline\(\)/);
  assert.match(
    app,
    /const suffix = isOffline\(\) \? ' \(cached data — may not be current\)\.' : '\.';/,
    'announceSelection must qualify the reading while offline'
  );
});

// --- Finding 14: per-state evidence is derived, not templated ------------- //

test('the evidence block reports real source coverage for a state', () => {
  const signals = snapshot.states.CA;
  const html = stateEvidence(
    { name: 'California', abbr: 'CA' },
    computeModel(signals),
    signals,
    { weekEnding: snapshot.weekEnding }
  );
  assert.match(html, /4<\/strong> CDC signals reported/);
  assert.match(html, /Wastewater viral activity/);
});

test('the evidence block reports a real week-over-week delta', () => {
  const signals = snapshot.states.CA;
  const series = signals.edCombinedSeries;
  const delta = Math.round((series.at(-1) - series.at(-2)) * 100) / 100;
  assert.notEqual(delta, 0, 'fixture must actually move, or this asserts nothing');
  const html = stateEvidence(
    { name: 'California', abbr: 'CA' },
    computeModel(signals),
    signals,
    { weekEnding: snapshot.weekEnding }
  );
  assert.match(html, new RegExp(`${Math.abs(delta).toFixed(2)} points`));
  assert.match(html, /went up|went down/);
});

test('the evidence block differs between states', () => {
  const render = (abbr, name) => {
    const signals = snapshot.states[abbr];
    return stateEvidence({ name, abbr }, computeModel(signals), signals, {
      weekEnding: snapshot.weekEnding,
    });
  };
  assert.notEqual(render('CA', 'California'), render('OH', 'Ohio'));
});

test('the evidence block links the state’s own rows in the CDC source', () => {
  const signals = snapshot.states.NY;
  const html = stateEvidence({ name: 'New York', abbr: 'NY' }, computeModel(signals), signals, {
    weekEnding: snapshot.weekEnding,
  });
  assert.match(html, /data\.cdc\.gov\/resource\/vutn-jzwm\.json\?geography=New%20York/);
});

test('the evidence block never offers advice and degrades honestly', () => {
  const html = stateEvidence({ name: 'Texas', abbr: 'TX' }, computeModel({}), {}, {});
  assert.match(html, /published none of the four surveillance signals/);
  // No advice, no forecast, in either the populated or the empty state.
  for (const out of [
    html,
    stateEvidence(
      { name: 'Texas', abbr: 'TX' },
      computeModel(snapshot.states.TX),
      snapshot.states.TX,
      { weekEnding: snapshot.weekEnding }
    ),
  ]) {
    assert.doesNotMatch(out, /\byou should\b|\bwe recommend\b|\bvaccin|\bmask\b|\bsee a doctor\b/i);
  }
});

// --- Finding 15: commercial links carry their disclosure ------------------ //

test('a commercial link emits the disclosure immediately before it', () => {
  const html = affiliateLink({ href: 'https://example.com/p', label: 'Visit merchant' });
  const disclosureAt = html.indexOf('may earn a commission');
  const anchorAt = html.indexOf('<a ');
  assert.ok(disclosureAt > -1 && anchorAt > disclosureAt, 'disclosure must precede the link');
  assert.match(html, /rel="sponsored nofollow"/);
});

test('the disclosure wording is fixed, not caller-supplied', () => {
  assert.match(
    disclaimers.affiliate,
    /^Affiliate link — FluTrack may earn a commission if you buy through this link, at no extra cost to you\. This does not affect our data or editorial content\.$/
  );
  assert.ok(affiliateLink({ href: '#', label: 'x' }).includes(disclaimers.affiliate));
});

test('the example variant does not render a navigable link', () => {
  const html = affiliateLink({ label: 'Visit merchant', example: true });
  assert.doesNotMatch(html, /<a /);
  assert.match(html, /<button[^>]*disabled/);
});

// --- Findings 8 & 13: named processors and an accountable publisher ------- //

test('every processor is named by legal entity with a full register row', () => {
  assert.ok(processors.length >= 5);
  for (const p of processors) {
    for (const field of [
      'vendor', 'service', 'purpose', 'basis', 'dataCategories', 'retention', 'deletionPath', 'status', 'docs',
    ]) {
      assert.ok(p[field], `${p.key} is missing ${field}`);
    }
    assert.ok(['essential', 'analytics', 'advertising'].includes(p.consentClass));
    // "a reputable email provider" is what this replaced — require a real entity.
    assert.match(p.vendor, /Inc\.|LLC|Ltd|Commission|Centers for/);
  }
});

test('the deployed analytics provider is in the register', () => {
  const analytics = processors.find((p) => p.key === 'cloudflare-analytics');
  assert.equal(analytics.vendor, 'Cloudflare, Inc.');
  assert.match(analytics.service, /Cloudflare Web Analytics/);
});

test('the publisher is an accountable entity with live contact routes', () => {
  // Assert the invariant, not the literal name: a legal entity distinct from
  // the brand must be configured. Pinning the exact string made a legitimate
  // correction of the registered name look like a regression.
  assert.ok(site.publisher.legalName, 'a legal entity must be named');
  assert.notEqual(
    site.publisher.legalName,
    site.name,
    'the legal entity must be distinct from the brand'
  );
  assert.ok(hasPublisherEmail(), 'the publisher mailbox must be routable');
  assert.equal(privacyEmail(), 'privacy@flufollower.com');
  for (const addr of [site.publisher.email, site.publisher.privacyEmail, site.publisher.securityEmail]) {
    assert.doesNotMatch(addr, /\.(example|invalid|test|localhost)$/i);
  }
});

test('the publisher address is complete or absent — never half-built', () => {
  // A partial address is worse than none: it looks like a real one. Either
  // every component is present and postalAddressLine() renders, or nothing is
  // published at all.
  const a = site.publisher.address;
  const line = postalAddressLine();
  if (line) {
    for (const part of ['street', 'locality', 'region', 'postalCode', 'country']) {
      assert.ok(a && a[part], `address.${part} must be set when an address is published`);
    }
    assert.ok(line.includes(a.street) && line.includes(a.postalCode));
  } else {
    assert.ok(!a || !a.street, 'no address line should render from a configured street');
  }
});

test('CAN-SPAM prerequisites hold for any commercial email', () => {
  // Commercial email requires a valid physical postal address. Without one the
  // surge-alert programme cannot carry promotional content at all, so this is a
  // hard precondition rather than a nicety.
  assert.ok(postalAddressLine(), 'a postal address is required before any commercial email is sent');
  assert.ok(site.publisher.jurisdiction, 'an operating jurisdiction must be recorded');
});

test('the site never claims medical review it does not have', () => {
  assert.equal(site.medicallyReviewed, false);
});
