// ===========================================================================
// FluTrack — Data sources
//
// Three tiers, chosen for reliability against a third-party government API we
// do not control:
//
//   1. Build-time pre-render — the static build calls fetchLiveSignals() below
//      and bakes real CDC data into every page and into /data/snapshot.json
//      (kind: 'live'). This is what a first paint, a crawler and an offline
//      visitor see. See build/lib/live-snapshot.mjs.
//
//   2. Bundled sample fallback — if the feed is unreachable at build time the
//      site ships the deterministic sample snapshot instead (kind: 'sample'),
//      clearly labeled as illustrative sample data in the UI.
//
//   3. Browser refresh (progressive enhancement) — the same fetchLiveSignals()
//      runs in the browser when the shipped snapshot is sample data or a newer
//      CDC week should exist, and replaces what is on screen.
//
// COMPLIANCE — WastewaterSCAN exclusion:
//   WastewaterSCAN data is licensed CC BY-NC 4.0 (non-commercial) and must not
//   be used by a monetized site. CDC's NWSS dataset carries those sites
//   alongside public-health-department sites, so every wastewater row passes a
//   defensive filter that drops any row whose provenance fields reference
//   SCAN / WastewaterSCAN / Verily. See excludeNonCommercial().
// ===========================================================================

import { stateByAbbr, states } from './states-data.js';
import { labelToLevel } from './threat-index.js';

// TrueAPI Phase 1: the browser's live refresh reads the portfolio ingest worker's
// warm copies (CORS-open, refreshed on the 6h cron slot) instead of querying CDC
// Socrata per visitor. Same payloads, same SoQL queries — zero upstream calls
// from this site, and the snapshot fallback below still covers cold starts.
// The worker serves only the exact pre-warmed query strings built below, so the
// $limit / $order parameters must not change without re-warming its feeds.
const SOCRATA_BASE = 'https://ingest.oakandmain.dev/data/cdc-socrata/resource';

/** Weeks of history kept per series — the same window as the bundled sample. */
export const LIVE_WEEKS = 12;

/**
 * A live bundle may only be labeled "Live CDC data" when at least this many of
 * the 51 jurisdictions actually carry data (and the week-ending date is valid).
 * Below it, the response is treated as a failed refresh, never as live.
 */
export const MIN_LIVE_STATES = 25;

/**
 * Dataset registry. `fields` lists candidate Socrata column names in priority
 * order — the adapter uses the first one present on a row, so the site tolerates
 * minor upstream schema drift. Resource IDs are the public dataset identifiers.
 * The first candidate in each list is the column the dataset actually publishes
 * today (verified against data.cdc.gov, October 2026).
 */
export const DATASETS = Object.freeze({
  // NSSP Emergency Department visits (% of ED visits), by state. Primary signal.
  // Published long-format: one row per state, week and pathogen
  // ({ week_end, geography, pathogen: 'Influenza' | 'COVID-19' | 'RSV',
  // percent_visits }). The wide `percent_visits_<pathogen>` columns are kept as
  // fallbacks in case the dataset is republished in that shape.
  edVisits: {
    id: 'vutn-jzwm',
    label: 'NSSP Emergency Department Visits',
    license: 'Public Domain (U.S. Government)',
    fields: {
      week: ['week_end', 'week_end_date', 'weekenddate', 'date'],
      geography: ['geography', 'state', 'geography_name'],
      pathogen: ['pathogen', 'pathogen_name'],
      percent: ['percent_visits', 'percent'],
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
      levelLabel: ['label', 'activity_level_label', 'ari_activity_level', 'activity_level'],
    },
  },
  // CDC NWSS Wastewater Viral Activity Level (WVAL). Public domain. Published
  // per sampling SITE, so a state's weekly value is aggregated below.
  wastewater: {
    id: 'atcp-73re',
    label: 'NWSS Wastewater Viral Activity Level',
    license: 'Public Domain (U.S. Government)',
    fields: {
      week: ['week_end', 'date_period', 'week_ending', 'reference_date', 'date'],
      geography: ['state_territory', 'state', 'wwtp_jurisdiction', 'geography'],
      pathogen: ['pathogen_target', 'pathogen', 'pathogen_name'],
      wval: ['site_wval', 'wval', 'wva_level', 'activity_level', 'value'],
      // provenance fields used to enforce the non-commercial exclusion.
      provenance: ['data_source', 'source', 'reporting_source', 'provider', 'network'],
    },
  },
});

