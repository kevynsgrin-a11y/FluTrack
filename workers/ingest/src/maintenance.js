// ===========================================================================
// Daily maintenance (cron "0 8 * * *"):
//   1. salt rotation   — create today's salt, delete every older one, so no
//                        past ip_hash can be recomputed from an IP
//   2. purge           — raw report rows older than 90 days are deleted;
//                        daily aggregates are kept
//   3. anomaly checks  — quarantine county-days far above their own trailing
//                        mean, and any single ip_hash over the daily cap
//   4. aggregates      — rebuild report_aggregates_daily for the recent window
//                        from non-quarantined rows (aggregates move only here,
//                        so spam cannot change what visitors see in real time)
// ===========================================================================

import { dailySalt, utcDay, LIMIT_PER_DAY } from '../../../src/server/privacy.js';

export const RETENTION_DAYS = 90;
export const AGGREGATE_WINDOW_DAYS = 35; // 28-day baseline + 7-day display window
export const ANOMALY_FACTOR = 3;
export const ANOMALY_MIN_N = 10;

const daysAgo = (now, n) => utcDay(new Date(now.getTime() - n * 86_400_000));

export async function rotateSalts(kv, now = new Date()) {
  const today = utcDay(now);
  await dailySalt(kv, today);
  let deleted = 0;
  let cursor;
  do {
    const page = await kv.list({ prefix: 'salt:', cursor });
    for (const { name } of page.keys) {
      if (name.slice('salt:'.length) < today) {
        await kv.delete(name);
        deleted += 1;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return deleted;
}

export async function purgeOldReports(db, now = new Date()) {
  const res = await db.prepare('DELETE FROM reports WHERE created_day < ?').bind(daysAgo(now, RETENTION_DAYS)).run();
  return res.meta?.changes ?? 0;
}

/**
 * Quarantine:
 *   * a county-day whose report count exceeds ANOMALY_FACTOR × that county's
 *     mean daily count over the previous 28 days (and is at least ANOMALY_MIN_N);
 *   * every report from an ip_hash that exceeded the daily cap on a day.
 * Checks the last two days so a late-evening burst is still caught.
 */
export async function quarantineAnomalies(db, now = new Date()) {
  let quarantined = 0;
  for (const back of [1, 0]) {
    const day = daysAgo(now, back);
    const from = daysAgo(now, back + 28);
    const counties = await db
      .prepare(
        `SELECT r.county_fips AS county, COUNT(*) AS n,
           COALESCE((SELECT SUM(a.n) FROM report_aggregates_daily a WHERE a.county_fips = r.county_fips AND a.day >= ? AND a.day < ?), 0) / 28.0 AS mean
         FROM reports r WHERE r.created_day = ? AND r.quarantined = 0 AND r.county_fips IS NOT NULL
         GROUP BY r.county_fips`
      )
      .bind(from, day, day)
      .all();
    for (const c of counties.results || []) {
      if (c.n >= ANOMALY_MIN_N && c.n > ANOMALY_FACTOR * c.mean) {
        const res = await db.prepare('UPDATE reports SET quarantined = 1 WHERE county_fips = ? AND created_day = ?').bind(c.county, day).run();
        quarantined += res.meta?.changes ?? 0;
      }
    }
    const res = await db
      .prepare(
        `UPDATE reports SET quarantined = 1 WHERE created_day = ? AND quarantined = 0 AND ip_hash IN
           (SELECT ip_hash FROM reports WHERE created_day = ? AND ip_hash IS NOT NULL GROUP BY ip_hash HAVING COUNT(*) > ?)`
      )
      .bind(day, day, LIMIT_PER_DAY)
      .run();
    quarantined += res.meta?.changes ?? 0;
  }
  return quarantined;
}

export async function rebuildAggregates(db, now = new Date()) {
  const from = daysAgo(now, AGGREGATE_WINDOW_DAYS);
  await db.batch([
    db.prepare('DELETE FROM report_aggregates_daily WHERE day >= ?').bind(from),
    db
      .prepare(
        `INSERT INTO report_aggregates_daily (day, county_fips, state, n, n_sick, n_ili, n_pos_flu, n_pos_covid)
         SELECT created_day, county_fips, MIN(state), COUNT(*),
                SUM(feeling = 'sick'), SUM(ili),
                SUM(test_type IS NOT NULL AND test_type <> 'none' AND test_result IN ('positive_flu', 'positive_both')),
                SUM(test_type IS NOT NULL AND test_type <> 'none' AND test_result IN ('positive_covid', 'positive_both'))
         FROM reports
         WHERE quarantined = 0 AND county_fips IS NOT NULL AND created_day >= ?
         GROUP BY created_day, county_fips`
      )
      .bind(from),
  ]);
}

export async function dailyMaintenance(env, now = new Date()) {
  const out = {};
  const step = async (name, fn) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = `error: ${e?.message || e}`;
    }
  };
  if (env.OFFICIAL_CACHE) await step('salts_deleted', () => rotateSalts(env.OFFICIAL_CACHE, now));
  if (env.DB) {
    await step('purged', () => purgeOldReports(env.DB, now));
    await step('quarantined', () => quarantineAnomalies(env.DB, now));
    await step('aggregates', () => rebuildAggregates(env.DB, now).then(() => 'rebuilt'));
  }
  return out;
}
