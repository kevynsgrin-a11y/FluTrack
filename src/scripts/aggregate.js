// An unweighted rollup of available state readings, not a CDC national estimate.
// Live histories align by observation period and track the actual state cohort.
import { MIN_LIVE_STATES } from './data-sources.js';

const COMPOSITE_FIELDS = { edVisits: 'edCombinedSeries', wastewater: 'wastewaterSeries', ari: 'ariLevel', positivity: 'positivityCombined' };
const PATHOGEN_FIELDS = { edVisits: 'edPercentSeries', wastewater: 'wastewaterSeries', positivity: 'positivitySeries' };

const mean = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
};
const round = (value) => Math.round(value * 100) / 100;
const latest = (signal, field) => {
  const value = signal[field];
  return Array.isArray(value) ? value.at(-1) : value;
};

function available(signal, key) {
  const metric = signal.provenance?.metrics?.[key];
  return signal.provenance?.kind !== 'unknown' && metric?.kind !== 'unknown' &&
    !['missing', 'unavailable', 'stale'].includes(signal.provenance?.status) &&
    (!metric || (metric.status === 'available' && metric.contributes !== false));
}

// Only illustrative/legacy undated bundles use positional averaging. A live
// reading without dated history retains its latest value, with no trend claim.
function meanSeries(list) {
  const arrays = list.filter((series) => Array.isArray(series) && series.length);
  const length = arrays.length ? Math.max(...arrays.map((series) => series.length)) : 0;
  return Array.from({ length }, (_, i) => {
    const value = mean(arrays.map((series) => series[series.length - length + i]));
    return value == null ? NaN : round(value);
  });
}

function aggregateMetric(entries, key, field, weekEnding, live = false) {
  const readings = entries.filter(({ signal }) => {
    const metric = signal.provenance?.metrics?.[key];
    const metricWeek = metric?.observationPeriod?.weekEnding || signal.weekEnding;
    const verifiedKind = (kind) => !kind || kind === 'live';
    return (!live || (verifiedKind(signal.provenance?.kind) && verifiedKind(metric?.kind))) &&
      available(signal, key) && Number.isFinite(latest(signal, field)) && (!metricWeek || metricWeek === weekEnding);
  });
  const weeks = [...new Set(readings.flatMap(({ signal }) => {
    const dated = signal.provenance?.metrics?.[key]?.observations;
    return Array.isArray(dated) ? dated.map((observation) => observation.weekEnding).filter((week) => week && week <= weekEnding) : [weekEnding].filter(Boolean);
  }))].sort();
  if (readings.length && weekEnding && !weeks.includes(weekEnding)) weeks.push(weekEnding);
  const cohorts = new Map();
  const observations = weeks.map((week) => {
    const contributions = readings.flatMap((entry) => {
      const dated = entry.signal.provenance?.metrics?.[key]?.observations;
      const value = Array.isArray(dated)
        ? dated.find((observation) => observation.weekEnding === week)?.value
        : week === weekEnding ? latest(entry.signal, field) : null;
      return Number.isFinite(value) ? [{ ...entry, value }] : [];
    });
    cohorts.set(week, contributions.map((entry) => entry.identity).sort());
    const value = mean(contributions.map((entry) => entry.value));
    return { weekEnding: week, value: value == null ? null : round(value),
      contributingJurisdictions: contributions.length,
      contributingAbbrs: contributions.map((entry) => entry.abbr).filter(Boolean).sort() };
  });
  const current = observations.find((observation) => observation.weekEnding === weekEnding);
  const hasData = Number.isFinite(current?.value);
  // The model uses the latest and up to three previous finite observations.
  // Equal counts are insufficient: a different set of states can change a mean.
  const comparison = observations.filter((observation) => Number.isFinite(observation.value)).slice(-4);
  const cohort = comparison.at(-1) && cohorts.get(comparison.at(-1).weekEnding).join('|');
  const comparableHistory = comparison.length >= 2 && comparison.every((observation) => cohorts.get(observation.weekEnding).join('|') === cohort);
  const sourceMetrics = readings.map(({ signal }) => signal.provenance?.metrics?.[key]).filter(Boolean);
  return {
    series: hasData ? observations.map((observation) => observation.value) : [],
    currentValue: hasData ? current.value : null,
    contributors: hasData ? cohorts.get(weekEnding) : [],
    provenance: {
      status: hasData ? 'available' : key === 'positivity' ? 'unavailable' : 'missing',
      contributes: hasData,
      source: sourceMetrics[0]?.source || null,
      geography: { level: 'available-state-aggregate', country: 'US' },
      observationPeriod: { start: null, end: hasData ? weekEnding : null, weekEnding: hasData ? weekEnding : null },
      publicationDate: null,
      publicationDates: [...new Set(sourceMetrics.flatMap((metric) => metric.publicationDates || [metric.publicationDate]).filter(Boolean))].sort(),
      upstreamUpdatedAt: sourceMetrics.map((metric) => metric.upstreamUpdatedAt).filter(Boolean).sort().at(-1) || null,
      retrievedAt: sourceMetrics.map((metric) => metric.retrievedAt).filter(Boolean).sort().at(-1) || null,
      cacheStale: sourceMetrics.some((metric) => metric.cacheStale),
      coverage: { contributingJurisdictions: current?.contributingJurisdictions || 0, contributingAbbrs: current?.contributingAbbrs || [], totalJurisdictions: 51, populationCoverage: null },
      comparableHistory,
      observations,
    },
  };
}

