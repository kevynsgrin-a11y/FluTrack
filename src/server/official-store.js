// ===========================================================================
// D1 access for official data, shared by the ingest Worker and the Pages
// Functions.
//
// D1 (official_snapshots) is the source of truth and the last-good store: a
// failed or empty pull writes nothing, so whatever was there stays. KV holds a
// per-geography document REBUILT from D1, which therefore always carries the
// last good week of every source, including ones whose latest pull failed.
// ===========================================================================

import { docFromRows, SERIES_WEEKS } from './sources.js';

const COLUMNS = ['source', 'geo_level', 'geo_id', 'pathogen', 'metric', 'value', 'level_label', 'week_ending', 'fetched_at', 'method_version'];

/** SQL literal for a normalized value. Strings are quote-escaped; non-finite numbers become NULL. */
export function sqlLiteral(v) {
  if (v == null) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Multi-row upsert statements for official_snapshots. Values are inlined as
 * escaped literals rather than bound: D1 caps bound parameters at 100 per
 * statement, which would mean thousands of statements for a county pull. Each
 * statement stays well under D1's statement-size limit. Only rows whose value,
 * label or method actually changed are rewritten.
 */
export function upsertStatements(rows, perStatement = 250) {
  const out = [];
  for (let i = 0; i < rows.length; i += perStatement) {
    const values = rows
      .slice(i, i + perStatement)
      .map((r) => `(${COLUMNS.map((c) => sqlLiteral(r[c])).join(',')})`)
      .join(',');
    out.push(
      `INSERT INTO official_snapshots (${COLUMNS.join(',')}) VALUES ${values} ` +
        `ON CONFLICT(source, geo_id, pathogen, metric, week_ending) DO UPDATE SET ` +
        `geo_level=excluded.geo_level, value=excluded.value, level_label=excluded.level_label, ` +
        `fetched_at=excluded.fetched_at, method_version=excluded.method_version ` +
        `WHERE official_snapshots.value IS NOT excluded.value ` +
        `OR official_snapshots.level_label IS NOT excluded.level_label ` +
        `OR official_snapshots.method_version IS NOT excluded.method_version`
    );
  }
  return out;
}

/** Upsert normalized rows; returns the number of statements run. */
export async function upsertOfficial(db, rows, { batchSize = 20 } = {}) {
  const sql = upsertStatements(rows);
  for (let i = 0; i < sql.length; i += batchSize) {
    await db.batch(sql.slice(i, i + batchSize).map((s) => db.prepare(s)));
  }
  return sql.length;
}

/** Earliest week_ending worth loading for a document (series window + slack). */
export function sinceWeek(now = new Date(), weeks = SERIES_WEEKS + 2) {
  const d = new Date(now.getTime() - weeks * 7 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Recent official rows for a set of geographies (state codes and/or county FIPS). */
export async function loadOfficialRows(db, geoIds, now = new Date()) {
  const ids = [...new Set(geoIds.filter(Boolean))];
  if (!ids.length) return [];
  const out = [];
  // Chunked to stay under the bound-parameter cap.
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const res = await db
      .prepare(
        `SELECT ${COLUMNS.join(',')} FROM official_snapshots WHERE geo_id IN (${chunk.map(() => '?').join(',')}) AND week_ending >= ? ORDER BY week_ending`
      )
      .bind(...chunk, sinceWeek(now))
      .all();
    out.push(...(res.results || []));
  }
  return out;
}

/** Group rows into one document per geography: Map<"state:CA" | "county:06073", doc>. */
export function docsFromRows(rows, now = new Date()) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.geo_level}:${r.geo_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const docs = new Map();
  for (const [key, list] of groups) {
    const [level, id] = key.split(':');
    docs.set(key, docFromRows(level, id, list, now));
  }
  return docs;
}
