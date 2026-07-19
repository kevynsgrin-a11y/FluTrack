// ===========================================================================
// State-model assembly — the single bridge between raw signals and the UI.
//
// Wraps the pure scoring in threat-index.js and attaches the sparkline series
// each rendered component needs. Shared by the Node build and the browser app
// so both produce byte-identical markup.
// ===========================================================================

import { buildThreatModel } from './threat-index.js';

/**
 * @param signals normalized signal bundle for one state (see data-sources /
 *   snapshot shape): { ariLevel, edCombinedSeries, wastewaterSeries,
 *   positivityCombined, pathogens: { influenza, covid, rsv } }
 * @returns threat model enriched with `_series` on the composite and each pathogen.
 */
export function computeModel(signals = {}) {
  const model = buildThreatModel(signals);

  model._series = pickSeries(signals.edCombinedSeries, signals.wastewaterSeries);

  for (const key of ['influenza', 'covid', 'rsv']) {
    const ps = (signals.pathogens || {})[key] || {};
    if (model.pathogens[key]) {
      model.pathogens[key]._series = pickSeries(ps.edPercentSeries, ps.wastewaterSeries, ps.positivitySeries);
    }
  }
  return model;
}

function pickSeries(...candidates) {
  for (const c of candidates) {
    if (Array.isArray(c) && c.filter((n) => Number.isFinite(n)).length >= 2) return c;
  }
  return candidates.find((c) => Array.isArray(c) && c.length) || [];
}
