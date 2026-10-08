// ===========================================================================
// Build-time live pre-render.
//
// The static build used to bake the deterministic SAMPLE snapshot into every
// page, so what a crawler indexed and what a visitor saw before the browser's
// live fetch was illustrative data with a date that only moved when someone
// regenerated it by hand. This module fetches the real CDC feed at build time
// (the same fetchLiveSignals() the browser uses) and returns a snapshot the
// build renders from and ships as /data/snapshot.json.
//
// LIVE_PRERENDER selects the policy:
//   auto     (default) try live; on failure fall back to the bundled sample,
//            which every page then labels "Sample data".
//   require  try live; on failure FAIL the build. The weekly rebuild workflow
//            uses this as a preflight so a broken feed never replaces last
//            week's live deploy with sample data.
//   off      sample only (deterministic; for offline work).
//
// A live result is accepted only if fetchLiveSignals() passed its own coverage
// gate (>= MIN_LIVE_STATES states with data, valid week) AND the newest week is
// no older than MAX_LIVE_AGE_DAYS — a warm cache that stopped refreshing must
// not be pre-rendered as current.
// ===========================================================================

import { fetchLiveSignals } from '../../src/scripts/data-sources.js';

export const MODES = Object.freeze(['auto', 'require', 'off']);

/**
 * CDC publishes on Fridays for the week ending the previous Saturday, so a
 * current week is 6–13 days old; a holiday slip adds a week. Beyond 21 days the
 * feed has stopped updating.
 */
export const MAX_LIVE_AGE_DAYS = 21;

const DAY_MS = 86_400_000;

/** Whole days between a YYYY-MM-DD week-ending date and `now`. */
export function liveAgeDays(weekEnding, now = new Date()) {
  const t = Date.parse(`${weekEnding}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / DAY_MS) : Infinity;
}

/** Shape a fetchLiveSignals() result as a shippable snapshot (kind: 'live'). */
export function liveSnapshot(live, now = new Date()) {
  return {
    kind: 'live',
    generatedAt: now.toISOString(),
    weekEnding: live.weekEnding,
    sources: live.sources,
    statesWithData: live.statesWithData,
    note:
      'Public-domain CDC surveillance data, fetched when this site was built. ' +
      'Figures are weekly and typically reflect illness from one to two weeks earlier.',
    states: Object.fromEntries(live.signalsByAbbr),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve the snapshot the build renders from.
 * @param {object} opts
 * @param {'auto'|'require'|'off'} [opts.mode]
 * @param {() => object} opts.loadSample returns the bundled sample snapshot
 * @param {Function} [opts.fetchLive] injectable for tests
 * @returns {Promise<{ snapshot: object, live: boolean, reason: string }>}
 */
export async function resolveSnapshot({
  mode = 'auto',
  loadSample,
  fetchLive = fetchLiveSignals,
  now = new Date(),
  attempts = 3,
  backoffMs = [2000, 5000],
  timeoutMs = 60_000,
} = {}) {
  if (!MODES.includes(mode)) {
    throw new Error(`LIVE_PRERENDER must be one of ${MODES.join(', ')} (got "${mode}")`);
  }
  if (mode === 'off') {
    return { snapshot: loadSample(), live: false, reason: 'LIVE_PRERENDER=off' };
  }

  let reason = '';
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(backoffMs[Math.min(i - 1, backoffMs.length - 1)] ?? 0);
    try {
      const live = await fetchLive({ timeoutMs });
      const age = liveAgeDays(live.weekEnding, now);
      if (age > MAX_LIVE_AGE_DAYS) {
        // Not transient: the upstream copy itself is old. Retrying won't help.
        reason = `newest CDC week (${live.weekEnding}) is ${age} days old (limit ${MAX_LIVE_AGE_DAYS})`;
        break;
      }
      return {
        snapshot: liveSnapshot(live, now),
        live: true,
        reason: `week ending ${live.weekEnding}, ${live.statesWithData}/51 states (${live.sources.join('; ')})`,
      };
    } catch (err) {
      reason = err?.message || String(err);
    }
  }

  if (mode === 'require') {
    throw new Error(`Live CDC pre-render is required (LIVE_PRERENDER=require) but unavailable: ${reason}`);
  }
  return { snapshot: loadSample(), live: false, reason };
}
