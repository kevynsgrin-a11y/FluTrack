// ===========================================================================
// FluTrack — Unified Respiratory Threat Level
//
// This module is the analytical core. It converts several independent CDC
// surveillance signals into a single, plain-English "threat level" (0–4) plus
// a per-pathogen breakdown and a directional trend.
//
// Design principles:
//   * Transparent: every threshold below is published on the /methodology page.
//   * Honest: we only ever *describe* the data. No signal here is a diagnosis,
//     prediction, or recommendation.
//   * Defensive: signals are frequently missing for a given state/week. The
//     composite is a weighted average over whatever signals are present, so a
//     partial picture still produces a sensible answer (and we record which
//     signals contributed).
//
// Pure ES module — imported unchanged by the browser app, the Node test suite,
// and the build-time snapshot generator.
// ===========================================================================

/** Ordered severity labels. Index === level (0–4). */
export const SEVERITY_LABELS = ['Minimal', 'Low', 'Moderate', 'High', 'Very High'];

/**
 * Relative weight of each signal in the composite. Wastewater is weighted
 * highest because it typically leads clinical reporting by ~5–7 days; test
 * positivity is weighted lowest because it reflects testing behavior, not
 * population prevalence. Weights are renormalized over the signals actually
 * present for a given state/week.
 */
export const SIGNAL_WEIGHTS = Object.freeze({
  wastewater: 0.3,
  ari: 0.25,
  edVisits: 0.25,
  positivity: 0.2,
});

/**
 * Per-signal breakpoints that separate the five severity levels. A value at or
 * above breakpoint i sits in level i+1. Units documented per signal.
 * These are FluTrack's editorial thresholds, informed by typical seasonal
 * ranges in the underlying CDC products; they are not CDC-defined cut points.
 */
export const BREAKPOINTS = Object.freeze({
  // % of emergency-department visits that are for the given illness.
  edVisits: {
    combined: [2.0, 3.5, 5.5, 8.0],
    influenza: [0.6, 1.5, 3.0, 5.0],
    covid: [0.6, 1.2, 2.2, 3.5],
    rsv: [0.3, 0.8, 1.5, 2.5],
  },
  // % of laboratory tests positive (NREVSS).
  positivity: {
    influenza: [3, 8, 15, 25],
    covid: [4, 8, 14, 20],
    rsv: [2, 5, 10, 15],
  },
  // CDC Wastewater Viral Activity Level (WVAL) numeric index.
  wastewater: [3, 5, 7, 8.5],
});

/** Map a CDC categorical activity label to a 0–4 level. Tolerant of casing. */
export function labelToLevel(label) {
  if (label == null) return null;
  const s = String(label).trim().toLowerCase();
  const table = {
    minimal: 0,
    'very low': 0,
    low: 1,
    moderate: 2,
    medium: 2,
    high: 3,
    'very high': 4,
    'extremely high': 4,
  };
  return s in table ? table[s] : null;
}

/** Clamp a number to [min, max]. */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Bucket a numeric value into a level 0–4 using an array of four breakpoints.
 * Returns null when value is not finite.
 */
export function bucketize(value, breakpoints) {
  if (!Number.isFinite(value)) return null;
  let level = 0;
  for (const b of breakpoints) {
    if (value >= b) level += 1;
  }
  return clamp(level, 0, 4);
}

/**
 * Convert a numeric value to a continuous 0–100 score using its breakpoints as
 * piecewise-linear anchors: 0 → 0, and the four breakpoints map to 20/40/60/80
 * (the lower edges of levels 1–4, matching scoreToLevel's cut points). Values
 * above the top breakpoint ramp toward 100. This produces a smooth composite
 * while staying consistent with the discrete level buckets.
 */
export function scoreFromBreakpoints(value, breakpoints) {
  if (!Number.isFinite(value)) return null;
  const anchors = [0, ...breakpoints];
  const scoreAnchors = [0, 20, 40, 60, 80];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const lo = anchors[i];
    const hi = anchors[i + 1];
    if (value <= hi) {
      const t = hi === lo ? 0 : (value - lo) / (hi - lo);
      return clamp(scoreAnchors[i] + t * (scoreAnchors[i + 1] - scoreAnchors[i]), 0, 100);
    }
  }
  // Above the top breakpoint: ramp 80 → 100 over one more breakpoint-width.
  const top = breakpoints[breakpoints.length - 1];
  const width = top - breakpoints[breakpoints.length - 2] || top || 1;
  const over = (value - top) / width;
  return clamp(80 + over * 20, 0, 100);
}

/** Convert a level (0–4) to a representative 0–100 score (bucket midpoint). */
export function levelToScore(level) {
  const mid = [10, 30, 50, 70, 90];
  return mid[clamp(Math.round(level), 0, 4)];
}

/** Convert a composite 0–100 score to a 0–4 level. */
export function scoreToLevel(score) {
  if (!Number.isFinite(score)) return null;
  if (score < 20) return 0;
  if (score < 40) return 1;
  if (score < 60) return 2;
  if (score < 80) return 3;
  return 4;
}

/** Human-readable label for a 0–4 level. */
export function levelLabel(level) {
  return SEVERITY_LABELS[clamp(Math.round(level), 0, 4)] ?? 'Unknown';
}

/**
 * Compute a directional trend from a chronological numeric series (oldest →
 * newest). Compares the latest value against the mean of the prior up-to-3
 * points. Returns direction and a rounded percent change.
 */
