// ===========================================================================
// Snapshot generator — builds the bundled illustrative sample dataset.
//
// IMPORTANT: This is deterministic, clearly-labeled SAMPLE data, not real
// surveillance. It exists so the site renders instantly and works offline while
// the live CDC feed loads in the visitor's browser. The UI always labels it as
// sample data until a live refresh succeeds.
//
// The scenario models a plausible mid-July 2026 (off-season) picture: minimal
// influenza and RSV, with a modest regional COVID-19 summer uptick — consistent
// with the well-documented late-summer SARS-CoV-2 waves. This keeps the
// illustrative default honest rather than implying a fake winter surge.
// ===========================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { states } from './states.mjs';

const AS_OF = process.env.SNAPSHOT_AS_OF || '2026-07-11'; // most recent Friday
const WEEKS = 12;

/** Deterministic PRNG (mulberry32) so builds are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate the list of ISO week-ending dates (oldest → newest). */
function weekList(asOf, count) {
  const end = new Date(`${asOf}T00:00:00Z`);
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Build a gently trending series toward a target latest value, with mild noise.
 * @param rand PRNG
 * @param latest target most-recent value
 * @param slope fractional rise over the window (0.4 = ends ~40% above start)
 */
function series(rand, latest, slope, floor = 0) {
  const start = latest / (1 + slope);
  const out = [];
  for (let i = 0; i < WEEKS; i += 1) {
    const t = i / (WEEKS - 1);
    const base = start + (latest - start) * t;
    const noise = 1 + (rand() - 0.5) * 0.18;
    out.push(round(Math.max(floor, base * noise)));
  }
  // Pin the final point to the intended latest for a clean headline number.
  out[WEEKS - 1] = round(Math.max(floor, latest));
  return out;
}

export function generateSnapshot() {
  const weeks = weekList(AS_OF, WEEKS);
  const out = {
    kind: 'sample',
    generatedAt: `${AS_OF}T12:00:00Z`,
    weekEnding: AS_OF,
    scenario: 'Off-season (mid-July) baseline with a regional COVID-19 summer uptick',
    note:
      'Illustrative sample data for demonstration only — not real-time CDC ' +
      'surveillance. The live feed loads in your browser and replaces this.',
    season: { label: '2026–2027 respiratory season', startsISO: '2026-10-04', endsISO: '2027-05-22' },
    weeks,
    states: {},
  };

  for (const st of states) {
    const rand = rng(parseInt(st.fips, 10) * 2654435761);
    // Regional COVID summer intensity: higher in the South (HHS 4, 6) & parts
    // of the Midwest/Southwest, per typical late-summer wave geography.
    const hotRegion = [4, 6, 9].includes(st.hhsRegion);
    const warmRegion = [7, 8, 5].includes(st.hhsRegion);
    const covidBase = hotRegion ? 2.1 : warmRegion ? 1.5 : 1.0;
    const covidLatest = round(covidBase + rand() * 0.9); // ~1.0–3.0% of ED visits
    const fluLatest = round(0.1 + rand() * 0.3); // minimal off-season
    const rsvLatest = round(0.1 + rand() * 0.2);
    const otherResp = round(1.2 + rand() * 0.8); // colds, etc.
    const combinedLatest = round(covidLatest + fluLatest + rsvLatest + otherResp);

    // Wastewater WVAL — COVID-driven this time of year.
    const wwCovid = round(covidBase + 1 + rand() * 2.5); // ~2.5–6 index
    const wwCombined = round(wwCovid + rand() * 1.0);

    // Composite ARI activity level: mostly Minimal/Low, occasionally Moderate.
    const ariLevel = covidLatest > 2.6 ? 2 : covidLatest > 1.8 ? 1 : 0;

    out.states[st.abbr] = {
      weekEnding: AS_OF,
      ariLevel,
      edCombinedSeries: series(rand, combinedLatest, 0.28, 0.5),
      wastewaterSeries: series(rand, wwCombined, 0.5, 0),
      positivityCombined: round(6 + covidBase * 2 + rand() * 3), // ~8–14%
      pathogens: {
        influenza: {
          edPercentSeries: series(rand, fluLatest, 0.1, 0),
          wastewaterSeries: series(rand, round(1 + rand()), 0.05, 0),
          positivitySeries: series(rand, round(1 + rand() * 2), 0.05, 0),
        },
        covid: {
          edPercentSeries: series(rand, covidLatest, 0.55, 0),
          wastewaterSeries: series(rand, wwCovid, 0.6, 0),
          positivitySeries: series(rand, round(8 + covidBase * 2 + rand() * 4), 0.5, 0),
        },
        rsv: {
          edPercentSeries: series(rand, rsvLatest, 0.05, 0),
          wastewaterSeries: series(rand, round(0.8 + rand()), 0.03, 0),
          positivitySeries: series(rand, round(1 + rand() * 1.5), 0.03, 0),
        },
      },
    };
  }

  return out;
}

// Allow running directly: `node build/lib/snapshot.mjs` writes src/data/snapshot.json
if (import.meta.url === `file://${process.argv[1]}`) {
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, '../../src/data/snapshot.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(generateSnapshot(), null, 2));
  console.log(`Wrote snapshot → ${outPath}`);
}
