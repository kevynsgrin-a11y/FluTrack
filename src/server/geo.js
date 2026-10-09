// ===========================================================================
// Location plumbing: ZIP → county, Cloudflare's request.cf → state/county,
// and the ZIP→county crosswalk builder used to seed D1.
//
// Privacy: a ZIP5 is used only as a lookup key and is never stored. A ZIP3 is
// stored only when its area has more than 20,000 people (the HIPAA Safe Harbor
// benchmark), otherwise NULL.
// ===========================================================================

import { states } from '../scripts/states-data.js';
import { COUNTY_NAMES } from './county-names.js';

/**
 * Three-digit ZIP areas with 20,000 or fewer people, per the HHS de-
 * identification guidance (HIPAA Safe Harbor, 45 CFR 164.514(b)(2)(i)(B)),
 * which lists them from Census data. A report from one of these keeps no ZIP3.
 * Refresh against the latest Census ZCTA populations: see FOLLOWUPS.md.
 */
export const RESTRICTED_ZIP3 = Object.freeze(
  new Set(['036', '059', '063', '102', '203', '556', '692', '790', '821', '823', '830', '831', '878', '879', '884', '890', '893'])
);

const STATE_BY_FIPS = new Map(states.map((s) => [s.fips, s]));
const STATE_BY_ABBR = new Map(states.map((s) => [s.abbr, s]));

/** A 5-digit ZIP from user input ("92101", "92101-1234", " 92101 "), else null. */
export function normalizeZip(input) {
  const m = String(input ?? '').trim().match(/^(\d{5})(?:-\d{4})?$/);
  return m ? m[1] : null;
}

/** ZIP3 that may be stored for a ZIP5, or null when the area is too small. */
export function storableZip3(zip5) {
  const z = normalizeZip(zip5);
  if (!z) return null;
  const z3 = z.slice(0, 3);
  return RESTRICTED_ZIP3.has(z3) ? null : z3;
}

/** USPS state code for a county FIPS ("06073" → "CA"), or null. */
export function stateForCounty(fips) {
  return STATE_BY_FIPS.get(String(fips || '').slice(0, 2))?.abbr || null;
}

export function isUsState(abbr) {
  return STATE_BY_ABBR.has(String(abbr || '').toUpperCase());
}

export function stateName(abbr) {
  return STATE_BY_ABBR.get(String(abbr || '').toUpperCase())?.name || null;
}

/** "San Diego County", "Orleans Parish", "Richmond city", "Juneau" (AK). */
export function countyLabel(fips) {
  const f = String(fips || '');
  const name = COUNTY_NAMES[f];
  if (!name) return null;
  const st = f.slice(0, 2);
  if (st === '22') return `${name} Parish`;
  if (st === '02') return name; // boroughs and census areas
  if (st === '11') return name; // District of Columbia
  if (st === '51' && Number(f.slice(2)) >= 500) return `${name} city`;
  if (/\b(city|county|parish|borough|municipio)$/i.test(name)) return name;
  return `${name} County`;
}

/**
 * Resolve where a request is "about".
 *
 * Order: a confirmed ZIP (looked up in the crosswalk), else Cloudflare's
 * request.cf postal code, else request.cf region code (state only).
 * A request whose IP country is known and is not the US is refused — unless it
 * names a US ZIP explicitly and `allowZipFromAbroad` is set (read-only lookups).
 *
 * @param {object} p
 * @param {string} [p.zip]
 * @param {object} [p.cf] request.cf
 * @param {(zip5: string) => Promise<{county_fips, state, zip3, zip3_pop_over_20k}|null>} p.lookupZip
 * @returns {Promise<{ ok: true, location } | { ok: false, error, message, status }>}
 */
