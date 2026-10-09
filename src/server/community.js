// ===========================================================================
// Community-report summary rules. Server-side only, and the single place that
// decides what a visitor may be shown about other people's reports.
//
//   n < 5            suppressed: no counts at all, not even "n = 3"
//   5 <= n < 20      n is shown, with "too few to compare"
//   n >= 20          the share of reports that meet the ILI definition
//   "Elevated community reports"
//                    ONLY when n >= 30 AND that share is at least twice the
//                    trailing 4-week baseline (county, else state) and the
//                    baseline itself rests on >= 20 reports and is above zero
//
// Quarantined reports never reach these numbers (the aggregates exclude them).
// Community data is a labeled, unverified, secondary signal: it can never
// change the official level, and the word "outbreak" is never emitted —
// assertNoOutbreak() is the runtime backstop and a test enforces it.
// ===========================================================================

export const MIN_N = 5;
export const MIN_N_FOR_PCT = 20;
export const MIN_N_FOR_ELEVATED = 30;
export const MIN_BASELINE_N = 20;
export const ELEVATED_RATIO = 2;
export const WINDOW_DAYS = 7;
export const BASELINE_DAYS = 28;

const round1 = (n) => Math.round(n * 10) / 10;

/** Share (0–100, one decimal) of reports meeting the ILI definition, or null. */
export function pctIli(n, nIli) {
  return n > 0 ? round1((nIli / n) * 100) : null;
}

/**
 * Pick the comparison baseline: the county's trailing four weeks when it has
 * enough reports to mean something, else the state's. Returns { pct, scope } or
 * null when neither is usable.
 */
export function chooseBaseline(county, state) {
  const usable = (b) => b && b.n >= MIN_BASELINE_N && Number.isFinite(pctIli(b.n, b.n_ili));
  if (usable(county)) return { pct: pctIli(county.n, county.n_ili), scope: 'county' };
  if (usable(state)) return { pct: pctIli(state.n, state.n_ili), scope: 'state' };
  return null;
}

/**
 * The community block for an area.
 * @param {{ n, n_ili, n_pos_flu, n_pos_covid }} current   last WINDOW_DAYS, non-quarantined
 * @param {{ pct, scope } | null} baseline                 from chooseBaseline()
 * @param {string} areaName                                e.g. "San Diego County"
 */
export function communitySummary(current, baseline, areaName = 'your county') {
  const n = Math.max(0, Number(current?.n) || 0);
  const nIli = Math.max(0, Number(current?.n_ili) || 0);
  const base = {
    window_days: WINDOW_DAYS,
    verified: false,
    note: 'Community reports — self-reported and not verified. They never change the CDC-based level.',
  };

  if (n < MIN_N) {
    return {
      ...base,
      suppressed: true,
      n: null,
      pct_ili: null,
      n_pos_flu: null,
      n_pos_covid: null,
      badge: 'Fewer than 5 reports',
      label: `Fewer than 5 reports this week — be one of the first in ${areaName}.`,
      elevated: false,
    };
  }

  const shared = {
    ...base,
    suppressed: false,
    n,
    n_pos_flu: Math.max(0, Number(current.n_pos_flu) || 0),
    n_pos_covid: Math.max(0, Number(current.n_pos_covid) || 0),
  };

  if (n < MIN_N_FOR_PCT) {
    return {
      ...shared,
      pct_ili: null,
      badge: `Community signal · n=${n}`,
      label: `${n} reports this week — too few to compare.`,
      elevated: false,
    };
  }

  const pct = pctIli(n, nIli);
  const elevated = isElevated(n, pct, baseline);
  return {
    ...shared,
    pct_ili: pct,
    baseline_pct: baseline ? baseline.pct : null,
    baseline_scope: baseline ? baseline.scope : null,
    badge: elevated ? 'Elevated community reports' : `Community signal · n=${n}`,
    label: elevated
      ? `${pct}% of ${n} reports this week describe flu-like illness — at least twice the usual share for this ${baseline.scope}.`
      : `${pct}% of ${n} reports this week describe flu-like illness.`,
    elevated,
  };
}

/** The "Elevated community reports" rule, in one place. */
export function isElevated(n, pct, baseline) {
  return (
    n >= MIN_N_FOR_ELEVATED &&
    Number.isFinite(pct) &&
    Boolean(baseline) &&
    Number.isFinite(baseline.pct) &&
    baseline.pct > 0 &&
    pct >= ELEVATED_RATIO * baseline.pct
  );
}

/**
 * Runtime backstop: community output must never call anything an outbreak.
 * Returns the object unchanged, or a neutral replacement if the word slipped in.
 */
export function assertNoOutbreak(community) {
  if (/outbreak/i.test(JSON.stringify(community))) {
    return {
      ...community,
      badge: community.suppressed ? 'Fewer than 5 reports' : 'Community signal',
      label: 'Community reports — self-reported and not verified.',
    };
  }
  return community;
}
