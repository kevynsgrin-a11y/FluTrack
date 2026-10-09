// ===========================================================================
// State-model assembly — the single bridge between raw signals and the UI.
//
// Wraps the pure scoring in threat-index.js and attaches the sparkline series
// each rendered component needs. Shared by the Node build and the browser app
// so both produce byte-identical markup.
// ===========================================================================

import { buildThreatModel } from './threat-index.js';
import { metricAvailable, resolveProvenance } from './reading-provenance.js';

/**
 * @param signals normalized signal bundle for one state (see data-sources /
 *   snapshot shape): { ariLevel, edCombinedSeries, wastewaterSeries,
 *   positivityCombined, pathogens: { influenza, covid, rsv } }
 * @returns threat model enriched with `_series` on the composite and each pathogen.
 */
export function computeModel(signals = {}, provenance = {}) {
  const usable = usableSignals(signals, provenance);
  const model = buildThreatModel(usable);
  model.provenance = resolveProvenance(signals.provenance, { ...provenance, weekEnding: signals.weekEnding || provenance.weekEnding });

  const compositeSeries = pickSeries(['edVisits', usable.edCombinedSeries], ['wastewater', usable.wastewaterSeries]);
  model._series = compositeSeries.series;
  model.trend.source = compositeSeries.source;
  model.trend.provenance = model.provenance;
  requireComparableHistory(model.trend, model.provenance);

  for (const key of ['influenza', 'covid', 'rsv']) {
    const ps = (usable.pathogens || {})[key] || {};
    if (model.pathogens[key]) {
      const chosen = pickSeries(['edVisits', ps.edPercentSeries], ['wastewater', ps.wastewaterSeries], ['positivity', ps.positivitySeries]);
      const p = model.pathogens[key];
      p._series = chosen.series;
      // A pathogen inherits the geography and period, but not the composite's
      // ARI metadata, jurisdiction coverage or list of source systems.
      p.provenance = resolveProvenance(signals.pathogens?.[key]?.provenance, { ...model.provenance, metrics: {}, coverage: undefined, sources: [] });
      p.provenance.sources = p.contributors.map((metric) => p.provenance.metrics?.[metric]?.source).filter(Boolean);
      p.trend.source = chosen.source;
      p.trend.provenance = p.provenance;
      requireComparableHistory(p.trend, p.provenance);
    }
  }
  return model;
}

function pickSeries(...candidates) {
  for (const [source, series] of candidates) {
    if (Array.isArray(series) && Number.isFinite(series.at(-1)) && series.filter((n) => Number.isFinite(n)).length >= 2) return { source, series };
  }
  const fallback = candidates.find(([, series]) => Array.isArray(series) && Number.isFinite(series.at(-1)));
  return fallback ? { source: fallback[0], series: fallback[1] } : { source: null, series: [] };
}

function usableSignals(signals, context) {
  const usable = { ...signals, pathogens: {} };
  const areaMissing = ['missing', 'unavailable'].includes(signals.provenance?.status);
  for (const [key, field] of [['ari', 'ariLevel'], ['edVisits', 'edCombinedSeries'], ['wastewater', 'wastewaterSeries'], ['positivity', 'positivityCombined']]) {
    if (areaMissing || !metricAvailable(signals, key, context)) usable[field] = field.endsWith('Series') ? [] : null;
  }
  for (const key of ['influenza', 'covid', 'rsv']) {
    const p = signals.pathogens?.[key] || {};
    const pathogenMissing = ['missing', 'unavailable'].includes(p.provenance?.status);
    usable.pathogens[key] = { ...p };
    for (const [metric, field] of [['edVisits', 'edPercentSeries'], ['wastewater', 'wastewaterSeries'], ['positivity', 'positivitySeries']]) {
      if (areaMissing || pathogenMissing || !metricAvailable(p, metric, { ...context, ...signals.provenance, metrics: {} })) usable.pathogens[key][field] = [];
    }
  }
  return usable;
}

function requireComparableHistory(trend, provenance) {
  if (provenance.metrics?.[trend.source]?.comparableHistory === false) {
    Object.assign(trend, { direction: 'unknown', changePct: null, label: 'Not enough comparable data', priorCount: 0, reason: 'changing-coverage' });
  }
}
