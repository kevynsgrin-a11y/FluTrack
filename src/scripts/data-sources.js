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

const SOCRATA_BASE = 'https://data.cdc.gov/resource';

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

const numeric = (v) => {
  if (v == null || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** Build a Socrata SoQL query URL. */
function socrataUrl(id, params) {
  const qs = new URLSearchParams(params).toString();
  return `${SOCRATA_BASE}/${id}.json?${qs}`;
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
  const rows = await fetchJson(
    socrataUrl(ds.id, { $limit: 60000, $order: `${ds.fields.week[0]} DESC` }),
    { signal }
  );
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
  const rows = await fetchJson(
    socrataUrl(ds.id, { $limit: 20000, $order: `${ds.fields.week[0]} DESC` }),
    { signal }
  );
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
  let rows = await fetchJson(
    socrataUrl(ds.id, { $limit: 60000, $order: `${ds.fields.week[0]} DESC` }),
    { signal }
  );
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

/** Resolve a Socrata geography string to a state record. */
function resolveState(geo) {
  if (!geo) return null;
  const g = String(geo).trim();
  if (g.length === 2) return stateByAbbr(g);
  return states.find((s) => s.name.toLowerCase() === g.toLowerCase()) || stateByAbbr(g);
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

    const edCombinedSeries = edRows.map((r) => r.combined).filter(Number.isFinite);
    const wwCombined = wwRows.filter((r) => r.pathogen === 'combined' || Number.isFinite(r.wval));
    const wastewaterSeries = collapseWeeklyMax(wwCombined);

    const week = edRows.at(-1)?.week || ariRows.at(-1)?.week || wwRows.at(-1)?.week || '';
    if (week > latestWeek) latestWeek = week;

    signalsByAbbr.set(st.abbr, {
      ariLevel: ariRows.length ? labelFromRow(ariRows.at(-1)) : null,
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

  return { signalsByAbbr, weekEnding: latestWeek, sources };
}

function labelFromRow(row) {
  // Deferred import avoids a cycle; labelToLevel is pure.
  const map = { 'very low': 0, minimal: 0, low: 1, moderate: 2, medium: 2, high: 3, 'very high': 4 };
  const key = String(row.label || '').trim().toLowerCase();
  if (key in map) return map[key];
  const n = Number(row.label);
  return Number.isFinite(n) ? Math.max(0, Math.min(4, Math.round((n / 13) * 4))) : null;
}

function pathogenSeries(pathogen, edRows, wwRows) {
  return {
    edPercentSeries: edRows.map((r) => r[pathogen]).filter(Number.isFinite),
    wastewaterSeries: collapseWeeklyMax(wwRows.filter((r) => r.pathogen === pathogen)),
    positivitySeries: [],
  };
}

function sortByWeek(rows) {
  return [...rows].sort((a, b) => String(a.week).localeCompare(String(b.week)));
}

/** Collapse multiple rows per week (e.g. many sewersheds) into one weekly max. */
function collapseWeeklyMax(rows) {
  const byWeek = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.wval)) continue;
    const cur = byWeek.get(r.week);
    if (cur == null || r.wval > cur) byWeek.set(r.week, r.wval);
  }
  return [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

/** Load the bundled snapshot (illustrative sample data). */
export async function loadSnapshot(basePath = '') {
  const res = await fetch(`${basePath}/data/snapshot.json`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load snapshot: HTTP ${res.status}`);
  return res.json();
}
