// ===========================================================================
// flutrack-ingest — the Worker that owns FluTrack's Cron Triggers.
// (Pages Functions cannot run crons, so this is the one standalone Worker.)
//
//   "0 18 * * 3"  Wednesday official pull (NSSP, NHSN preliminary)
//   "0 18 * * 5"  Friday official pull (NWSS, NHSN, FluView)
//   "0 8 * * *"   salt rotation, 90-day purge, anomaly checks, aggregates
//
// Both pull crons run every source; each source fails independently and a
// failed or thin pull writes nothing (D1 keeps the last good week).
//
// Manual endpoints (all POST, Authorization: Bearer <INGEST_TOKEN>):
//   /__ingest        run the official pull now (?only=nssp_ed,nwss_wval)
//   /__maintenance   run the daily maintenance now
//   /__seed-zip      (re)seed the ZIP→county crosswalk from Census
//   /__kv            internal: rebuild KV docs for {"states":["CA"]}
// GET /health        last run summary (no secrets, no personal data)
// ===========================================================================

import { sourceDefs, runSource } from './pull.js';
import { dailyMaintenance } from './maintenance.js';
import { seedZipCrosswalk } from './zip-seed.js';
import { upsertOfficial, loadOfficialRows, docsFromRows } from '../../../src/server/official-store.js';
import { officialKey, OFFICIAL_TTL_SECONDS } from '../../../src/server/sources.js';
import { states } from '../../../src/scripts/states-data.js';
import { COUNTY_NAMES } from '../../../src/server/county-names.js';

const PULL_CRONS = new Set(['0 18 * * 3', '0 18 * * 5']);
const MAINTENANCE_CRON = '0 8 * * *';
const LAST_RUN_KEY = 'ingest:last';

const COUNTIES_BY_STATE = (() => {
  const m = new Map();
  for (const fips of Object.keys(COUNTY_NAMES)) {
    const st = states.find((s) => s.fips === fips.slice(0, 2));
    if (!st) continue;
    if (!m.has(st.abbr)) m.set(st.abbr, []);
    m.get(st.abbr).push(fips);
  }
  return m;
})();

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** Constant-time bearer-token check. */
export async function authorized(request, env) {
  const expected = env.INGEST_TOKEN;
  if (!expected) return false;
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(got)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0 && got.length > 0;
}

/**
 * Rebuild the KV documents for some states (and their counties) from D1.
 * Kept per state so one invocation stays far below KV's 1,000-operation cap.
 */
export async function writeKvForStates(env, abbrs, now = new Date()) {
  let written = 0;
  for (const abbr of abbrs) {
    const geoIds = [abbr, ...(COUNTIES_BY_STATE.get(abbr) || [])];
    const rows = await loadOfficialRows(env.DB, geoIds, now);
    const docs = docsFromRows(rows, now);
    for (const [key, doc] of docs) {
      const [level, id] = key.split(':');
      await env.OFFICIAL_CACHE.put(officialKey(level, id), JSON.stringify(doc), { expirationTtl: OFFICIAL_TTL_SECONDS });
      written += 1;
    }
  }
  return written;
}

async function fanOutKv(env, now) {
  const abbrs = states.map((s) => s.abbr);
  if (!env.SELF) return { kv_docs: await writeKvForStates(env, abbrs, now) };
  let docs = 0;
  const failed = [];
  const queue = [...abbrs];
  const worker = async () => {
    while (queue.length) {
      const abbr = queue.shift();
      try {
        const res = await env.SELF.fetch('https://flutrack-ingest/__kv', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.INGEST_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ states: [abbr] }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) docs += body.written || 0;
        else failed.push(abbr);
      } catch (e) {
        failed.push(abbr);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { kv_docs: docs, kv_failed: failed };
}

export async function runIngest(env, { only = null, fetchImpl = fetch, now = new Date() } = {}) {
  const defs = sourceDefs(now, env).filter((d) => !only || only.includes(d.key));
  const results = await Promise.all(defs.map((d) => runSource(d, { env, fetchImpl, now })));
  const good = results.filter((r) => r.ok);
  const rows = good.flatMap((r) => r.rows);
  const summary = {
    started_at: now.toISOString(),
    sources: Object.fromEntries(results.map((r) => [r.key, { ok: r.ok, geos: r.geos, detail: r.reason }])),
    rows: rows.length,
  };
  if (rows.length && env.DB) {
    summary.statements = await upsertOfficial(env.DB, rows);
  }
  if (env.DB && env.OFFICIAL_CACHE) Object.assign(summary, await fanOutKv(env, now));
  summary.finished_at = new Date().toISOString();
  if (env.OFFICIAL_CACHE) await env.OFFICIAL_CACHE.put(LAST_RUN_KEY, JSON.stringify(summary));
  return summary;
}

export default {
  async scheduled(event, env, ctx) {
    if (PULL_CRONS.has(event.cron)) {
      ctx.waitUntil(runIngest(env).then((s) => console.log('ingest', JSON.stringify(s.sources))));
    } else if (event.cron === MAINTENANCE_CRON) {
      ctx.waitUntil(dailyMaintenance(env).then((s) => console.log('maintenance', JSON.stringify(s))));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      const last = env.OFFICIAL_CACHE ? await env.OFFICIAL_CACHE.get(LAST_RUN_KEY, 'json') : null;
      return json({ ok: true, worker: 'flutrack-ingest', last_run: last });
    }
    if (request.method !== 'POST' || !url.pathname.startsWith('/__')) return json({ error: 'not_found' }, 404);
    if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);

    switch (url.pathname) {
      case '/__ingest': {
        const only = url.searchParams.get('only')?.split(',').filter(Boolean) || null;
        return json(await runIngest(env, { only }));
      }
      case '/__kv': {
        const body = await request.json().catch(() => ({}));
        const abbrs = (body.states || []).filter((s) => states.some((x) => x.abbr === s));
        return json({ written: await writeKvForStates(env, abbrs) });
      }
      case '/__maintenance':
        return json(await dailyMaintenance(env));
      case '/__seed-zip':
        return json(await seedZipCrosswalk(env));
      default:
        return json({ error: 'not_found' }, 404);
    }
  },
};