export async function resolveLocation({ zip, cf = {}, lookupZip, allowZipFromAbroad = false }) {
  const country = cf && cf.country ? String(cf.country).toUpperCase() : null;
  const zip5 = normalizeZip(zip);
  const abroad = country && country !== 'US';
  if (abroad && !(allowZipFromAbroad && zip5)) {
    return { ok: false, status: 403, error: 'us_only', message: 'FluFollower is US-only for now.' };
  }
  if (zip != null && String(zip).trim() !== '' && !zip5) {
    return { ok: false, status: 422, error: 'bad_zip', message: 'Please enter a 5-digit U.S. ZIP code.' };
  }

  if (zip5) {
    const row = lookupZip ? await lookupZip(zip5) : null;
    if (!row) return { ok: false, status: 404, error: 'zip_not_found', message: 'We could not find that ZIP code. Try a nearby one.' };
    return { ok: true, location: fromCrosswalk(row, 'zip') };
  }

  const postal = normalizeZip(cf?.postalCode);
  if (postal && lookupZip) {
    const row = await lookupZip(postal);
    if (row) return { ok: true, location: fromCrosswalk(row, 'ip') };
  }
  const st = String(cf?.regionCode || '').toUpperCase();
  if (isUsState(st)) {
    return { ok: true, location: { state: st, state_name: stateName(st), county_fips: null, county_name: null, zip3: null, source: 'ip' } };
  }
  return { ok: false, status: 422, error: 'location_unknown', message: 'We could not tell where you are. Enter your ZIP code.' };
}

function fromCrosswalk(row, source) {
  const state = row.state || stateForCounty(row.county_fips);
  const zip3 = row.zip3 && Number(row.zip3_pop_over_20k) === 1 && !RESTRICTED_ZIP3.has(row.zip3) ? row.zip3 : null;
  return {
    state,
    state_name: stateName(state),
    county_fips: row.county_fips,
    county_name: countyLabel(row.county_fips),
    zip3,
    source,
  };
}

// --- Crosswalk builder (seed for D1 zip_crosswalk) ----------------------- //

/**
 * One county per ZIP: the county holding the largest share of the ZIP.
 * `rows` = [{ zip, county, weight }] where weight is HUD's RES_RATIO (share of
 * residential addresses) or, from the Census relationship file, the land area
 * of the ZIP/county overlap. Ties go to the lower FIPS, so output is stable.
 */
export function pickMaxShare(rows) {
  const best = new Map();
  for (const { zip, county, weight } of rows) {
    const z = normalizeZip(zip);
    const c = String(county || '').padStart(5, '0');
    const w = Number(weight);
    if (!z || !/^\d{5}$/.test(c) || !Number.isFinite(w)) continue;
    const cur = best.get(z);
    if (!cur || w > cur.weight || (w === cur.weight && c < cur.county)) best.set(z, { county: c, weight: w });
  }
  return best;
}

/** Parse a delimited file with a header row into objects keyed by header. */
export function parseDelimited(text, delimiter) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.map((line) => {
    const cells = line.split(delimiter);
    const o = {};
    head.forEach((h, i) => (o[h] = (cells[i] ?? '').trim().replace(/^"|"$/g, '')));
    return o;
  });
}

/**
 * Census 2020 ZCTA-to-county relationship file (pipe-delimited,
 * tab20_zcta520_county20_natl.txt) → crosswalk rows by largest land overlap.
 */
export function crosswalkFromCensus(text) {
  const rows = parseDelimited(text, '|')
    .filter((r) => r.GEOID_ZCTA5_20)
    .map((r) => ({ zip: r.GEOID_ZCTA5_20, county: r.GEOID_COUNTY_20, weight: Number(r.AREALAND_PART) }));
  return toCrosswalkRows(pickMaxShare(rows));
}

/** HUD-USPS ZIP-County crosswalk (CSV: ZIP, COUNTY, RES_RATIO, …) → rows by largest residential share. */
export function crosswalkFromHud(text) {
  const rows = parseDelimited(text, ',').map((r) => ({
    zip: r.ZIP || r.zip,
    county: r.COUNTY || r.county || r.GEOID,
    weight: Number(r.RES_RATIO ?? r.res_ratio),
  }));
  return toCrosswalkRows(pickMaxShare(rows));
}

function toCrosswalkRows(best) {
  const out = [];
  for (const [zip5, { county }] of best) {
    const state = stateForCounty(county);
    if (!state) continue; // territories are out of scope at launch
    const zip3 = zip5.slice(0, 3);
    out.push({ zip5, county_fips: county, state, zip3, zip3_pop_over_20k: RESTRICTED_ZIP3.has(zip3) ? 0 : 1 });
  }
  return out.sort((a, b) => a.zip5.localeCompare(b.zip5));
}