const PATHOGENS = ['influenza', 'covid', 'rsv'];

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
 * network (WastewaterSCAN / SCAN / Verily). CDC's NWSS dataset lists those
 * sites alongside health-department sites (its `source` column says which), so
 * this filter is what keeps CC BY-NC 4.0 data off a monetized page.
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

const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

const weekOf = (row, candidates) => String(pickField(row, candidates) || '').slice(0, 10);

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
  const payload = await res.json();
  // The ingest worker wraps warm payloads: { api, data, fetchedAt, stale }. Unwrap
  // transparently so every adapter below keeps seeing raw Socrata rows.
  const rows = payload && typeof payload === 'object' && payload.api && 'data' in payload
    ? payload.data
    : payload;
  if (!Array.isArray(rows)) throw new Error(`Unexpected payload (not a row array) for ${url}`);
  return rows;
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

function sortByWeek(rows) {
  return [...rows].sort((a, b) => String(a.week).localeCompare(String(b.week)));
}

function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// --- Row parsers (pure; exported for tests) ------------------------------- //

/**
 * NSSP ED visits → Map<abbr, [{ week, influenza, covid, rsv, combined }]>,
 * oldest week first. "Combined" is the dataset's own combined row when present,
 * otherwise the sum of the three diagnosis shares (the published dataset carries
 * only the three), and only when all three were reported that week.
 */
export function parseEdRows(rows) {
  const f = DATASETS.edVisits.fields;
  const byState = new Map();
  for (const row of rows) {
    const st = resolveState(pickField(row, f.geography));
    if (!st) continue;
    const week = weekOf(row, f.week);
    if (!week) continue;
    if (!byState.has(st.abbr)) byState.set(st.abbr, new Map());
    const weeks = byState.get(st.abbr);
    if (!weeks.has(week)) weeks.set(week, { week, influenza: NaN, covid: NaN, rsv: NaN, combined: NaN });
    const rec = weeks.get(week);
    const pathogen = pickField(row, f.pathogen);
    if (pathogen != null) {
      rec[normalizePathogen(pathogen)] = numeric(pickField(row, f.percent));
    } else {
      for (const key of ['combined', ...PATHOGENS]) {
        const v = numeric(pickField(row, f[key]));
        if (Number.isFinite(v)) rec[key] = v;
      }
    }
  }
  const out = new Map();
  for (const [abbr, weeks] of byState) {
    const recs = sortByWeek([...weeks.values()]);
    for (const rec of recs) {
      if (!Number.isFinite(rec.combined) && PATHOGENS.every((p) => Number.isFinite(rec[p]))) {
        rec.combined = round(rec.influenza + rec.covid + rec.rsv);
      }
    }
    out.set(abbr, recs);
  }
  return out;
}

/**
 * NSSP ARI → Map<abbr, [{ week, level, label }]>, oldest first; level 0–4 or
 * null, label the CDC's own wording (kept so copy can quote it exactly).
 */
export function parseAriRows(rows) {
  const f = DATASETS.ari.fields;
  const byState = new Map();
  for (const row of rows) {
    const st = resolveState(pickField(row, f.geography));
    if (!st) continue;
    const week = weekOf(row, f.week);
    if (!week) continue;
    if (!byState.has(st.abbr)) byState.set(st.abbr, []);
    const label = pickField(row, f.levelLabel);
    const level = ariLevelFromLabel(label);
    byState.get(st.abbr).push({ week, level, label: level == null ? null : String(label).trim() });
  }
  for (const [abbr, recs] of byState) byState.set(abbr, sortByWeek(recs));
  return byState;
}

