// ===========================================================================
// Live snapshot generator — builds src/data/snapshot.json from real CDC data.
//
// This is the companion to snapshot.mjs. That module produces deterministic
// SAMPLE data so the site renders instantly; this one produces the real thing,
// in exactly the same shape, so it is a drop-in replacement committed to the
// repository and picked up by the ordinary build.
//
// Why generate at refresh time rather than fetch during the page build: the
// build stays offline, deterministic and reproducible, the data that shipped is
// auditable in git history, and a failed upstream fetch can never produce a
// half-built site. The scheduled workflow runs this, runs the full verify, and
// only then proposes the result.
//
// It reuses src/scripts/data-sources.js unchanged, so the browser refresh and
// this generator cannot drift apart: both go through fetchLiveSignals and both
// are subject to the same MIN_LIVE_STATES / ISO-week / staleness gate.
// ===========================================================================

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { states } from './states.mjs';
import { fetchLiveSignals, hasUsableSignal } from '../../src/scripts/data-sources.js';

/** A state the refresh could not fill renders as no data, never as sample numbers. */
function emptyState(weekEnding) {
  const noPathogen = { edPercentSeries: [], wastewaterSeries: [], positivitySeries: [] };
  return {
    weekEnding,
    ariLevel: null,
    edCombinedSeries: [],
    wastewaterSeries: [],
    positivityCombined: null,
    pathogens: { influenza: { ...noPathogen }, covid: { ...noPathogen }, rsv: { ...noPathogen } },
  };
}

/**
 * Fetch live CDC signals and return a snapshot-shaped object.
 * Throws if the refresh does not clear the gate in fetchLiveSignals, so a
 * caller can distinguish "no real data available" from "real data is bad".
 */
export async function generateLiveSnapshot({ timeoutMs = 60000, now = new Date() } = {}) {
  const live = await fetchLiveSignals({ timeoutMs });

  const out = {
    kind: 'live',
    generatedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    weekEnding: live.weekEnding,
    sources: live.sources,
    liveStateCount: live.liveStateCount,
    weeks: [],
    states: {},
  };

  // Carry season metadata from the committed snapshot rather than restating it,
  // so there is exactly one place that defines the season window.
  const here = dirname(fileURLToPath(import.meta.url));
  const existing = resolve(here, '../../src/data/snapshot.json');
  if (existsSync(existing)) {
    try {
      const prev = JSON.parse(readFileSync(existing, 'utf8'));
      if (prev.season) out.season = prev.season;
    } catch {
      /* a malformed previous snapshot must not block a refresh */
    }
  }

  const weeks = new Set();
  for (const st of states) {
    const sig = live.signalsByAbbr.get(st.abbr);
    if (!sig || !hasUsableSignal(sig)) {
      out.states[st.abbr] = emptyState(live.weekEnding);
      continue;
    }
    out.states[st.abbr] = {
      weekEnding: sig.weekEnding || live.weekEnding,
      ariLevel: sig.ariLevel,
      edCombinedSeries: sig.edCombinedSeries,
      wastewaterSeries: sig.wastewaterSeries,
      // NREVSS test positivity is not queried by any code path, so it is
      // genuinely absent from a live refresh. render.js and threat-index.js
      // both key on Number.isFinite, so the row is omitted and the index
      // re-weights over the signals that are present.
      positivityCombined: null,
      pathogens: sig.pathogens,
    };
    if (sig.weekEnding) weeks.add(sig.weekEnding);
  }
  out.weeks = [...weeks].sort();

  return out;
}

// Allow running directly: `node build/lib/live-snapshot.mjs` writes src/data/snapshot.json
if (import.meta.url === `file://${process.argv[1]}`) {
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, '../../src/data/snapshot.json');
  try {
    const snap = await generateLiveSnapshot();
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(snap, null, 2));
    const filled = Object.values(snap.states).filter((s) => s.ariLevel != null || s.edCombinedSeries.length).length;
    console.log(
      `Wrote LIVE snapshot → ${outPath}\n` +
        `  weekEnding ${snap.weekEnding} · ${filled}/${states.length} states filled · sources: ${snap.sources.join(', ')}`
    );
  } catch (e) {
    console.error(`Live refresh refused: ${e.message}`);
    console.error('src/data/snapshot.json left unchanged.');
    process.exit(1);
  }
}
