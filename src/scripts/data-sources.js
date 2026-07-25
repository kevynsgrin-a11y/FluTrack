// ===========================================================================
// FluTrack — Data sources
//
// Two-tier strategy, chosen for reliability against a third-party government
// API we do not control:
//
//   1. Bundled snapshot (/data/snapshot.json) — ships with the site. Guarantees
//      an instant first paint and a fully functional experience even offline or
//      if the CDC feed is unreachable. Clearly labeled as illustrative sample
//      data in the UI until a live refresh succeeds.
//
//   2. Live refresh (progressive enhancement) — on load we query the CDC's
//      public-domain Socrata (SODA) endpoints directly from the browser. On
//      success we replace the snapshot and flip the provenance badge to "Live".
//
// COMPLIANCE — WastewaterSCAN exclusion:
//   WastewaterSCAN data is licensed CC BY-NC 4.0 (non-commercial) and must not
//   be used by a monetized site. We ingest ONLY the CDC's own public-domain
//   NWSS product and additionally run a defensive filter that drops any row
//   whose provenance fields reference SCAN / WastewaterSCAN / Verily. See
//   excludeNonCommercial().
// ===========================================================================

import { stateByAbbr, states } from './states-data.js';
import { labelToLevel } from './threat-index.js';

const SOCRATA_BASE = 'https://data.cdc.gov/resource';

// How much history the live query asks for. The threat model only ever looks at
// the latest value and the prior three weeks, so a ~4-month window is generous
// while keeping the response small enough to parse on a phone.
const HISTORY_DAYS = 120;

/**
 * Dataset registry. `fields` lists candidate Socrata column names in priority
 * order — the adapter uses the first one present on a row, so the site tolerates
 * minor upstream schema drift. Resource IDs are the public dataset identifiers.
 */
export const DATASETS = Object.freeze({
  // NSSP Emergency Department visits (% of ED visits), by state. Primary signal.
  edVisits: {
    id: 'vutn-jzwm',
    label: 'NSSP Emergency Department Visits',
    license: 'Public Domain (U.S. Government)',
    fields: {
      week: ['week_end', 'week_end_date', 'weekenddate', 'date'],
      geography: ['geography', 'state', 'geography_name'],
      combined: ['percent_visits_combined', 'percent_combined'],
      influenza: ['percent_visits_influenza', 'percent_influenza'],
      covid: ['percent_visits_covid', 'percent_covid'],
      rsv: ['percent_visits_rsv', 'percent_rsv'],
    },
  },
  // NSSP Acute Respiratory Illness activity level, by state. Categorical.
  ari: {
    id: 'f3zz-zga5',
    label: 'Acute Respiratory Illness (ARI) Activity Level',
    license: 'Public Domain (U.S. Government)',
    fields: {
      week: ['week_end', 'week_ending', 'weekend', 'date'],
      geography: ['geography', 'state', 'geography_name'],
      levelLabel: ['activity_level_label', 'ari_activity_level', 'activity_level'],
    },
  },
  // CDC NWSS Wastewater Viral Activity Level (WVAL). Public domain.
  wastewater: {
    id: 'atcp-73re',
    label: 'NWSS Wastewater Viral Activity Level',
    license: 'Public Domain (U.S. Government)',
    fields: {
      week: ['date_period', 'week_ending', 'reference_date', 'date'],
      geography: ['state', 'wwtp_jurisdiction', 'geography'],
      pathogen: ['pathogen', 'pathogen_name'],
      wval: ['wval', 'wva_level', 'activity_level', 'value'],
      // provenance fields used to enforce the non-commercial exclusion.
      provenance: ['data_source', 'source', 'reporting_source', 'provider', 'network'],
    },
  },
});

/** Regex identifying non-commercial (CC BY-NC 4.0) wastewater sources to exclude. */
const NONCOMMERCIAL_SOURCE = /scan|wastewaterscan|verily|stanford|emory/i;

/** Return the first present, non-empty field value from a row given candidates. */
function pickField(row, candidates) {
  for (const key of candidates) {
    if (row[key] != null && row[key] !== '') return row[key];
  }
  return undefined;
}

/**
 * Drop any wastewater row that originates from a non-commercially-licensed
 * network (WastewaterSCAN / SCAN / Verily). The CDC NWSS WVAL product is CDC's
 * own aggregation, but we filter defensively so the pipeline can never surface
 * CC BY-NC 4.0 data on a monetized page.
 */
export function excludeNonCommercial(rows, provenanceFields) {
  return rows.filter((row) => {
    const src = pickField(row, provenanceFields);
    return !(src && NONCOMMERCIAL_SOURCE.test(String(src)));
  });
}

/**
 * Coerce a Socrata field to a number.
 *
 * Deliberately stricter than Number(): a whitespace-only field must not become
 * a real 0 (Number(' ') === 0), and booleans/arrays must not coerce either —
 * a spurious 0 drags a state's score down and can flip its headline level.
 * CDC suppression markers ('<1', 'suppressed') correctly yield NaN.
 */