/** CDC ARI label ("Very Low" … "Very High", "Data Unavailable") → 0–4 or null. */
function ariLevelFromLabel(label) {
  const level = labelToLevel(label);
  if (level != null) return level;
  const n = Number(label);
  return label != null && label !== '' && Number.isFinite(n)
    ? Math.max(0, Math.min(4, Math.round((n / 13) * 4)))
    : null;
}

/**
 * NWSS site-level WVAL → Map<abbr, [{ week, influenza, covid, rsv }]>, oldest
 * first. Non-commercial rows are dropped first; each remaining state/week/
 * pathogen value is the MEDIAN across that state's reporting sites, so a single
 * small sewershed cannot set the whole state's reading.
 */
export function parseWastewaterRows(rows) {
  const f = DATASETS.wastewater.fields;
  const byState = new Map();
  for (const row of excludeNonCommercial(rows, f.provenance)) {
    const st = resolveState(pickField(row, f.geography));
    if (!st) continue;
    const week = weekOf(row, f.week);
    const pathogen = normalizePathogen(pickField(row, f.pathogen));
    const wval = numeric(pickField(row, f.wval));
    if (!week || !PATHOGENS.includes(pathogen) || !Number.isFinite(wval)) continue;
    if (!byState.has(st.abbr)) byState.set(st.abbr, new Map());
    const weeks = byState.get(st.abbr);
    if (!weeks.has(week)) weeks.set(week, { influenza: [], covid: [], rsv: [] });
    weeks.get(week)[pathogen].push(wval);
  }
  const out = new Map();
  for (const [abbr, weeks] of byState) {
    const recs = [...weeks.entries()].map(([week, vals]) => ({
      week,
      influenza: round(median(vals.influenza)),
      covid: round(median(vals.covid)),
      rsv: round(median(vals.rsv)),
    }));
    out.set(abbr, sortByWeek(recs));
  }
  return out;
}

/** True when a signal bundle carries at least one real reading. */
export function hasSignalData(sig) {
  return Boolean(
    sig &&
      ((sig.edCombinedSeries && sig.edCombinedSeries.length) ||
        (sig.wastewaterSeries && sig.wastewaterSeries.length) ||
        Number.isFinite(sig.ariLevel))
  );
}

/**
 * Assemble per-state signal bundles (the snapshot/model shape) from parsed
 * rows. Series keep the most recent LIVE_WEEKS weeks, oldest first.
 * @returns {{ signalsByAbbr: Map, weekEnding: string, statesWithData: number }}
 */
export function assembleLiveSignals({ ed = new Map(), ari = new Map(), ww = new Map() } = {}) {
  const signalsByAbbr = new Map();
  let latestWeek = '';
  let statesWithData = 0;
  const finite = (arr) => arr.filter(Number.isFinite);

  for (const st of states) {
    const edRows = (ed.get(st.abbr) || []).slice(-LIVE_WEEKS);
    const ariRows = ari.get(st.abbr) || [];
    const wwRows = (ww.get(st.abbr) || []).slice(-LIVE_WEEKS);

    const week = edRows.at(-1)?.week || ariRows.at(-1)?.week || wwRows.at(-1)?.week || '';
    if (week > latestWeek) latestWeek = week;

    const pathogens = {};
    for (const p of PATHOGENS) {
      pathogens[p] = {
        edPercentSeries: finite(edRows.map((r) => r[p])),
        wastewaterSeries: finite(wwRows.map((r) => r[p])),
        positivitySeries: [],
      };
    }

    const signals = {
      ariLevel: ariRows.at(-1)?.level ?? null,
      ariLabel: ariRows.at(-1)?.label ?? null,
      edCombinedSeries: finite(edRows.map((r) => r.combined)),
      // State wastewater signal = the weekly PEAK of the per-pathogen medians,
      // so whichever virus is most active sets the composite reading.
      wastewaterSeries: finite(
        wwRows.map((r) => {
          const vals = finite(PATHOGENS.map((p) => r[p]));
          return vals.length ? Math.max(...vals) : NaN;
        })
      ),
      positivityCombined: null,
      weekEnding: week,
      pathogens,
    };
    if (hasSignalData(signals)) statesWithData += 1;
    signalsByAbbr.set(st.abbr, signals);
  }

  return { signalsByAbbr, weekEnding: latestWeek, statesWithData };
}