/** Available-state aggregate; optional context supplies provenance for legacy snapshots. */
export function nationalSignals(signalsList, context = {}) {
  const all = signalsList.filter(Boolean);
  const kind = all.some((signal) => signal.provenance?.kind === 'live') ? 'live'
    : all.some((signal) => signal.provenance?.kind === 'sample') ? 'sample'
    : context.kind || (context.live === true ? 'live' : context.live === false ? 'sample' : 'unknown');
  const live = kind === 'live';
  const eligible = live ? all.filter((signal) => !signal.provenance?.kind || signal.provenance.kind === 'live') : all;
  const weekEnding = eligible.map((signal) => signal.weekEnding).filter(Boolean).sort().at(-1) || eligible[0]?.weekEnding;
  const seen = new Set();
  const entries = eligible.flatMap((signal, index) => {
    if (weekEnding && signal.weekEnding !== weekEnding) return [];
    const abbr = signal.provenance?.geography?.abbr || signal.abbr || null;
    const identity = abbr || `entry:${index}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{ signal, identity, abbr }];
  });
  const components = Object.fromEntries(Object.entries(COMPOSITE_FIELDS).map(([key, field]) => [key, aggregateMetric(entries, key, field, weekEnding, live)]));
  const usableJurisdictions = new Set(Object.values(components).flatMap((component) => component.contributors)).size;
  const provenance = {
    kind,
    ...(live ? { status: usableJurisdictions >= MIN_LIVE_STATES ? 'available' : 'missing', metrics: Object.fromEntries(Object.entries(components).map(([key, component]) => [key, component.provenance])) } : {}),
    geography: { level: 'available-state-aggregate', country: 'US' },
    observationPeriod: { start: null, end: weekEnding || null, weekEnding },
    coverage: { contributingJurisdictions: usableJurisdictions, totalJurisdictions: 51, populationCoverage: null },
    aggregate: { method: 'unweighted mean of available state readings for the same observation period', officialNationalEstimate: false },
  };
  const pathogens = {};
  for (const pathogen of ['influenza', 'covid', 'rsv']) {
    // A missing pathogen never inherits the state's combined numeric signals.
    const pathogenEntries = entries.map((entry) => ({ ...entry, signal: { weekEnding: entry.signal.weekEnding, ...(entry.signal.pathogens?.[pathogen] || {}) } }));
    const metrics = Object.fromEntries(Object.entries(PATHOGEN_FIELDS).map(([key, field]) => [key, aggregateMetric(pathogenEntries, key, field, weekEnding, live)]));
    const count = new Set(Object.values(metrics).flatMap((metric) => metric.contributors)).size;
    pathogens[pathogen] = Object.fromEntries(Object.entries(PATHOGEN_FIELDS).map(([key, field]) => [field,
      live ? metrics[key].series : meanSeries(pathogenEntries.filter(({ signal }) => available(signal, key)).map(({ signal }) => signal[field]))]));
    if (live) pathogens[pathogen].provenance = {
      ...provenance,
      status: count >= MIN_LIVE_STATES ? 'available' : 'missing',
      coverage: { contributingJurisdictions: count, totalJurisdictions: 51, populationCoverage: null },
      metrics: Object.fromEntries(Object.entries(metrics).map(([key, metric]) => [key, metric.provenance])),
    };
  }
  const scalar = (key, field) => live ? components[key].currentValue : mean(entries.filter(({ signal }) => available(signal, key)).map(({ signal }) => signal[field]));
  const series = (key, field) => live ? components[key].series : meanSeries(entries.filter(({ signal }) => available(signal, key)).map(({ signal }) => signal[field]));
  const ari = scalar('ari', 'ariLevel');
  const positivity = scalar('positivity', 'positivityCombined');
  return {
    ariLevel: ari == null ? null : Math.round(ari),
    edCombinedSeries: series('edVisits', 'edCombinedSeries'),
    wastewaterSeries: series('wastewater', 'wastewaterSeries'),
    positivityCombined: positivity == null ? NaN : round(positivity),
    weekEnding,
    pathogens,
    provenance,
  };
}
