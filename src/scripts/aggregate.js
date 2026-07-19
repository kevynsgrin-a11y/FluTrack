// ===========================================================================
// National rollup — average state signals into a "United States (overall)"
// bundle. Shared by the build (static default hero) and the app (live refresh).
// ===========================================================================

function meanSeries(listOfSeries) {
  const arrays = listOfSeries.filter((a) => Array.isArray(a) && a.length);
  if (!arrays.length) return [];
  const len = Math.max(...arrays.map((a) => a.length));
  const out = [];
  for (let i = 0; i < len; i += 1) {
    const vals = arrays.map((a) => a[a.length - len + i]).filter((n) => Number.isFinite(n));
    out.push(vals.length ? round(vals.reduce((x, y) => x + y, 0) / vals.length) : NaN);
  }
  return out;
}

function mean(values) {
  const v = values.filter((n) => Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * @param signalsList array of per-state signal bundles.
 * @returns a single aggregate signal bundle shaped like a state's.
 */
export function nationalSignals(signalsList) {
  const list = signalsList.filter(Boolean);
  const pathoKeys = ['influenza', 'covid', 'rsv'];
  const pathogens = {};
  for (const key of pathoKeys) {
    pathogens[key] = {
      edPercentSeries: meanSeries(list.map((s) => s.pathogens?.[key]?.edPercentSeries)),
      wastewaterSeries: meanSeries(list.map((s) => s.pathogens?.[key]?.wastewaterSeries)),
      positivitySeries: meanSeries(list.map((s) => s.pathogens?.[key]?.positivitySeries)),
    };
  }
  const ariMean = mean(list.map((s) => s.ariLevel));
  return {
    ariLevel: ariMean == null ? null : Math.round(ariMean),
    edCombinedSeries: meanSeries(list.map((s) => s.edCombinedSeries)),
    wastewaterSeries: meanSeries(list.map((s) => s.wastewaterSeries)),
    positivityCombined: round(mean(list.map((s) => s.positivityCombined)) ?? NaN),
    weekEnding: list[0]?.weekEnding,
    pathogens,
  };
}
