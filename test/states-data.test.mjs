import { test } from 'node:test';
import assert from 'node:assert/strict';
import { states, slugify, stateBySlug, stateByAbbr } from '../src/scripts/states-data.js';

test('reference data holds the 50 states plus DC, each with a slug', () => {
  assert.equal(states.length, 51);
  for (const s of states) {
    assert.ok(s.name && s.abbr && s.fips, `${s.abbr} has name/abbr/fips`);
    assert.equal(s.abbr.length, 2, `${s.abbr} is a 2-letter code`);
    assert.equal(s.slug, slugify(s.name), `${s.abbr} slug is derived from its name`);
  }
});

test('abbreviations, FIPS codes, and slugs are all unique', () => {
  assert.equal(new Set(states.map((s) => s.abbr)).size, 51);
  assert.equal(new Set(states.map((s) => s.fips)).size, 51);
  assert.equal(new Set(states.map((s) => s.slug)).size, 51);
});

test('every FIPS code is two digits and every slug is URL-safe', () => {
  for (const s of states) {
    assert.match(s.fips, /^\d{2}$/, `${s.abbr} fips is two digits`);
    assert.match(s.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${s.abbr} slug is URL-safe`);
    assert.ok(!s.slug.endsWith('-') && !s.slug.startsWith('-'), `${s.abbr} slug has no edge dashes`);
  }
});

test('every HHS region is a valid 1-10 code', () => {
  for (const s of states) {
    assert.ok(
      Number.isInteger(s.hhsRegion) && s.hhsRegion >= 1 && s.hhsRegion <= 10,
      `${s.abbr} hhsRegion ${s.hhsRegion} is in 1..10`
    );
  }
  // The CDC region rollup must cover all ten regions.
  assert.equal(new Set(states.map((s) => s.hhsRegion)).size, 10);
});

test('slugify lowercases and hyphenates multi-word state names', () => {
  assert.equal(slugify('New York'), 'new-york');
  assert.equal(slugify('New Hampshire'), 'new-hampshire');
  assert.equal(slugify('District of Columbia'), 'district-of-columbia');
  assert.equal(slugify('West Virginia'), 'west-virginia');
  assert.equal(slugify('Rhode Island'), 'rhode-island');
});

test('slugify collapses runs of separators and trims the edges', () => {
  assert.equal(slugify('  New   York  '), 'new-york');
  assert.equal(slugify('New-York'), 'new-york');
  assert.equal(slugify('--New York--'), 'new-york');
  assert.equal(slugify('N.Y.'), 'n-y');
});

test('stateBySlug resolves a known slug and returns null otherwise', () => {
  assert.equal(stateBySlug('new-york').abbr, 'NY');
  assert.equal(stateBySlug('california').abbr, 'CA');
  assert.equal(stateBySlug('district-of-columbia').abbr, 'DC');
  assert.equal(stateBySlug('new-york').name, 'New York');
  assert.equal(stateBySlug('atlantis'), null);
  assert.equal(stateBySlug(''), null);
  assert.equal(stateBySlug(undefined), null);
});

test('stateBySlug is case-sensitive, unlike stateByAbbr', () => {
  // Documented asymmetry: the slug is the URL path segment the build emits,
  // so it is compared verbatim; the abbreviation is user input and normalized.
  assert.equal(stateBySlug('New-York'), null);
  assert.equal(stateBySlug('ca'), null);
  assert.equal(stateByAbbr('ca').abbr, 'CA');
});

test('stateByAbbr is case-insensitive and tolerant of empty input', () => {
  assert.equal(stateByAbbr('CA').name, 'California');
  assert.equal(stateByAbbr('ca').name, 'California');
  assert.equal(stateByAbbr('Ca').name, 'California');
  assert.equal(stateByAbbr('ny').abbr, 'NY');
  assert.equal(stateByAbbr('DC').abbr, 'DC');
  assert.equal(stateByAbbr('XX'), null);
  assert.equal(stateByAbbr(''), null);
  assert.equal(stateByAbbr(null), null);
  assert.equal(stateByAbbr(undefined), null);
});

test('every state is reachable by its own slug and abbreviation', () => {
  for (const s of states) {
    assert.equal(stateBySlug(s.slug), s, `${s.abbr} found by slug`);
    assert.equal(stateByAbbr(s.abbr), s, `${s.abbr} found by abbr`);
    assert.equal(stateByAbbr(s.abbr.toLowerCase()), s, `${s.abbr} found by lowercased abbr`);
  }
});
