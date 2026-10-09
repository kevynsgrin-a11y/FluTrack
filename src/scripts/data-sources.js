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

/** Conservative observation-age guard; a weekly release need not be today's data. */
export const MAX_OBSERVATION_AGE_DAYS = 21;

/** Valid calendar dates only: Date.parse otherwise accepts dates such as February 30. */
export function observationAgeDays(weekEnding, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekEnding))) return Infinity;
  const t = Date.parse(`${weekEnding}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== weekEnding) return Infinity;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

const DATE_FIELDS = Object.freeze({
  publication: ['publication_date', 'published_at', 'date_published'],
  updated: ['date_updated', 'buildnumber', 'last_updated'],
  periodStart: ['week_start', 'week_start_date', 'period_start'],
});

// An upstream update/build timestamp is retained separately. It is not evidence
// of an official publication date, and an ingest retrieval is neither one.
function rowMetadata(row, week) {
  return {
    observationPeriod: { start: pickField(row, DATE_FIELDS.periodStart) || null, end: week, weekEnding: week },
    publicationDate: pickField(row, DATE_FIELDS.publication) || null,
    upstreamUpdatedAt: pickField(row, DATE_FIELDS.updated) || null,
  };
}

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
      site: ['site', 'wwtp_id', 'key_plot_id'],
      pathogen: ['pathogen_target', 'pathogen', 'pathogen_name'],
      wval: ['site_wval', 'wval', 'wva_level', 'activity_level', 'value'],
      // provenance fields used to enforce the non-commercial exclusion.
      provenance: ['data_source', 'source', 'reporting_source', 'provider', 'network'],
    },
  },
});

const PATHOGENS = ['influenza', 'covid', 'rsv'];

/**
 * A state's weekly wastewater reading for a virus needs at least this many
 * eligible sites. With one or two, a couple of small sewersheds set the whole
 * state's value — the thing the median exists to prevent.
 */
export const MIN_WASTEWATER_SITES = 3;

/**
 * A site reporting the identical WVAL above the floor for this many consecutive
 * reports is carrying a stale value forward (real activity levels move week to
 * week), so those readings are dropped. Repeats AT the floor (1.0, the usual
 * "nothing detected above baseline" value) are legitimate and kept.
 */
export const STALE_RUN_REPORTS = 3;
const WVAL_FLOOR = 1;

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

async function fetchJson(url, { signal, now = new Date() } = {}) {
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const payload = await res.json();
  // The ingest worker wraps warm payloads: { api, data, fetchedAt, stale }. Unwrap
  // transparently so every adapter below keeps seeing raw Socrata rows.
  const wrapped = payload && typeof payload === 'object' && payload.api && 'data' in payload;
  const rows = wrapped ? payload.data : payload;
  if (!Array.isArray(rows)) throw new Error(`Unexpected payload (not a row array) for ${url}`);
  return {
    rows,
    retrievedAt: wrapped ? payload.fetchedAt || null : now.toISOString(),
    requestRetrievedAt: now.toISOString(),
    stale: wrapped && payload.stale === true,
  };
}

function normalizePathogen(raw) {
  const s = String(raw || '').toLowerCase();
  if (/flu|influenza/.test(s)) return 'influenza';
  if (/cov|sars/.test(s)) return 'covid';
  if (/rsv|syncytial/.test(s)) return 'rsv';
  return /combined|all respiratory/.test(s) ? 'combined' : null;
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
    if (!Number.isFinite(observationAgeDays(week))) continue;
    if (!byState.has(st.abbr)) byState.set(st.abbr, new Map());
    const weeks = byState.get(st.abbr);
    if (!weeks.has(week)) weeks.set(week, { week, influenza: NaN, covid: NaN, rsv: NaN, combined: NaN, metadata: {} });
    const rec = weeks.get(week);
    const pathogen = pickField(row, f.pathogen);
    if (pathogen != null) {
      const key = normalizePathogen(pathogen);
      if (!key) continue;
      rec[key] = numeric(pickField(row, f.percent));
      rec.metadata[key] = rowMetadata(row, week);
    } else {
      for (const key of ['combined', ...PATHOGENS]) {
        const v = numeric(pickField(row, f[key]));
        if (Number.isFinite(v)) rec[key] = v;
        rec.metadata[key] = rowMetadata(row, week);
      }
    }
  }
  const out = new Map();
  for (const [abbr, weeks] of byState) {
    const recs = sortByWeek([...weeks.values()]);
    for (const rec of recs) {
      if (!Number.isFinite(rec.combined) && PATHOGENS.every((p) => Number.isFinite(rec[p]))) {
        rec.combined = round(rec.influenza + rec.covid + rec.rsv);
        const publicationDates = [...new Set(PATHOGENS.map((p) => rec.metadata[p]?.publicationDate).filter(Boolean))];
        rec.metadata.combined = {
          observationPeriod: { start: null, end: rec.week, weekEnding: rec.week },
          publicationDate: publicationDates.length === 1 ? publicationDates[0] : null,
          publicationDates,
          upstreamUpdatedAt: [...new Set(PATHOGENS.map((p) => rec.metadata[p]?.upstreamUpdatedAt).filter(Boolean))].sort().at(-1) || null,
          derivedFrom: PATHOGENS,
        };
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
    if (!Number.isFinite(observationAgeDays(week))) continue;
    if (!byState.has(st.abbr)) byState.set(st.abbr, []);
    const label = pickField(row, f.levelLabel);
    const level = ariLevelFromLabel(label);
    byState.get(st.abbr).push({ week, level, label: level == null ? null : String(label).trim(), metadata: { level: rowMetadata(row, week) } });
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
 * first. Non-commercial rows are dropped first, then stale site values (see
 * STALE_RUN_REPORTS). Each remaining state/week/pathogen value is the MEDIAN
 * across that state's reporting sites, and only when at least
 * MIN_WASTEWATER_SITES reported — otherwise there is no reading (NaN).
 */
export function parseWastewaterRows(rows) {
  const f = DATASETS.wastewater.fields;
  // 1. Group each eligible reading by state, virus and site.
  const bySite = new Map();
  const byState = new Map();
  for (const row of excludeNonCommercial(rows, f.provenance)) {
    const st = resolveState(pickField(row, f.geography));
    if (!st) continue;
    const week = weekOf(row, f.week);
    const pathogen = normalizePathogen(pickField(row, f.pathogen));
    const wval = numeric(pickField(row, f.wval));
    if (!Number.isFinite(observationAgeDays(week)) || !PATHOGENS.includes(pathogen)) continue;
    // Keep the reporting period even when no usable value survives. Otherwise
    // a missing newest week silently promotes an older reading to "latest".
    if (!byState.has(st.abbr)) byState.set(st.abbr, new Map());
    const weeks = byState.get(st.abbr);
    if (!weeks.has(week)) weeks.set(week, {
      influenza: [], covid: [], rsv: [], metadata: {},
      eligibleSites: { influenza: new Set(), covid: new Set(), rsv: new Set() },
    });
    const weekRecord = weeks.get(week);
    const previous = weekRecord.metadata[pathogen] || {};
    const meta = rowMetadata(row, week);
    const publicationDates = [...new Set([...(previous.publicationDates || []), meta.publicationDate].filter(Boolean))];
    weekRecord.metadata[pathogen] = {
      ...meta,
      publicationDate: publicationDates.length === 1 ? publicationDates[0] : null,
      publicationDates,
      upstreamUpdatedAt: [previous.upstreamUpdatedAt, meta.upstreamUpdatedAt].filter(Boolean).sort().at(-1) || null,
    };
    // Identifiable sites are required to substantiate site coverage. Anonymous
    // duplicate rows must not become three independently reporting sewersheds.
    const site = pickField(row, f.site);
    if (site == null || !Number.isFinite(wval)) continue;
    weekRecord.eligibleSites[pathogen].add(String(site));
    const key = `${st.abbr}|${pathogen}|${site}`;
    if (!bySite.has(key)) bySite.set(key, { abbr: st.abbr, pathogen, reports: [] });
    const { reports } = bySite.get(key);
    // One report per site and week, so a duplicated row is neither a second site nor a "run".
    if (!reports.some((r) => r.week === week)) reports.push({ week, wval });
  }

  // 2. Drop stale runs, then pool what is left by state, week and virus.
  for (const { abbr, pathogen, reports } of bySite.values()) {
    for (const { week, wval } of withoutStaleRuns(sortByWeek(reports))) {
      const weeks = byState.get(abbr);
      weeks.get(week)[pathogen].push(wval);
    }
  }

  // 3. Median per state/week/virus, only with enough sites behind it.
  const stateValue = (vals) => (vals.length >= MIN_WASTEWATER_SITES ? round(median(vals)) : NaN);
  const out = new Map();
  for (const [abbr, weeks] of byState) {
    const recs = [...weeks.entries()].map(([week, vals]) => {
      const reportingMetadata = PATHOGENS.map((p) => vals.metadata[p]).filter(Boolean);
      const publicationDates = [...new Set(reportingMetadata.flatMap((meta) => meta.publicationDates || [meta.publicationDate]).filter(Boolean))];
      vals.metadata.combined = {
        observationPeriod: { start: null, end: week, weekEnding: week },
        publicationDate: publicationDates.length === 1 ? publicationDates[0] : null,
        publicationDates,
        upstreamUpdatedAt: reportingMetadata.map((meta) => meta.upstreamUpdatedAt).filter(Boolean).sort().at(-1) || null,
      };
      return {
        week,
        influenza: stateValue(vals.influenza),
        covid: stateValue(vals.covid),
        rsv: stateValue(vals.rsv),
        metadata: vals.metadata,
        coverage: Object.fromEntries(PATHOGENS.map((p) => [p, {
          reportingSites: vals[p].length,
          eligibleSites: vals.eligibleSites[p].size,
          minimumSites: MIN_WASTEWATER_SITES,
          excludedRepeatedSites: vals.eligibleSites[p].size - vals[p].length,
          populationCoverage: null,
        }])),
      };
    });
    out.set(abbr, sortByWeek(recs));
  }
  return out;
}

/** One site's reports (oldest first) minus any run of STALE_RUN_REPORTS+ identical values above the floor. */
function withoutStaleRuns(reports) {
  const keep = [];
  for (let i = 0; i < reports.length; ) {
    let j = i + 1;
    while (j < reports.length && reports[j].wval === reports[i].wval) j += 1;
    if (!(j - i >= STALE_RUN_REPORTS && reports[i].wval > WVAL_FLOOR)) keep.push(...reports.slice(i, j));
    i = j;
  }
  return keep;
}

/** True when a signal bundle carries at least one finite, usable composite input. */
export function hasSignalData(sig) {
  // Missing kind supports verified legacy live snapshots. An explicit unknown
  // or sample binding cannot be promoted into usable live coverage.
  if (sig?.provenance?.kind && sig.provenance.kind !== 'live') return false;
  const usable = (key) => {
    const metric = sig?.provenance?.metrics?.[key];
    const metricWeek = metric?.observationPeriod?.weekEnding;
    return !metric || ((!metric.kind || metric.kind === 'live') && metric.status === 'available' && metric.contributes !== false &&
      (!metricWeek || !sig.weekEnding || metricWeek === sig.weekEnding));
  };
  const finiteSeries = (series) => Array.isArray(series) && series.some(Number.isFinite);
  return Boolean(sig && (
    (usable('edVisits') && finiteSeries(sig.edCombinedSeries)) ||
    (usable('wastewater') && finiteSeries(sig.wastewaterSeries)) ||
    (usable('ari') && Number.isFinite(sig.ariLevel))
  ));
}

const latestUsableWeek = (rows, keys) => [...rows].reverse().find((r) => keys.some((key) => Number.isFinite(r[key])))?.week || '';
const peakWastewater = (row) => {
  const values = PATHOGENS.map((p) => row[p]).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
};

function metricProvenance(rows, key, { dataset, source = {}, referenceWeek, geography, now, coverage = null, readValue = (r) => r[key] }) {
  const latest = rows.at(-1);
  const weekEnding = latest?.week || null;
  const value = latest ? readValue(latest) : null;
  const observations = rows.map((r) => ({ weekEnding: r.week, value: Number.isFinite(readValue(r)) ? readValue(r) : null }));
  const meta = latest?.metadata?.[key] || {};
  const ageDays = observationAgeDays(weekEnding, now);
  let status = Number.isFinite(value) ? 'available' : 'missing';
  let reason = status === 'missing' ? 'no-usable-latest-observation' : null;
  if (source.status === 'unavailable') { status = 'unavailable'; reason = source.reason || 'source-request-failed'; }
  else if (status === 'available' && (ageDays > MAX_OBSERVATION_AGE_DAYS || ageDays < 0)) {
    status = 'stale'; reason = ageDays < 0 ? 'future-observation-period' : 'observation-age';
  }
  const contributes = status === 'available' && weekEnding === referenceWeek;
  if (status === 'available' && !contributes) reason = 'different-observation-period';
  return {
    status, contributes, reason,
    source: dataset.label, datasetId: dataset.id,
    measure: dataset === DATASETS.edVisits ? 'percentage of emergency-department visits' : dataset === DATASETS.wastewater ? 'wastewater viral activity level' : 'acute respiratory illness activity category',
    geography,
    observationPeriod: meta.observationPeriod || { start: null, end: weekEnding, weekEnding },
    publicationDate: meta.publicationDate || null,
    ...(meta.publicationDates ? { publicationDates: meta.publicationDates } : {}),
    upstreamUpdatedAt: meta.upstreamUpdatedAt || null,
    retrievedAt: source.retrievedAt || null,
    requestRetrievedAt: source.requestRetrievedAt || null,
    cacheStale: source.stale === true,
    ageDays: Number.isFinite(ageDays) ? ageDays : null,
    coverage: coverage || { reportedObservations: observations.filter((o) => o.value != null).length, populationCoverage: null },
    observations,
  };
}

function metricSeries(metric) {
  return metric.contributes ? metric.observations.map((o) => o.value) : [];
}

/**
 * Assemble dated, state-scoped readings. A missing newest value never falls
 * back to an older finite value, and metrics from different periods do not
 * silently form a single latest-period index. Historical observations remain
 * in provenance for inspection and date-aligned aggregate comparisons.
 */
export function assembleLiveSignals({ ed = new Map(), ari = new Map(), ww = new Map(), sourceMetadata = {}, now = new Date() } = {}) {
  const signalsByAbbr = new Map();
  let latestWeek = '';
  for (const st of states) {
    const edRows = sortByWeek(ed.get(st.abbr) || []).slice(-LIVE_WEEKS);
    const ariRows = sortByWeek(ari.get(st.abbr) || []).slice(-LIVE_WEEKS);
    const wwRows = sortByWeek(ww.get(st.abbr) || []).slice(-LIVE_WEEKS);
    const geography = { level: 'state', abbr: st.abbr, name: st.name };
    const week = [latestUsableWeek(edRows, ['combined', ...PATHOGENS]), latestUsableWeek(ariRows, ['level']), latestUsableWeek(wwRows, PATHOGENS)].sort().at(-1) || '';
    const latestReportingWeekEnding = [edRows.at(-1)?.week, ariRows.at(-1)?.week, wwRows.at(-1)?.week].filter(Boolean).sort().at(-1) || null;
    const common = { referenceWeek: week, geography, now };
    const edMetric = metricProvenance(edRows, 'combined', { ...common, dataset: DATASETS.edVisits, source: sourceMetadata.edVisits,
      coverage: { reportingPathogens: PATHOGENS.filter((p) => Number.isFinite(edRows.at(-1)?.[p])), requiredPathogensForDerivedCombined: PATHOGENS, populationCoverage: null } });
    const ariMetric = metricProvenance(ariRows, 'level', { ...common, dataset: DATASETS.ari, source: sourceMetadata.ari });
    const wwMetric = metricProvenance(wwRows, 'combined', { ...common, dataset: DATASETS.wastewater, source: sourceMetadata.wastewater, readValue: peakWastewater,
      coverage: { pathogens: wwRows.at(-1)?.coverage || null, minimumSitesPerPathogen: MIN_WASTEWATER_SITES, populationCoverage: null } });
    const positivityMetric = { status: 'unavailable', contributes: false, reason: 'no-live-adapter', source: 'NREVSS laboratory test positivity', observationPeriod: { start: null, end: null, weekEnding: null }, publicationDate: null, retrievedAt: null, coverage: null, observations: [] };
    const provenance = {
      kind: 'live', geography,
      observationPeriod: { start: null, end: week || null, weekEnding: week || null },
      latestReportingWeekEnding,
      metrics: { edVisits: edMetric, ari: ariMetric, wastewater: wwMetric, positivity: positivityMetric },
    };
    const pathogens = {};
    for (const p of PATHOGENS) {
      const edPathogen = metricProvenance(edRows, p, { ...common, dataset: DATASETS.edVisits, source: sourceMetadata.edVisits });
      const wwPathogen = metricProvenance(wwRows, p, { ...common, dataset: DATASETS.wastewater, source: sourceMetadata.wastewater, coverage: wwRows.at(-1)?.coverage?.[p] });
      pathogens[p] = {
        edPercentSeries: metricSeries(edPathogen), wastewaterSeries: metricSeries(wwPathogen), positivitySeries: [],
        provenance: { kind: 'live', geography, observationPeriod: provenance.observationPeriod, metrics: { edVisits: edPathogen, wastewater: wwPathogen, positivity: positivityMetric } },
      };
    }
    const signals = {
      ariLevel: ariMetric.contributes ? ariRows.at(-1).level : null,
      ariLabel: ariMetric.contributes ? ariRows.at(-1).label : null,
      edCombinedSeries: metricSeries(edMetric),
      wastewaterSeries: metricSeries(wwMetric),
      positivityCombined: null,
      weekEnding: week,
      provenance,
      pathogens,
    };
    if (hasSignalData(signals) && week > latestWeek) latestWeek = week;
    signalsByAbbr.set(st.abbr, signals);
  }

  // Coverage belongs to the stated snapshot period, rather than the union of
  // any historic reading ever seen or the number of jurisdiction object keys.
  const usableAbbrs = [...signalsByAbbr].filter(([, sig]) => sig.weekEnding === latestWeek && hasSignalData(sig)).map(([abbr]) => abbr);
  const statesWithData = usableAbbrs.length;
  return { signalsByAbbr, weekEnding: latestWeek, statesWithData,
    coverage: { geography: '50 states and District of Columbia', jurisdictions: states.length, usableJurisdictions: statesWithData, usableAbbrs, observationPeriod: { weekEnding: latestWeek || null } } };
}

// --- Fetch --------------------------------------------------------------- //

/**
 * Fetch and assemble live per-state signals from the CDC Socrata endpoints.
 * Individual datasets may fail independently. Throws unless at least
 * MIN_LIVE_STATES jurisdictions carry real data and the week-ending date is a
 * valid ISO date — a response that is "successful" but empty must never be
 * labeled live. Returns { signalsByAbbr: Map, weekEnding, sources, statesWithData }.
 */
export async function fetchLiveSignals({ timeoutMs = 12000, now = new Date() } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;
  const query = (ds, limit) => socrataUrl(ds.id, { $limit: limit, $order: `${ds.fields.week[0]} DESC` });

  const entries = [['edVisits', 60000, parseEdRows], ['ari', 20000, parseAriRows], ['wastewater', 60000, parseWastewaterRows]];
  const settled = await Promise.allSettled(entries.map(async ([key, limit, parse]) => {
    const result = await fetchJson(query(DATASETS[key], limit), { signal, now });
    return { ...result, parsed: parse(result.rows) };
  }));
  clearTimeout(timer);

  const [ed, ari, ww] = settled.map((r) => (r.status === 'fulfilled' ? r.value.parsed : new Map()));
  if (settled.every((r) => r.status === 'rejected')) {
    throw new Error(`All CDC live sources failed to load (${settled.map((r) => r.reason?.message || r.reason).join('; ')})`);
  }

  const sourceMetadata = Object.fromEntries(entries.map(([key], i) => {
    const result = settled[i];
    return [key, result.status === 'fulfilled'
      ? { status: 'available', retrievedAt: result.value.retrievedAt, requestRetrievedAt: result.value.requestRetrievedAt, stale: result.value.stale }
      : { status: 'unavailable', reason: result.reason?.message || String(result.reason), retrievedAt: null, requestRetrievedAt: now.toISOString() }];
  }));
  const assembled = assembleLiveSignals({ ed, ari, ww, sourceMetadata, now });
  if (!Number.isFinite(observationAgeDays(assembled.weekEnding, now))) {
    throw new Error('Live CDC feed returned no valid week-ending date');
  }
  if (assembled.statesWithData < MIN_LIVE_STATES) {
    throw new Error(
      `Live CDC feed returned usable data for only ${assembled.statesWithData} of ${states.length} states (minimum ${MIN_LIVE_STATES})`
    );
  }

  // HTTP success or a parsed row is not a contribution. The current-period
  // reading must contain a finite, eligible value used by at least one state.
  const sourceAvailability = entries.map(([key]) => {
    const stateReadings = [...assembled.signalsByAbbr].map(([abbr, sig]) => ({ abbr, metric: sig.provenance.metrics[key] }));
    const readings = stateReadings.map(({ metric }) => metric);
    const contributing = stateReadings.filter(({ metric }) => metric.contributes);
    return {
      key, source: DATASETS[key].label, datasetId: DATASETS[key].id,
      ...sourceMetadata[key],
      cacheStale: sourceMetadata[key].stale === true,
      status: sourceMetadata[key].status === 'unavailable' ? 'unavailable' : contributing.length ? 'available' : 'missing',
      contributingJurisdictions: contributing.length,
      contributingAbbrs: contributing.map(({ abbr }) => abbr),
      contributingObservationPeriods: [...new Set(contributing.map(({ metric }) => metric.observationPeriod.weekEnding).filter(Boolean))].sort(),
      // All reported periods include dated gaps and readings excluded from the
      // selected index; the contributing periods above describe its inputs.
      observationPeriods: [...new Set(readings.map((metric) => metric.observationPeriod.weekEnding).filter(Boolean))].sort(),
      publicationDates: [...new Set(readings.flatMap((metric) => metric.publicationDates || [metric.publicationDate]).filter(Boolean))].sort(),
      upstreamUpdatedAt: readings.map((metric) => metric.upstreamUpdatedAt).filter(Boolean).sort().at(-1) || null,
    };
  });
  const sources = sourceAvailability.filter((source) => source.contributingJurisdictions > 0).map((source) => source.source);
  return { ...assembled, sources, sourceAvailability,
    retrievedAt: sourceAvailability.filter((source) => source.contributingJurisdictions > 0).map((source) => source.retrievedAt).filter(Boolean).sort().at(-1) || null,
    requestRetrievedAt: now.toISOString() };
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
