// ===========================================================================
// "Check your area": assemble the official-first payload for a location.
//
// Official data comes from KV documents written by the ingest Worker. If a
// state's document is missing (Worker not deployed yet, KV expired) the
// Function pulls that ONE state from CDC on demand — four small Socrata
// queries — writes D1 + KV, and serves it; if the document is merely old it is
// served at once and refreshed in the background. If CDC is unreachable, D1's
// last-good rows are used. Every source keeps its own week_ending and
// fetched_at all the way to the screen.
// ===========================================================================

import { computeModel } from '../scripts/model.js';
import { officialKey, OFFICIAL_TTL_SECONDS, SOURCES, ageDays, STALE_AFTER_DAYS } from './sources.js';
import { upsertOfficial, loadOfficialRows, docsFromRows } from './official-store.js';
import { runSource, socrataUrl, PULL_WEEKS } from '../../workers/ingest/src/pull.js';
import { normalizeNsspEd, normalizeNsspAri, normalizeNhsn, normalizeNwssWval } from '../../workers/ingest/src/normalize.js';
import { COUNTY_NAMES } from './county-names.js';
import { states } from '../scripts/states-data.js';
import { communitySummary, chooseBaseline, assertNoOutbreak, WINDOW_DAYS, BASELINE_DAYS } from './community.js';
import { utcDay } from './privacy.js';

/** Background refresh once a KV document is older than this. */
export const SOFT_TTL_HOURS = 12;

// --- Official documents ---------------------------------------------------- //

/** Socrata queries for one state, mirroring the Worker's national pull. */
export function stateSourceDefs(abbr, now = new Date()) {
  const st = states.find((s) => s.abbr === abbr);
  if (!st) return [];
  const since = new Date(now.getTime() - PULL_WEEKS * 7 * 86_400_000).toISOString().slice(0, 10);
  const name = st.name.replace(/'/g, "''");
  const nhsnCols = ['jurisdiction', 'weekendingdate', ...['flu', 'c19', 'rsv'].flatMap((p) => [`totalconf${p}newadm`, `totalconf${p}newadmper100k`, `totalconf${p}newadmper100klevel`])];
  return [
    {
      key: 'nssp_ed',
      url: socrataUrl('vutn-jzwm', { $select: 'week_end,geography,pathogen,percent_visits', $where: `week_end >= '${since}T00:00:00.000' AND geography = '${name}'`, $limit: 500 }),
      normalize: normalizeNsspEd,
      minGeos: 1,
    },
    {
      key: 'nssp_ari',
      url: socrataUrl('f3zz-zga5', { $select: 'week_end,geography,label', $where: `geography = '${name}'`, $limit: 50 }),
      normalize: normalizeNsspAri,
      minGeos: 1,
    },
    {
      key: 'nhsn_levels',
      url: socrataUrl('vdzy-6i9v', { $select: nhsnCols.join(','), $where: `weekendingdate >= '${since}' AND jurisdiction = '${abbr}'`, $limit: 50 }),
      normalize: (rows, at) => normalizeNhsn(rows, at, 'nhsn_levels'),
      minGeos: 1,
    },
    {
      key: 'nwss_wval',
      url: socrataUrl('atcp-73re', {
        $select: 'state_territory,counties_served,site,source,site_wval,site_wval_category,week_end,pathogen_target',
        $where: `week_end >= '${since}' AND state_territory = '${name}'`,
        $limit: 20000,
      }),
      normalize: normalizeNwssWval,
      minGeos: 1,
    },
  ];
}

const countiesOf = (abbr) => {
  const st = states.find((s) => s.abbr === abbr);
  return st ? Object.keys(COUNTY_NAMES).filter((f) => f.startsWith(st.fips)) : [];
};

/** Pull one state from CDC, store it, and return its documents. Never throws. */
export async function refreshState(env, abbr, { fetchImpl = fetch, now = new Date() } = {}) {
  const kv = env.OFFICIAL_CACHE;
  const lockKey = `pull-lock:${abbr}`;
  let locked = false;
  try {
    if (kv && (await kv.get(lockKey))) return null; // someone else is already pulling it
    if (kv) {
      await kv.put(lockKey, '1', { expirationTtl: 60 });
      locked = true;
    }
    const results = await Promise.all(stateSourceDefs(abbr, now).map((d) => runSource(d, { env, fetchImpl, now, timeoutMs: 8000 })));
    const rows = results.filter((r) => r.ok).flatMap((r) => r.rows);
    let docs;
    if (env.DB) {
      if (rows.length) await upsertOfficial(env.DB, rows);
      docs = docsFromRows(await loadOfficialRows(env.DB, [abbr, ...countiesOf(abbr)], now), now);
    } else {
      docs = docsFromRows(rows, now);
    }
    if (kv) {
      for (const [key, doc] of docs) {
        const [level, id] = key.split(':');
        await kv.put(officialKey(level, id), JSON.stringify(doc), { expirationTtl: OFFICIAL_TTL_SECONDS });
      }
    }
    return docs;
  } catch (e) {
    return null;
  } finally {
    // Only the request that took the lock releases it.
    if (locked) await kv.delete(lockKey).catch(() => {});
  }
}

/**
 * Official documents for a state and (optionally) a county.
 * @returns {Promise<{ state: object|null, county: object|null }>}
 */
export async function getOfficialDocs(env, { state, county }, { ctx, fetchImpl = fetch, now = new Date() } = {}) {
  const kv = env.OFFICIAL_CACHE;
  const stateKey = officialKey('state', state);
  const countyKey = county ? officialKey('county', county) : null;
  let stateDoc = null;
  let countyDoc = null;
  if (kv) {
    [stateDoc, countyDoc] = await Promise.all([kv.get(stateKey, 'json'), countyKey ? kv.get(countyKey, 'json') : null]);
  }

  if (!stateDoc) {
    const docs = await refreshState(env, state, { fetchImpl, now });
    if (docs) {
      stateDoc = docs.get(`state:${state}`) || null;
      countyDoc = county ? docs.get(`county:${county}`) || countyDoc : null;
    }
  } else if (ageHours(stateDoc.updated_at, now) > SOFT_TTL_HOURS && ctx?.waitUntil) {
    ctx.waitUntil(refreshState(env, state, { fetchImpl, now }));
  }

  // Last resort: whatever D1 still holds.
  if ((!stateDoc || (county && !countyDoc)) && env.DB) {
    try {
      const docs = docsFromRows(await loadOfficialRows(env.DB, [state, county], now), now);
      stateDoc = stateDoc || docs.get(`state:${state}`) || null;
      if (county) countyDoc = countyDoc || docs.get(`county:${county}`) || null;
    } catch (e) {
      /* D1 unavailable: serve what we have */
    }
  }
  return { state: stateDoc, county: countyDoc };
}

function ageHours(iso, now) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? (now.getTime() - t) / 3_600_000 : Infinity;
}