export function computeTrend(series) {
  const clean = (series || []).filter((n) => Number.isFinite(n));
  if (clean.length < 2) return { direction: 'flat', changePct: 0, label: 'Not enough data' };
  const latest = clean[clean.length - 1];
  const prior = clean.slice(Math.max(0, clean.length - 4), clean.length - 1);
  const base = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (base === 0) {
    const dir = latest > 0 ? 'up' : 'flat';
    return { direction: dir, changePct: latest > 0 ? 100 : 0, label: trendLabel(dir) };
  }
  // Clamp the reported change: a tiny off-season base (e.g. 0.05% → 0.3%) would
  // otherwise yield an absurd, alarming figure. Direction is still detected; the
  // headline number stays within a believable band.
  const changePct = clamp(Math.round(((latest - base) / base) * 100), -200, 200);
  let direction = 'flat';
  if (changePct >= 8) direction = 'up';
  else if (changePct <= -8) direction = 'down';
  return { direction, changePct, label: trendLabel(direction) };
}

function trendLabel(direction) {
  return { up: 'Rising', down: 'Falling', flat: 'Holding steady' }[direction];
}

/**
 * Score a single pathogen from its available signals.
 * @param {object} p - { edPercentSeries, positivitySeries, wastewaterSeries } —
 *   each a chronological array of numbers (may be undefined/empty).
 * @param {string} pathogen - 'influenza' | 'covid' | 'rsv'
 */
export function scorePathogen(pathogen, p = {}) {
  const parts = [];
  const latest = (arr) => {
    const c = (arr || []).filter((n) => Number.isFinite(n));
    return c.length ? c[c.length - 1] : null;
  };

  const ed = latest(p.edPercentSeries);
  if (ed != null && BREAKPOINTS.edVisits[pathogen]) {
    parts.push({ key: 'edVisits', score: scoreFromBreakpoints(ed, BREAKPOINTS.edVisits[pathogen]) });
  }
  const pos = latest(p.positivitySeries);
  if (pos != null && BREAKPOINTS.positivity[pathogen]) {
    parts.push({ key: 'positivity', score: scoreFromBreakpoints(pos, BREAKPOINTS.positivity[pathogen]) });
  }
  const ww = latest(p.wastewaterSeries);
  if (ww != null) {
    parts.push({ key: 'wastewater', score: scoreFromBreakpoints(ww, BREAKPOINTS.wastewater) });
  }

  if (!parts.length) {
    return { pathogen, score: null, level: null, label: 'No data', trend: computeTrend([]), contributors: [] };
  }

  let weightSum = 0;
  let acc = 0;
  for (const part of parts) {
    const w = SIGNAL_WEIGHTS[part.key] ?? 0.25;
    acc += part.score * w;
    weightSum += w;
  }
  const score = acc / weightSum;
  const level = scoreToLevel(score);

  // Trend derived from the richest available series (prefer ED, then WW, pos).
  const trendSeries = pick(p.edPercentSeries, p.wastewaterSeries, p.positivitySeries);
  return {
    pathogen,
    score: Math.round(score),
    level,
    label: levelLabel(level),
    trend: computeTrend(trendSeries),
    contributors: parts.map((x) => x.key),
  };
}

function pick(...arrays) {
  for (const a of arrays) {
    if (a && a.filter((n) => Number.isFinite(n)).length >= 2) return a;
  }
  return arrays.find((a) => a && a.length) || [];
}

/**
 * Build the composite state-level threat model from normalized signals.
 *
 * @param {object} signals - {
 *   ariLevel:            0–4 (from NSSP ARI activity label) | null,
 *   edCombinedSeries:    number[] (% combined ARI ED visits) | undefined,
 *   wastewaterSeries:    number[] (WVAL index) | undefined,
 *   positivityCombined:  number (mean % positivity across pathogens) | null,
 *   pathogens: { influenza:{...}, covid:{...}, rsv:{...} }  // scorePathogen inputs
 * }
 * @returns composite model consumed by the UI.
 */
export function buildThreatModel(signals = {}) {
  const parts = [];

  if (Number.isFinite(signals.ariLevel)) {
    parts.push({ key: 'ari', score: levelToScore(signals.ariLevel) });
  }
  const edLatest = lastFinite(signals.edCombinedSeries);
  if (edLatest != null) {
    parts.push({ key: 'edVisits', score: scoreFromBreakpoints(edLatest, BREAKPOINTS.edVisits.combined) });
  }
  const wwLatest = lastFinite(signals.wastewaterSeries);
  if (wwLatest != null) {
    parts.push({ key: 'wastewater', score: scoreFromBreakpoints(wwLatest, BREAKPOINTS.wastewater) });
  }
  if (Number.isFinite(signals.positivityCombined)) {
    // Treat the mean positivity with the influenza breakpoints as a general proxy.
    parts.push({ key: 'positivity', score: scoreFromBreakpoints(signals.positivityCombined, BREAKPOINTS.positivity.influenza) });
  }

  const pathogens = {};
  for (const name of ['influenza', 'covid', 'rsv']) {
    pathogens[name] = scorePathogen(name, (signals.pathogens || {})[name] || {});
  }

  let composite = null;
  let level = null;
  const contributors = [];
  if (parts.length) {
    let weightSum = 0;
    let acc = 0;
    for (const part of parts) {
      const w = SIGNAL_WEIGHTS[part.key] ?? 0.25;
      acc += part.score * w;
      weightSum += w;
      contributors.push(part.key);
    }
    composite = Math.round(acc / weightSum);
    level = scoreToLevel(composite);
  }

  const trendSeries = pick(signals.edCombinedSeries, signals.wastewaterSeries);
  return {
    composite,
    level,
    label: level == null ? 'No data' : levelLabel(level),
    trend: computeTrend(trendSeries),
    pathogens,
    contributors,
  };
}

function lastFinite(arr) {
  const c = (arr || []).filter((n) => Number.isFinite(n));
  return c.length ? c[c.length - 1] : null;
}
