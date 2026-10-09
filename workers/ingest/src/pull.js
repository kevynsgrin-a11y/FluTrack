// ===========================================================================
// Official pulls: one entry per source, each fetched, normalized and gated
// independently. A source that fails, times out, or returns too little to be
// a real weekly release contributes NOTHING — so it can never overwrite the
// last good data in D1.
// ===========================================================================

import {
  normalizeNsspEd,
  normalizeNsspAri,
  normalizeNhsn,
  normalizeNwssWval,
  normalizeNwssSite,
  normalizeDelphiFluview,
} from './normalize.js';
import { states } from '../../../src/scripts/states-data.js';

export const SOCRATA = 'https://data.cdc.gov/resource';
export const DELPHI = 'https://api.delphi.cmu.edu/epidata/fluview/';
export const PULL_WEEKS = 7;

const isoDay = (d) => d.toISOString().slice(0, 10);
const sinceDay = (now, weeks = PULL_WEEKS) => isoDay(new Date(now.getTime() - weeks * 7 * 86_400_000));

export function socrataUrl(id, params) {
  return `${SOCRATA}/${id}.json?${new URLSearchParams(params).toString()}`;
}

const NHSN_COLS = ['jurisdiction', 'weekendingdate', ...['flu', 'c19', 'rsv'].flatMap((p) => [`totalconf${p}newadm`, `totalconf${p}newadmper100k`])];

/**
 * Source definitions. `minRows` / `minGeos` gate a pull: fewer than that and
 * the pull is treated as failed (CDC mid-publish, an empty mirror, a schema
 * change that parses to nothing).
 */
export function sourceDefs(now = new Date(), env = {}) {
  const since = sinceDay(now);
  const sinceTs = `${since}T00:00:00.000`;
  const defs = [
    {
      key: 'nssp_ed',
      url: socrataUrl('vutn-jzwm', {
        $select: 'week_end,geography,pathogen,percent_visits',
        $where: `week_end >= '${sinceTs}'`,
        $order: 'week_end DESC',
        $limit: 5000,
      }),
      normalize: (rows, at) => normalizeNsspEd(rows, at),
      minGeos: 40,
    },
    {
      key: 'nssp_ari',
      url: socrataUrl('f3zz-zga5', { $select: 'week_end,geography,label', $limit: 500 }),
      normalize: (rows, at) => normalizeNsspAri(rows, at),
      minGeos: 25,
    },
    {
      key: 'nhsn_levels',
      url: socrataUrl('vdzy-6i9v', {
        $select: `${NHSN_COLS.join(',')},totalconfflunewadmper100klevel,totalconfc19newadmper100klevel,totalconfrsvnewadmper100klevel`,
        $where: `weekendingdate >= '${since}'`,
        $order: 'weekendingdate DESC',
        $limit: 5000,
      }),
      normalize: (rows, at) => normalizeNhsn(rows, at, 'nhsn_levels'),
      minGeos: 40,
    },
    {
      key: 'nhsn_hrd',
      url: socrataUrl('ua7e-t2fy', {
        $select: NHSN_COLS.join(','),
        $where: `weekendingdate >= '${sinceTs}'`,
        $order: 'weekendingdate DESC',
        $limit: 5000,
      }),
      normalize: (rows, at) => normalizeNhsn(rows, at, 'nhsn_hrd'),
      minGeos: 40,
    },
    {
      key: 'nhsn_hrd_prelim',
      url: socrataUrl('mpgq-jmmr', {
        $select: NHSN_COLS.join(','),
        $where: `weekendingdate >= '${sinceTs}'`,
        $order: 'weekendingdate DESC',
        $limit: 5000,
      }),
      normalize: (rows, at) => normalizeNhsn(rows, at, 'nhsn_hrd_prelim'),
      minGeos: 40,
    },
    {
      key: 'nwss_wval',
      url: socrataUrl('atcp-73re', {
        $select: 'state_territory,counties_served,site,source,site_wval,site_wval_category,week_end,pathogen_target',
        $where: `week_end >= '${since}'`,
        $order: 'week_end DESC',
        $limit: 100000,
      }),
      normalize: (rows, at) => normalizeNwssWval(rows, at),
      minGeos: 100,
    },
  ];
  if (flagOn(env.NWSS_SITE)) {
    defs.push({
      key: 'nwss_site',
      url: socrataUrl('ymmh-divb', {
        $select: 'source,county_fips,pcr_target,pcr_target_avg_conc,sample_collect_date',
        $where: `sample_collect_date >= '${since}' AND pcr_target = 'fluav'`,
        $order: 'sample_collect_date DESC',
        $limit: 100000,
      }),
      normalize: (rows, at) => normalizeNwssSite(rows, at),
      minGeos: 50,
    });
  }
  if (flagOn(env.DELPHI_FLUVIEW)) {
    const regions = states.map((s) => s.abbr.toLowerCase()).join(',');
    const params = new URLSearchParams({ regions, epiweeks: `${epiweek(new Date(now.getTime() - 6 * 7 * 86_400_000))}-${epiweek(now)}` });
    if (env.DELPHI_API_KEY) params.set('api_key', env.DELPHI_API_KEY);
    defs.push({
      key: 'delphi_ili',
      url: `${DELPHI}?${params}`,
      delphi: true,
      normalize: (payload, at) => normalizeDelphiFluview(payload, at),
      minGeos: 25,
    });
  }
  return defs;
}

