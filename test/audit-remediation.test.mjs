import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cachedNotice, stateEvidence } from '../src/scripts/render.js';
import { computeModel } from '../src/scripts/model.js';
import { datasetLd } from '../build/lib/seo.mjs';
import { affiliateLink } from '../build/lib/partials.mjs';
import { processors, privacyEmail, hasPublisherEmail, site, disclaimers } from '../build/lib/site.mjs';

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

test('the cached notice states the boundary verbatim and names the snapshot', () => {
  const html = cachedNotice({ weekEnding: '2026-07-11' });
  assert.match(html, /You are viewing a cached FluTrack page\. Data may not be current\./);
  assert.match(html, /Reconnect and refresh for the latest CDC-derived update\./);
  assert.match(html, /Last verified snapshot: Jul 11, 2026/);
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
  assert.match(html, /Last verified snapshot: not recorded/);
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
  assert.equal(site.publisher.legalName, 'Oak & Main LLC');
  assert.ok(hasPublisherEmail(), 'the publisher mailbox must be routable');
  assert.equal(privacyEmail(), 'privacy@flufollower.com');
  for (const addr of [site.publisher.email, site.publisher.privacyEmail, site.publisher.securityEmail]) {
    assert.doesNotMatch(addr, /\.(example|invalid|test|localhost)$/i);
  }
});

test('the site never claims medical review it does not have', () => {
  assert.equal(site.medicallyReviewed, false);
});