const numeric = (v) => {
  if (v == null || typeof v === 'boolean' || Array.isArray(v)) return NaN;
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/** ISO date (YYYY-MM-DD) for `days` ago, used to bound the live query. */
function sinceDate(days = HISTORY_DAYS) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Build a Socrata SoQL query URL. */
function socrataUrl(id, params) {
  const qs = new URLSearchParams(params).toString();
  return `${SOCRATA_BASE}/${id}.json?${qs}`;
}

/**
 * Standard query params for a live dataset pull: a bounded date window plus a
 * ceiling on rows. Without the window these endpoints return the entire
 * national multi-year history (tens of MB) on every page load.
 */
function windowedQuery(ds, limit) {
  const weekField = ds.fields.week[0];
  return {
    $where: `${weekField} >= '${sinceDate()}T00:00:00'`,
    $order: `${weekField} DESC`,
    $limit: limit,
  };
}

async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// --- Per-dataset live adapters -------------------------------------------- //

async function fetchEdVisits(signal) {
  const ds = DATASETS.edVisits;
  const rows = await fetchJson(socrataUrl(ds.id, windowedQuery(ds, 10000)), { signal });
  const byState = new Map();
  for (const row of rows) {
    const geo = pickField(row, ds.fields.geography);
    const st = resolveState(geo);
    if (!st) continue;
    const week = String(pickField(row, ds.fields.week) || '').slice(0, 10);
    const rec = {
      week,
      combined: numeric(pickField(row, ds.fields.combined)),
      influenza: numeric(pickField(row, ds.fields.influenza)),
      covid: numeric(pickField(row, ds.fields.covid)),
      rsv: numeric(pickField(row, ds.fields.rsv)),
    };
    if (!byState.has(st.abbr)) byState.set(st.abbr, []);
    byState.get(st.abbr).push(rec);
  }
  return byState;
}

async function fetchAri(signal) {
  const ds = DATASETS.ari;
  const rows = await fetchJson(socrataUrl(ds.id, windowedQuery(ds, 5000)), { signal });
  const byState = new Map();
  for (const row of rows) {
    const st = resolveState(pickField(row, ds.fields.geography));
    if (!st) continue;
    const week = String(pickField(row, ds.fields.week) || '').slice(0, 10);
    const label = pickField(row, ds.fields.levelLabel);
    if (!byState.has(st.abbr)) byState.set(st.abbr, []);
    byState.get(st.abbr).push({ week, label });
  }
  return byState;
}

async function fetchWastewater(signal) {
  const ds = DATASETS.wastewater;
  let rows = await fetchJson(socrataUrl(ds.id, windowedQuery(ds, 30000)), { signal });
  rows = excludeNonCommercial(rows, ds.fields.provenance);
  const byState = new Map();
  for (const row of rows) {
    const st = resolveState(pickField(row, ds.fields.geography));
    if (!st) continue;
    const week = String(pickField(row, ds.fields.week) || '').slice(0, 10);
    const pathogen = normalizePathogen(pickField(row, ds.fields.pathogen));
    const wval = numeric(pickField(row, ds.fields.wval));
    if (!byState.has(st.abbr)) byState.set(st.abbr, []);
    byState.get(st.abbr).push({ week, pathogen, wval });
  }
  return byState;
}

function normalizePathogen(raw) {
  const s = String(raw || '').toLowerCase();
  if (/flu|influenza/.test(s)) return 'influenza';
  if (/cov|sars/.test(s)) return 'covid';
  if (/rsv|syncytial/.test(s)) return 'rsv';
  return 'combined';
}

// Lookup tables built once. resolveState() runs per row — a linear scan over 51
// states with two toLowerCase() allocations per comparison was the dominant
// post-fetch cost on large responses.
const BY_LOWER_NAME = new Map(states.map((s) => [s.name.toLowerCase(), s]));
const BY_LOWER_ABBR = new Map(states.map((s) => [s.abbr.toLowerCase(), s]));

/** Resolve a Socrata geography string to a state record. */
function resolveState(geo) {
  if (!geo) return null;
  const g = String(geo).trim().toLowerCase();
  if (!g) return null;
  return BY_LOWER_ABBR.get(g) || BY_LOWER_NAME.get(g) || null;
}

/**
 * Fetch and assemble live per-state signals from CDC Socrata endpoints.
 * Individual datasets may fail independently; as long as at least ED visits (or
 * any single source) resolves, a live model can be built. Returns
 * { signalsByAbbr: Map, weekEnding, sources: [...] } or throws if everything fails.
 */
export async function fetchLiveSignals({ timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;

  const settled = await Promise.allSettled([
    fetchEdVisits(signal),
    fetchAri(signal),
    fetchWastewater(signal),
  ]);
  clearTimeout(timer);

  const [ed, ari, ww] = settled.map((r) => (r.status === 'fulfilled' ? r.value : new Map()));
  const sources = [];
  if (settled[0].status === 'fulfilled') sources.push(DATASETS.edVisits.label);
  if (settled[1].status === 'fulfilled') sources.push(DATASETS.ari.label);
  if (settled[2].status === 'fulfilled') sources.push(DATASETS.wastewater.label);

  if (!sources.length) throw new Error('All CDC live sources failed to load');

  const signalsByAbbr = new Map();
  let latestWeek = '';

  for (const st of states) {
    const edRows = sortByWeek(ed.get(st.abbr) || []);
    const ariRows = sortByWeek(ari.get(st.abbr) || []);
    const wwRows = sortByWeek(ww.get(st.abbr) || []);

    // NSSP publishes by state and sub-state region, so collapse to one value per
    // week before the trend model treats consecutive entries as consecutive weeks.
    const edCombinedSeries = collapseWeeklyMean(edRows, 'combined');
    // State wastewater signal = the weekly PEAK viral activity across pathogens
    // (collapseWeeklyMax already keeps only finite WVAL rows and takes the max).
    const wastewaterSeries = collapseWeeklyMax(wwRows);

    const week = edRows.at(-1)?.week || ariRows.at(-1)?.week || wwRows.at(-1)?.week || '';
    if (week > latestWeek) latestWeek = week;

    signalsByAbbr.set(st.abbr, {
      ariLevel: ariRows.length ? labelToLevel(ariRows.at(-1).label) : null,
      edCombinedSeries,
      wastewaterSeries,
      positivityCombined: null,
      weekEnding: week,
      pathogens: {
        influenza: pathogenSeries('influenza', edRows, wwRows),
        covid: pathogenSeries('covid', edRows, wwRows),
        rsv: pathogenSeries('rsv', edRows, wwRows),
      },
    });
  }

  // How many states the live pull actually produced usable signals for. The
  // caller uses this to decide whether the refresh may be labeled "live" —
  // an HTTP 200 carrying zero usable rows must not badge sample data as CDC data.
  let statesWithData = 0;
  for (const sig of signalsByAbbr.values()) if (hasSignalData(sig)) statesWithData += 1;

  return { signalsByAbbr, weekEnding: latestWeek, sources, statesWithData };
}

/** True when a signal bundle carries at least one usable series/level. */
export function hasSignalData(sig) {
  if (!sig) return false;
  return (
    (sig.edCombinedSeries && sig.edCombinedSeries.length > 0) ||
    (sig.wastewaterSeries && sig.wastewaterSeries.length > 0) ||
    Number.isFinite(sig.ariLevel)
  );
}

function pathogenSeries(pathogen, edRows, wwRows) {
  return {
    edPercentSeries: collapseWeeklyMean(edRows, pathogen),
    wastewaterSeries: collapseWeeklyMax(wwRows.filter((r) => r.pathogen === pathogen)),
    positivitySeries: [],
  };
}

/** ISO week strings sort correctly as plain strings; localeCompare is both
 *  locale-dependent and far slower over large row arrays. */
function byWeekAsc(a, b) {
  return a.week < b.week ? -1 : a.week > b.week ? 1 : 0;
}

function sortByWeek(rows) {
  return [...rows].map((r) => ({ ...r, week: String(r.week) })).sort(byWeekAsc);
}

/** Collapse multiple rows per week (e.g. many sewersheds) into one weekly max. */
function collapseWeeklyMax(rows) {
  const byWeek = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.wval)) continue;
    const cur = byWeek.get(r.week);
    if (cur == null || r.wval > cur) byWeek.set(r.week, r.wval);
  }
  return [...byWeek.keys()]
    .sort()
    .map((w) => byWeek.get(w));
}

/**
 * Collapse multiple rows per week into one weekly mean for a numeric field.
 *
 * NSSP publishes ED data by state AND by sub-state region, so a state-week can
 * carry several rows. Without collapsing, computeTrend() compares the latest
 * row against three sibling rows *from the same week* and reports geographic
 * variance as a time trend.
 */
function collapseWeeklyMean(rows, field) {
  const byWeek = new Map();
  for (const r of rows) {
    const v = r[field];
    if (!Number.isFinite(v)) continue;
    const cur = byWeek.get(r.week) || { sum: 0, n: 0 };
    cur.sum += v;
    cur.n += 1;
    byWeek.set(r.week, cur);
  }
  return [...byWeek.keys()]
    .sort()
    .map((w) => {
      const { sum, n } = byWeek.get(w);
      return sum / n;
    });
}

/** Load the bundled snapshot (illustrative sample data). */
export async function loadSnapshot(basePath = '', { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${basePath}/data/snapshot.json`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Failed to load snapshot: HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