export function flagOn(v) {
  return String(v ?? '').toLowerCase() === 'true';
}

/** MMWR epiweek (YYYYWW) containing a date. */
export function epiweek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const sat = new Date(d);
  sat.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()));
  // A week belongs to the MMWR year holding at least four of its days, which
  // is always the year of its Wednesday.
  const wed = new Date(sat);
  wed.setUTCDate(sat.getUTCDate() - 3);
  const year = wed.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dow = jan1.getUTCDay();
  const firstSunday = new Date(jan1);
  firstSunday.setUTCDate(1 - dow + (dow > 3 ? 7 : 0));
  const week = Math.floor((sat - firstSunday) / (7 * 86_400_000)) + 1;
  return `${year}${String(week).padStart(2, '0')}`;
}

/**
 * Run one source. Never throws: returns { key, ok, rows, geos, reason }.
 * `fetchImpl` is injectable for tests.
 */
export async function runSource(def, { env = {}, fetchImpl = fetch, now = new Date(), timeoutMs = 45_000 } = {}) {
  const fetchedAt = now.toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json', 'User-Agent': 'flutrack-ingest (+https://flufollower.com/data-sources/)' };
    if (!def.delphi && env.SODA_APP_TOKEN) headers['X-App-Token'] = env.SODA_APP_TOKEN;
    const res = await fetchImpl(def.url, { headers, signal: controller.signal });
    if (!res.ok) return { key: def.key, ok: false, rows: [], geos: 0, reason: `HTTP ${res.status}` };
    const payload = await res.json();
    if (def.delphi) {
      if (payload?.result !== 1) return { key: def.key, ok: false, rows: [], geos: 0, reason: `delphi: ${payload?.message || 'no result'}` };
    } else if (!Array.isArray(payload)) {
      return { key: def.key, ok: false, rows: [], geos: 0, reason: 'not a row array' };
    }
    const rows = def.normalize(payload, fetchedAt);
    const geos = new Set(rows.map((r) => r.geo_id)).size;
    if (geos < (def.minGeos || 1)) {
      return { key: def.key, ok: false, rows: [], geos, reason: `only ${geos} geographies (minimum ${def.minGeos})` };
    }
    return { key: def.key, ok: true, rows, geos, reason: `${rows.length} rows, ${geos} geographies` };
  } catch (e) {
    return { key: def.key, ok: false, rows: [], geos: 0, reason: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}
