// ===========================================================================
// Pure normalizers: raw CDC rows → normalized official rows
//   { source, geo_level, geo_id, pathogen, metric, value, level_label,
//     week_ending, fetched_at, method_version }
//
// One function per dataset, each tested against rows recorded from the live
// API (test/fixtures/cdc/<ID>.json). Column names are the published Socrata
// fieldNames (docs/DATA-SCHEMAS.md). Missing values are SKIPPED, never turned
// into zero: "no recent data" must stay distinguishable from "zero".
// ===========================================================================

import { states } from '../../../src/scripts/states-data.js';
import { labelToLevel } from '../../../src/scripts/threat-index.js';
import { excludeNonCommercial } from '../../../src/scripts/data-sources.js';
import { COUNTY_NAMES } from '../../../src/server/county-names.js';
import { wvalMethodVersion } from '../../../src/server/sources.js';

const STATE_BY_NAME = new Map(states.map((s) => [s.name.toLowerCase(), s]));
const STATE_BY_ABBR = new Map(states.map((s) => [s.abbr, s]));

/** "California" | "CA" | "ca" → state record (50 states + DC only), else null. */
export function resolveState(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (v.length === 2) return STATE_BY_ABBR.get(v.toUpperCase()) || null;
  return STATE_BY_NAME.get(v.toLowerCase()) || null;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Socrata dates come as "2026-09-26T00:00:00.000" or "2026-09-26". */
export const day = (v) => {
  const s = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export function pathogenOf(raw) {
  const s = String(raw || '').toLowerCase();
  if (/influenza|flu/.test(s)) return 'influenza';
  if (/sars|covid/.test(s)) return 'covid';
  if (/rsv|syncytial/.test(s)) return 'rsv';
  return null;
}

const median = (vals) => {
  const v = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

function row(source, geoLevel, geoId, pathogen, metric, value, levelLabel, weekEnding, fetchedAt, methodVersion = null) {
  return {
    source,
    geo_level: geoLevel,
    geo_id: geoId,
    pathogen,
    metric,
    value,
    level_label: levelLabel || null,
    week_ending: weekEnding,
    fetched_at: fetchedAt,
    method_version: methodVersion,
  };
}

// --- NSSP ED visits (vutn-jzwm): week_end, geography, pathogen, percent_visits
export function normalizeNsspEd(rows, fetchedAt) {
  const out = [];
  for (const r of rows) {
    const st = resolveState(r.geography);
    const week = day(r.week_end);
    const pathogen = pathogenOf(r.pathogen);
    const value = num(r.percent_visits);
    if (!st || !week || !pathogen || value == null) continue;
    out.push(row('nssp_ed', 'state', st.abbr, pathogen, 'pct_ed_visits', value, null, week, fetchedAt));
  }
  return out;
}

// --- NSSP ARI level (f3zz-zga5): week_end, geography, label
export function normalizeNsspAri(rows, fetchedAt) {
  const out = [];
  for (const r of rows) {
    const st = resolveState(r.geography);
    const week = day(r.week_end);
    const level = labelToLevel(r.label);
    // "Data Unavailable" (and anything unrecognized) is missing, not a level.
    if (!st || !week || level == null) continue;
    out.push(row('nssp_ari', 'state', st.abbr, 'ari', 'activity_level', level, String(r.label).trim(), week, fetchedAt));
  }
  return out;
}

// --- NHSN levels (vdzy-6i9v) and HRD (ua7e-t2fy final, mpgq-jmmr preliminary)
// jurisdiction (USPS / "USA"), weekendingdate,
// totalconf{flu,c19,rsv}newadm, …newadmper100k, …newadmper100klevel (vdzy only)
const NHSN_PATHOGENS = [
  ['flu', 'influenza'],
  ['c19', 'covid'],
  ['rsv', 'rsv'],
];

export function normalizeNhsn(rows, fetchedAt, source = 'nhsn_levels') {
  const out = [];
  for (const r of rows) {
    const st = resolveState(r.jurisdiction);
    const week = day(r.weekendingdate);
    if (!st || !week) continue;
    for (const [col, pathogen] of NHSN_PATHOGENS) {
      const count = num(r[`totalconf${col}newadm`]);
      const rate = num(r[`totalconf${col}newadmper100k`]);
      const level = r[`totalconf${col}newadmper100klevel`];
      if (count != null) out.push(row(source, 'state', st.abbr, pathogen, 'admissions', count, null, week, fetchedAt));
      if (rate != null || level) {
        out.push(row(source, 'state', st.abbr, pathogen, 'admissions_per_100k', rate, level ? String(level).trim() : null, week, fetchedAt));
      }
    }
  }
  return out;
}

// --- NWSS WVAL (atcp-73re): per SITE rows —
// state_territory (name), counties_served (comma-separated county NAMES),
// site, source, site_wval, site_wval_category, week_end, pathogen_target.
// Non-commercial (WastewaterSCAN) rows are dropped first. A county's value is
// the median site's WVAL among the sites serving it, with that site's CDC
// category, so the label is always CDC's own wording.

const countyIndex = (() => {
  const byState = new Map();
  const norm = (s) =>
    String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/^saint\s/, 'st ')
      .replace(/\s+(county|parish|borough|census area|city and borough|municipality)$/, '')
      .trim();
  for (const [fips, name] of Object.entries(COUNTY_NAMES)) {
    const st = fips.slice(0, 2);
    if (!byState.has(st)) byState.set(st, new Map());
    const m = byState.get(st);
    const key = norm(name);
    if (!m.has(key)) m.set(key, fips);
  }
  return { byState, norm };
})();

/** County FIPS for a county name within a state, or null. */
export function countyFipsByName(stateFips, name) {
  const m = countyIndex.byState.get(stateFips);
  if (!m) return null;
  const key = countyIndex.norm(name);
  return m.get(key) || m.get(key.replace(/\s+city$/, '')) || null;
}

/** Upper bound for a plausible site WVAL; anything above is a data error. */
export const MAX_WVAL = 500;

export function normalizeNwssWval(rows, fetchedAt, { onUnmatched } = {}) {
  const eligible = excludeNonCommercial(rows, ['source']);
  // county|pathogen|week → [{ wval, category, site }]
  const groups = new Map();
  for (const r of eligible) {
    const st = resolveState(r.state_territory);
    const week = day(r.week_end);
    const pathogen = pathogenOf(r.pathogen_target);
    const wval = num(r.site_wval);
    // The published column carries absurd outliers (e.g. 2.6e21); a WVAL is a
    // small positive index, so anything outside a generous bound is dropped.
    if (!st || !week || !pathogen || wval == null || wval < 0 || wval > MAX_WVAL) continue;
    for (const name of String(r.counties_served || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      const fips = countyFipsByName(st.fips, name);
      if (!fips) {
        onUnmatched?.(`${st.abbr}:${name}`);
        continue;
      }
      const key = `${fips}|${pathogen}|${week}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ wval, category: r.site_wval_category, site: r.site });
    }
  }
  const out = [];
  for (const [key, sites] of groups) {
    const [fips, pathogen, week] = key.split('|');
    const uniq = [...new Map(sites.map((s) => [s.site, s])).values()].sort((a, b) => a.wval - b.wval);
    const mid = uniq[Math.floor((uniq.length - 1) / 2)];
    const method = wvalMethodVersion(week);
    out.push(row('nwss_wval', 'county', fips, pathogen, 'wval', mid.wval, mid.category ? String(mid.category).trim() : null, week, fetchedAt, method));
    out.push(row('nwss_wval', 'county', fips, pathogen, 'site_count', uniq.length, null, week, fetchedAt, method));
  }
  return out;
}

// --- NWSS flu A site samples (ymmh-divb), behind NWSS_SITE ---------------- //
// source (MUST drop 'WastewaterSCAN'), county_fips (may be a comma list),
// pcr_target ('fluav'), pcr_target_avg_conc, sample_collect_date.

/** Saturday ending the MMWR week (Sun–Sat) that contains `iso` (YYYY-MM-DD). */
export function weekEndingSaturday(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

export function normalizeNwssSite(rows, fetchedAt) {
  const eligible = excludeNonCommercial(rows, ['source']);
  const groups = new Map();
  for (const r of eligible) {
    if (String(r.pcr_target || '').toLowerCase() !== 'fluav') continue;
    const sampled = day(r.sample_collect_date);
    const conc = num(r.pcr_target_avg_conc);
    if (!sampled || conc == null) continue;
    const week = weekEndingSaturday(sampled);
    for (const fips of String(r.county_fips || '').split(',').map((s) => s.trim()).filter((s) => /^\d{5}$/.test(s))) {
      const key = `${fips}|${week}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(conc);
    }
  }
  const out = [];
  for (const [key, vals] of groups) {
    const [fips, week] = key.split('|');
    out.push(row('nwss_site', 'county', fips, 'influenza', 'flu_a_conc_median', median(vals), null, week, fetchedAt));
  }
  return out;
}

// --- Delphi fluview (ILINet), behind DELPHI_FLUVIEW ------------------------ //
// { epidata: [{ region: 'ca', epiweek: 202638, ili, wili, num_ili, num_patients, … }] }

/** MMWR epiweek (YYYYWW) → the Saturday that ends it. */
export function epiweekToSaturday(epiweek) {
  const s = String(epiweek);
  const year = Number(s.slice(0, 4));
  const week = Number(s.slice(4));
  if (!year || !week) return null;
  // MMWR week 1 is the first Sun–Sat week with at least four days in the year.
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dow = jan1.getUTCDay();
  const firstSunday = new Date(jan1);
  firstSunday.setUTCDate(1 - dow + (dow > 3 ? 7 : 0));
  const sat = new Date(firstSunday);
  sat.setUTCDate(firstSunday.getUTCDate() + (week - 1) * 7 + 6);
  return sat.toISOString().slice(0, 10);
}

export function normalizeDelphiFluview(payload, fetchedAt) {
  const out = [];
  for (const r of payload?.epidata || []) {
    const st = resolveState(r.region);
    const week = epiweekToSaturday(r.epiweek);
    const ili = num(r.ili);
    if (!st || !week || ili == null) continue;
    out.push(row('delphi_ili', 'state', st.abbr, 'ili', 'pct_ili', ili, null, week, fetchedAt));
  }
  return out;
}
