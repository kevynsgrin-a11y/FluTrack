// ===========================================================================
// Snapshot generator — builds the bundled illustrative sample dataset.
//
// IMPORTANT: This is deterministic, clearly-labeled SAMPLE data, not real
// surveillance. It exists so the site renders instantly and works offline while
// the live CDC feed loads in the visitor's browser. The UI always labels it as
// sample data until a live refresh succeeds.
//
// The scenario is SEASON-AWARE: it models the off-season/summer-wave regime
// (minimal flu and RSV, a modest regional COVID-19 summer uptick) before the
// season opens, and an early-season climb (flu and RSV rising off their floor
// as COVID-19 eases out of its late-summer wave) once the 2026–27 respiratory
// season starts. This keeps the illustrative default honest in both regimes —
// neither implying a fake winter surge in July nor serving a July off-season
// baseline to search engines in October.
// ===========================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { states } from './states.mjs';

/** Most recent Friday on or before `date` (CDC surveillance publishes Fridays). */
function mostRecentFriday(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(12, 0, 0, 0);
  const dow = d.getUTCDay(); // 0=Sun … 5=Fri, 6=Sat
  const back = (dow + 2) % 7; // Fri→0, Sat→1, Sun→2, …, Thu→6
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const AS_OF = process.env.SNAPSHOT_AS_OF || mostRecentFriday();
const WEEKS = 12;

// Season model for the illustrative sample. The 2026–27 season opens
// 2026-10-04 (see `season` below); the ramp regime starts ~10 days earlier
// (late-September Southern-state uptick) and runs to the winter peak. Before
// the ramp the site stays in the off-season/summer-wave regime.
const SEASON_START = '2026-10-04';
const RAMP_START = '2026-09-25';
const inSeason = AS_OF >= RAMP_START;
const weeksSinceStart = inSeason
  ? Math.max(0, Math.round((Date.parse(`${AS_OF}T00:00:00Z`) - Date.parse(`${SEASON_START}T00:00:00Z`)) / (7 * 86_400_000)))
  : 0;
// How far the early-season climb has progressed (0 = opening week, 1 = ~late Nov).
const climb = Math.min(1, weeksSinceStart / 7);
const seasonLabel = !inSeason
  ? 'Off-season baseline with a regional COVID-19 summer uptick'
  : weeksSinceStart < 5
    ? 'Early 2026–27 respiratory season: flu and RSV beginning their seasonal climb as COVID-19 eases from its late-summer wave'
    : 'Mid 2026–27 respiratory season: flu and RSV climbing toward their winter peak';

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
    scenario: seasonLabel,
    note:
      'Illustrative sample data for demonstration only — not real-time CDC ' +
      'surveillance. The live feed loads in your browser and replaces this.',
    season: { label: '2026–2027 respiratory season', startsISO: '2026-10-04', endsISO: '2027-05-22' },
    weeks,
    states: {},
  };

  for (const st of states) {
    const rand = rng(parseInt(st.fips, 10) * 2654435761);
    // Regional intensity: the South (HHS 4, 6) and parts of the Midwest/
    // Southwest (9) open flu season earliest; cooler regions (5, 7, 8) lag.
    const hotRegion = [4, 6, 9].includes(st.hhsRegion);
    const warmRegion = [7, 8, 5].includes(st.hhsRegion);

    let covidLatest, covidSlope, fluLatest, fluSlope, rsvLatest, wwCovid, wwCovidSlope, fluPos, ariLevel;
    if (!inSeason) {
      // Off-season: summer COVID-19 wave, flu/RSV at floor.
      const covidBase = hotRegion ? 2.1 : warmRegion ? 1.5 : 1.0;
      covidLatest = round(covidBase + rand() * 0.9); // ~1.0–3.0% of ED visits
      covidSlope = 0.55;
      fluLatest = round(0.1 + rand() * 0.3); // minimal off-season
      fluSlope = 0.1;
      rsvLatest = round(0.1 + rand() * 0.2);
      wwCovid = round(covidBase + 1 + rand() * 2.5); // ~2.5–6 index
      wwCovidSlope = 0.6;
      fluPos = round(1 + rand() * 2);
      ariLevel = covidLatest > 2.6 ? 2 : covidLatest > 1.8 ? 1 : 0;
    } else {
      // Early/mid season: flu and RSV climbing off their floor (scaled by how
      // far the season has progressed), COVID-19 easing out of its summer wave.
      const regionalHead = hotRegion ? 1.35 : warmRegion ? 1.0 : 0.8;
      covidLatest = round(Math.max(0.6, (hotRegion ? 2.0 : warmRegion ? 1.6 : 1.2) * (1 - 0.35 * climb) + rand() * 0.5));
      covidSlope = -0.2;
      fluLatest = round((0.5 + rand() * 0.4) * regionalHead * (1 + 2.2 * climb)); // ~0.4–1.3% early Oct
      fluSlope = 0.5;
      rsvLatest = round((0.2 + rand() * 0.2) * regionalHead * (1 + 1.8 * climb));
      wwCovid = round((hotRegion ? 3.5 : 2.6) * (1 - 0.3 * climb) + rand() * 1.2);
      wwCovidSlope = -0.15;
      fluPos = round((2.5 + rand() * 2) * (1 + 1.5 * climb)); // ~2.5–9%
      ariLevel = fluLatest + covidLatest > 3.0 ? 2 : fluLatest + covidLatest > 1.8 ? 1 : 0;
    }
    const otherResp = round(1.2 + rand() * 0.8); // colds, etc.
    const combinedLatest = round(covidLatest + fluLatest + rsvLatest + otherResp);

    // Wastewater WVAL — flu-driven rise in season, COVID tail otherwise.
    const wwFlu = round((1.5 + rand()) * (inSeason ? 1 + 2.5 * climb : 1));
    const wwCombined = round(wwCovid + wwFlu * (inSeason ? 0.8 : 0.2) + rand() * 1.0);

    out.states[st.abbr] = {
      weekEnding: AS_OF,
      ariLevel,
      edCombinedSeries: series(rand, combinedLatest, inSeason ? 0.3 : 0.28, 0.5),
      wastewaterSeries: series(rand, wwCombined, inSeason ? 0.45 : 0.5, 0),
      positivityCombined: round(6 + (inSeason ? fluPos : hotRegion * 2) + rand() * 3),
      pathogens: {
        influenza: {
          edPercentSeries: series(rand, fluLatest, fluSlope, 0),
          wastewaterSeries: series(rand, wwFlu, inSeason ? 0.5 : 0.05, 0),
          positivitySeries: series(rand, fluPos, inSeason ? 0.4 : 0.05, 0),
        },
        covid: {
          edPercentSeries: series(rand, covidLatest, covidSlope, 0),
          wastewaterSeries: series(rand, wwCovid, wwCovidSlope, 0),
          positivitySeries: series(rand, round(8 + (hotRegion ? 2 : 0) + rand() * 4), 0.5, 0),
        },
        rsv: {
          edPercentSeries: series(rand, rsvLatest, inSeason ? 0.35 : 0.05, 0),
          wastewaterSeries: series(rand, round(0.8 + rand()), inSeason ? 0.4 : 0.03, 0),
          positivitySeries: series(rand, round(1 + rand() * 1.5), inSeason ? 0.3 : 0.03, 0),
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
