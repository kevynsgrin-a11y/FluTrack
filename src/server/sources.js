// ===========================================================================
// Official-data source registry — shared by the ingest Worker (which writes
// these keys) and the Pages Functions (which read and label them).
//
// Column names were taken from https://data.cdc.gov/api/views/<ID>/columns.json
// (recorded in docs/DATA-SCHEMAS.md, fixtures in test/fixtures/cdc/). Never
// guess a column: a wrong name parses to nothing and looks like "no data".
// ===========================================================================

export const SOURCES = Object.freeze({
  nssp_ed: {
    dataset: 'vutn-jzwm',
    system: 'NSSP',
    label: 'CDC NSSP emergency-department visits',
    short: 'NSSP ED visits',
    geo: 'state',
    cadence: 'Weekly (Fridays)',
  },
  nssp_ari: {
    dataset: 'f3zz-zga5',
    system: 'NSSP',
    label: 'CDC NSSP acute respiratory illness level',
    short: 'NSSP ARI level',
    geo: 'state',
    cadence: 'Weekly (Fridays)',
  },
  nwss_wval: {
    dataset: 'atcp-73re',
    system: 'NWSS',
    label: 'CDC NWSS wastewater viral activity level',
    short: 'NWSS wastewater',
    geo: 'county',
    cadence: 'Weekly (Fridays)',
  },
  nhsn_levels: {
    dataset: 'vdzy-6i9v',
    system: 'NHSN',
    label: 'CDC NHSN hospital admission levels',
    short: 'NHSN admissions',
    geo: 'state',
    cadence: 'Weekly (Fridays)',
  },
  nhsn_hrd: {
    dataset: 'ua7e-t2fy',
    system: 'NHSN',
    label: 'CDC NHSN Hospital Respiratory Data (final)',
    short: 'NHSN HRD',
    geo: 'state',
    cadence: 'Weekly (Fridays)',
  },
  nhsn_hrd_prelim: {
    dataset: 'mpgq-jmmr',
    system: 'NHSN',
    label: 'CDC NHSN Hospital Respiratory Data (preliminary)',
    short: 'NHSN HRD preliminary',
    geo: 'state',
    cadence: 'Weekly (Wednesdays)',
  },
  // Behind flags (off by default).
  nwss_site: {
    dataset: 'ymmh-divb',
    system: 'NWSS',
    label: 'CDC NWSS influenza A wastewater samples',
    short: 'NWSS flu A samples',
    geo: 'county',
    cadence: 'Weekly',
    flag: 'NWSS_SITE',
  },
  delphi_ili: {
    dataset: 'fluview',
    system: 'ILINet',
    label: 'CDC ILINet via CMU Delphi Epidata',
    short: 'ILINet (Delphi)',
    geo: 'state',
    cadence: 'Weekly (Fridays)',
    flag: 'DELPHI_FLUVIEW',
  },
});

/** KV key for an official-data document. */
export function officialKey(geoLevel, geoId) {
  return `official:${geoLevel}:${geoId}`;
}

/** KV documents expire after 8 days; D1 keeps the last-good copy beyond that. */
export const OFFICIAL_TTL_SECONDS = 8 * 24 * 3600;

/** Weeks of history kept in a KV document (enough for a 4-week sparkline). */
export const SERIES_WEEKS = 6;

/** CDC changed the WVAL method on this date; values either side are not comparable. */
export const WVAL_METHOD_CHANGE = '2026-08-14';

export function wvalMethodVersion(weekEnding) {
  return String(weekEnding) >= WVAL_METHOD_CHANGE ? `wval-${WVAL_METHOD_CHANGE}` : 'wval-pre-2026-08-14';
}

/** Days between a YYYY-MM-DD week ending and `now`. */
export function ageDays(weekEnding, now = new Date()) {
  const t = Date.parse(`${String(weekEnding).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86_400_000) : null;
}

/** Data older than this many days (past its week ending) is flagged amber. */
export const STALE_AFTER_DAYS = 14;

/**
 * Build the KV document for one geography from normalized rows
 * ({ source, geo_level, geo_id, pathogen, metric, value, level_label,
 * week_ending, fetched_at, method_version }). Per source it keeps the latest
 * week's readings plus a short series per pathogen/metric — and a series never
 * crosses a method_version boundary (the WVAL method change).
 */
export function docFromRows(geoLevel, geoId, rows, now = new Date()) {
  const bySource = new Map();
  for (const r of rows) {
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source).push(r);
  }
  const sources = {};
  for (const [source, list] of bySource) {
    const entry = sourceEntry(source, list);
    if (entry) sources[source] = entry;
  }
  return { geo_level: geoLevel, geo_id: geoId, updated_at: now.toISOString(), sources };
}

function sourceEntry(source, rows) {
  const valid = rows.filter((r) => r.week_ending && (r.value != null || r.level_label));
  if (!valid.length) return null;
  const latestWeek = valid.reduce((m, r) => (r.week_ending > m ? r.week_ending : m), '');
  const latest = valid.filter((r) => r.week_ending === latestWeek);
  const series = {};
  for (const r of latest) {
    const key = `${r.pathogen}:${r.metric}`;
    const points = valid
      .filter((x) => x.pathogen === r.pathogen && x.metric === r.metric && (x.method_version || '') === (r.method_version || ''))
      .sort((a, b) => a.week_ending.localeCompare(b.week_ending))
      .slice(-SERIES_WEEKS)
      .map((x) => ({ week_ending: x.week_ending, value: x.value }));
    series[key] = points;
  }
  const meta = SOURCES[source] || {};
  return {
    source,
    system: meta.system || source,
    label: meta.label || source,
    dataset: meta.dataset || null,
    week_ending: latestWeek,
    fetched_at: latest.reduce((m, r) => (r.fetched_at > m ? r.fetched_at : m), ''),
    method_version: latest[0].method_version || null,
    readings: latest.map((r) => ({ pathogen: r.pathogen, metric: r.metric, value: r.value, level_label: r.level_label || null })),
    series,
  };
}

/**
 * Merge a freshly built document over the stored one, source by source.
 * A source missing from `fresh` (its pull failed or came back empty) keeps its
 * stored entry. A fresh entry for an OLDER week than the stored one is ignored
 * too, so a lagging mirror can never roll the data back. Never overwrite good
 * data with an empty or failed pull.
 */
export function mergeDocs(stored, fresh) {
  if (!stored || !stored.sources) return fresh;
  const sources = { ...stored.sources };
  for (const [key, entry] of Object.entries(fresh.sources || {})) {
    const prev = sources[key];
    if (!prev || !prev.week_ending || entry.week_ending >= prev.week_ending) sources[key] = entry;
  }
  return { ...stored, ...fresh, sources };
}