// --- Fetch --------------------------------------------------------------- //

/**
 * Fetch and assemble live per-state signals from the CDC Socrata endpoints.
 * Individual datasets may fail independently. Throws unless at least
 * MIN_LIVE_STATES jurisdictions carry real data and the week-ending date is a
 * valid ISO date — a response that is "successful" but empty must never be
 * labeled live. Returns { signalsByAbbr: Map, weekEnding, sources, statesWithData }.
 */
export async function fetchLiveSignals({ timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;
  const query = (ds, limit) => socrataUrl(ds.id, { $limit: limit, $order: `${ds.fields.week[0]} DESC` });

  const settled = await Promise.allSettled([
    fetchJson(query(DATASETS.edVisits, 60000), { signal }).then(parseEdRows),
    fetchJson(query(DATASETS.ari, 20000), { signal }).then(parseAriRows),
    fetchJson(query(DATASETS.wastewater, 60000), { signal }).then(parseWastewaterRows),
  ]);
  clearTimeout(timer);

  const [ed, ari, ww] = settled.map((r) => (r.status === 'fulfilled' ? r.value : new Map()));
  if (settled.every((r) => r.status === 'rejected')) {
    throw new Error(`All CDC live sources failed to load (${settled.map((r) => r.reason?.message || r.reason).join('; ')})`);
  }

  const assembled = assembleLiveSignals({ ed, ari, ww });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(assembled.weekEnding)) {
    throw new Error('Live CDC feed returned no valid week-ending date');
  }
  if (assembled.statesWithData < MIN_LIVE_STATES) {
    throw new Error(
      `Live CDC feed returned usable data for only ${assembled.statesWithData} of ${states.length} states (minimum ${MIN_LIVE_STATES})`
    );
  }

  // A source is only credited when it actually contributed rows.
  const sources = [];
  if (ed.size) sources.push(DATASETS.edVisits.label);
  if (ari.size) sources.push(DATASETS.ari.label);
  if (ww.size) sources.push(DATASETS.wastewater.label);

  return { ...assembled, sources };
}

/**
 * Days after a shipped live week ends before the browser looks for a newer one.
 * CDC publishes the week ending Saturday S on Friday S+6, so week S+7 appears on
 * Friday S+13. Until then the build-time pre-render already IS the newest CDC
 * week, and a browser refresh would download roughly 20 MB of JSON to show the
 * same numbers. Past it — or if the weekly rebuild did not run — the browser
 * refreshes itself, so the page heals without a deploy.
 */
export const BROWSER_REFRESH_AFTER_DAYS = 13;

/** Should the browser fetch the live feed, given the snapshot it was shipped? */
export function shouldRefreshLive(snapshot, now = new Date()) {
  if (!snapshot || snapshot.kind !== 'live') return true;
  const t = Date.parse(`${snapshot.weekEnding}T00:00:00Z`);
  if (!Number.isFinite(t)) return true;
  return (now.getTime() - t) / 86_400_000 >= BROWSER_REFRESH_AFTER_DAYS;
}

/** Load the snapshot shipped with the build (live CDC data or the sample fallback). */
export async function loadSnapshot(basePath = '') {
  const res = await fetch(`${basePath}/data/snapshot.json`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load snapshot: HTTP ${res.status}`);
  return res.json();
}