// --- FluTrack's own level, from the snapshot the site shipped -------------- //

export async function stateLevel(env, request, abbr) {
  try {
    if (!env.ASSETS) return null;
    const res = await env.ASSETS.fetch(new Request(new URL('/data/snapshot.json', request.url)));
    if (!res.ok) return null;
    const snap = await res.json();
    const signals = snap.states?.[abbr];
    if (!signals) return null;
    const model = computeModel(signals);
    return {
      level: model.level,
      label: model.label,
      trend: model.trend?.direction || null,
      week_ending: signals.weekEnding || snap.weekEnding || null,
      kind: snap.kind,
    };
  } catch (e) {
    return null;
  }
}

// --- Community ------------------------------------------------------------ //

const daysBefore = (now, n) => utcDay(new Date(now.getTime() - n * 86_400_000));

/** Sum aggregate rows for a county or state over [from, to). */
async function sumAggregates(db, { county, state }, from, to) {
  const where = county ? 'county_fips = ?' : 'state = ?';
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(n),0) AS n, COALESCE(SUM(n_ili),0) AS n_ili, COALESCE(SUM(n_pos_flu),0) AS n_pos_flu, COALESCE(SUM(n_pos_covid),0) AS n_pos_covid
       FROM report_aggregates_daily WHERE ${where} AND day >= ? AND day < ?`
    )
    .bind(county || state, from, to)
    .first();
  return row || { n: 0, n_ili: 0, n_pos_flu: 0, n_pos_covid: 0 };
}

export async function getCommunity(env, location, now = new Date()) {
  const area = location.county_name || location.state_name || 'your area';
  if (!env.DB || !location.county_fips) return assertNoOutbreak(communitySummary({ n: 0 }, null, area));
  try {
    const windowStart = daysBefore(now, WINDOW_DAYS);
    const baseStart = daysBefore(now, WINDOW_DAYS + BASELINE_DAYS);
    const tomorrow = daysBefore(now, -1);
    const [current, countyBase, stateBase] = await Promise.all([
      sumAggregates(env.DB, { county: location.county_fips }, windowStart, tomorrow),
      sumAggregates(env.DB, { county: location.county_fips }, baseStart, windowStart),
      sumAggregates(env.DB, { state: location.state }, baseStart, windowStart),
    ]);
    return assertNoOutbreak(communitySummary(current, chooseBaseline(countyBase, stateBase), area));
  } catch (e) {
    return assertNoOutbreak(communitySummary({ n: 0 }, null, area));
  }
}

/** Trailing daily mean of reports for a county (for write-time burst checks). */
export async function countyDailyMean(env, countyFips, now = new Date()) {
  if (!env.DB || !countyFips) return 0;
  try {
    const s = await sumAggregates(env.DB, { county: countyFips }, daysBefore(now, BASELINE_DAYS), utcDay(now));
    return s.n / BASELINE_DAYS;
  } catch (e) {
    return 0;
  }
}

// --- Payload --------------------------------------------------------------- //

const reading = (entry, pathogen, metric) => entry?.readings?.find((r) => r.pathogen === pathogen && r.metric === metric) || null;

function chip(entry, now) {
  if (!entry) return null;
  const age = ageDays(entry.week_ending, now);
  return {
    source: entry.source,
    system: entry.system,
    short: SOURCES[entry.source]?.short || entry.system,
    label: entry.label,
    dataset: entry.dataset,
    week_ending: entry.week_ending,
    fetched_at: entry.fetched_at,
    age_days: age,
    stale: age != null && age > STALE_AFTER_DAYS,
  };
}

/** Pure: build the documented /api/area payload. */
export function buildAreaPayload({ location, level, stateDoc, countyDoc, community, now = new Date() }) {
  const s = stateDoc?.sources || {};
  const c = countyDoc?.sources || {};

  const nhsn = s.nhsn_levels;
  const fluRate = reading(nhsn, 'influenza', 'admissions_per_100k');
  const fluCount = reading(nhsn, 'influenza', 'admissions');
  const wval = c.nwss_wval;
  const fluWval = reading(wval, 'influenza', 'wval');
  const sites = reading(wval, 'influenza', 'site_count');
  const ari = reading(s.nssp_ari, 'ari', 'activity_level');
  const edFlu = reading(s.nssp_ed, 'influenza', 'pct_ed_visits');

  const highlights = {
    nhsn_flu: nhsn && (fluRate || fluCount)
      ? {
          level_label: fluRate?.level_label || null,
          rate_per_100k: fluRate?.value ?? null,
          admissions: fluCount?.value ?? null,
          series: (nhsn.series?.['influenza:admissions_per_100k'] || []).slice(-4),
          ...chip(nhsn, now),
        }
      : null,
    wastewater_flu: fluWval
      ? {
          value: fluWval.value,
          level_label: fluWval.level_label,
          sites: sites?.value ?? null,
          method_version: wval.method_version,
          ...chip(wval, now),
        }
      : null,
    ari: ari ? { level_label: ari.level_label, ...chip(s.nssp_ari, now) } : null,
    ed_flu: edFlu ? { pct: edFlu.value, ...chip(s.nssp_ed, now) } : null,
  };

  const official = {};
  for (const [key, entry] of Object.entries({ ...s, ...c })) {
    official[key] = { ...chip(entry, now), readings: entry.readings, method_version: entry.method_version };
  }

  const sources = Object.values(official)
    .filter((o) => SOURCES[o.source] && !SOURCES[o.source].flag)
    .map(({ readings, ...rest }) => rest);

  return {
    location: {
      state: location.state,
      state_name: location.state_name,
      county_fips: location.county_fips,
      county_name: location.county_name,
      source: location.source,
    },
    level,
    official,
    highlights,
    community,
    meaning: meaningLine({ location, level, highlights }),
    sources,
    generated_at: now.toISOString(),
  };
}

/**
 * One rule-based sentence. Describes the data; never advises, never
 * diagnoses, never mentions community reports (they cannot move the level).
 */
export function meaningLine({ location, level, highlights }) {
  const where = location.state_name || location.state;
  const parts = [];
  if (level && Number.isFinite(level.level)) {
    parts.push(`Respiratory illness activity in ${where} is ${level.label.toLowerCase()} by this week's CDC data`);
  } else {
    parts.push(`This week's CDC data for ${where} is shown below`);
  }
  const hosp = highlights.nhsn_flu?.level_label;
  if (hosp && hosp !== 'Data Unavailable') parts.push(`flu hospital admissions are ${hosp.toLowerCase()}`);
  const ww = highlights.wastewater_flu;
  if (ww && !ww.stale && ww.level_label) {
    parts.push(`wastewater shows ${ww.level_label.toLowerCase()} flu A activity in ${location.county_name || 'your county'}`);
  }
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.` : `${parts[0]}.`;
}

/** Everything /api/area and /api/report return for a resolved location. */
export async function assembleArea(context, location, now = new Date()) {
  const { env, request } = context;
  const [docs, community, level] = await Promise.all([
    getOfficialDocs(env, { state: location.state, county: location.county_fips }, { ctx: context, now }),
    getCommunity(env, location, now),
    stateLevel(env, request, location.state),
  ]);
  return buildAreaPayload({ location, level, stateDoc: docs.state, countyDoc: docs.county, community, now });
}
