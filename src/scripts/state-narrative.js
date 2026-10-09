// One evidence-qualified narrative for the static report and browser refresh.
import { escapeHtml, formatDate } from './util.js';
import { readingStatus, observationWeek, MEASUREMENT_NAMES, TREND_COMPARISON, relativeTrendChange, trendChangeText } from './reading-provenance.js';

const VIRUSES = { influenza: 'Flu', covid: 'COVID-19', rsv: 'RSV' };
const SIGNAL_NAMES = {
  edVisits: 'emergency-department visit percentages (NSSP)',
  wastewater: 'wastewater viral activity (NWSS)',
  ari: 'the Acute Respiratory Illness activity rating (NSSP)',
  positivity: 'laboratory test positivity',
};
const join = (items) => items.length < 2 ? (items[0] || '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const knownTrend = (trend) => ['up', 'down', 'flat'].includes(trend?.direction) && Number.isFinite(trend.changePct) && !/^Not enough/.test(trend.label || '');
const direction = (trend) => ({ up: 'rising', down: 'falling', flat: 'holding steady' }[trend?.direction]);

export function stateReadingSummary(state, model, weekEnding, provenance = {}) {
  const status = readingStatus(model, { ...provenance, weekEnding });
  const week = observationWeek(model, { ...provenance, weekEnding });
  const period = week ? `observations ending ${formatDate(week)}` : 'observations with an unknown period';
  if (status === 'sample') return `This is an illustrative sample for ${state.name}, not observed health conditions. Sample inputs do not establish a current level or trend.`;
  if (status === 'stale') return `Historical ${period} are shown for ${state.name}. They do not establish current health conditions or a current trend.`;
  if (status === 'missing') return `No usable combined respiratory index is available for ${state.name}. Missing data does not mean no illness.`;
  if (status !== 'live') return `The provenance of this ${state.name} reading is not verified. It does not establish current health conditions.`;
  return `For ${period}, the FluTrack combined respiratory index for ${state.name} was ${model.label}. It summarizes the available surveillance inputs; pathogen-specific readings may be missing. It is not a case count or an influenza-only level.`;
}

export function weekInBriefContent(state, model, weekEnding, provenance = {}) {
  const context = { ...provenance, weekEnding };
  const status = readingStatus(model, context);
  const bullets = [`<li>${escapeHtml(stateReadingSummary(state, model, weekEnding, provenance))}</li>`];
  if (status === 'live') {
    const trend = model.trend;
    if (knownTrend(trend)) {
      const metric = MEASUREMENT_NAMES[trend.source] || 'the available surveillance measurement';
      const change = trend.direction === 'flat' && !trend.zeroBaseline ? '' : ` (${trendChangeText(trend)})`;
      bullets.push(`<li>The trend in ${escapeHtml(metric)} was <strong>${direction(trend)}</strong>${escapeHtml(change)}: ${TREND_COMPARISON}. This comparison describes that measurement, not a percentage change in the combined index.</li>`);
    } else {
      bullets.push('<li>There are not enough comparable observations to determine a trend. An unknown direction is not holding steady.</li>');
    }
    const entries = Object.entries(VIRUSES).map(([key, name]) => ({ key, name, p: model.pathogens?.[key] }))
      .filter(({ p }) => Number.isFinite(p?.level) && readingStatus(p, context) === 'live');
    if (entries.length) {
      const max = Math.max(...entries.map(({ p }) => p.level));
      const highest = entries.filter(({ p }) => p.level === max);
      bullets.push(`<li>Highest available pathogen index: <strong>${escapeHtml(join(highest.map(({ name }) => name)))}</strong> (${escapeHtml(highest[0].p.label)}). Pathogen indices use different measurement thresholds; this does not identify the most infections or the largest contribution to the combined index.</li>`);
    }
    // Compare increases only within the same measurement. Relative changes in
    // wastewater and ED shares are not interchangeable pathogen growth rates.
    const groups = new Map();
    for (const entry of entries) {
      const t = entry.p.trend;
      if (!knownTrend(t) || !t.source || !Number.isFinite(relativeTrendChange(t))) continue;
      const observed = entry.p.provenance?.metrics?.[t.source]?.observations;
      const window = Array.isArray(observed)
        ? observed.filter((o) => Number.isFinite(o.value)).slice(-4).map((o) => o.weekEnding).join('|')
        : `prior-count:${t.priorCount ?? 'unknown'}`;
      const comparison = `${t.source}:${window}`;
      if (!groups.has(comparison)) groups.set(comparison, { source: t.source, entries: [] });
      groups.get(comparison).entries.push(entry);
    }
    for (const { source, entries: group } of groups.values()) {
      const rising = group.filter(({ p }) => p.trend.direction === 'up');
      if (!rising.length) continue;
      const fastest = Math.max(...rising.map(({ p }) => relativeTrendChange(p.trend)));
      const leaders = rising.filter(({ p }) => relativeTrendChange(p.trend) === fastest);
      bullets.push(`<li>Largest relative increase among available series for ${escapeHtml(MEASUREMENT_NAMES[source] || source)} with the same comparison observations: <strong>${escapeHtml(join(leaders.map(({ name }) => name)))}</strong>, ${escapeHtml(trendChangeText(leaders[0].p.trend))}; ${TREND_COMPARISON}. Rankings use the actual uncapped comparisons. Missing, insufficient and zero-baseline series are not ranked.</li>`);
    }
    if (entries.length < 3 || entries.some(({ p }) => !knownTrend(p.trend))) {
      bullets.push('<li>A complete comparison of all three pathogen trends is unavailable. No data does not mean no illness.</li>');
    }
  }
  return `<h2 style="font-size: var(--step-1)">How to read the ${escapeHtml(state.name)} observations</h2>
    <ul class="stack" style="--flow: var(--space-sm); margin-top: var(--space-sm); padding-left: 1.1rem">${bullets.join('')}</ul>`;
}

export function weekInBrief(state, model, weekEnding, provenance = {}) {
  return `<div class="card" style="margin-block: var(--space-lg)" data-region="week-in-brief">${weekInBriefContent(state, model, weekEnding, provenance)}</div>`;
}

export function stateIntro(state, neighbors = [], model = {}, signals = {}, provenance = {}) {
  const status = readingStatus(model, provenance);
  const keys = model.contributors || [];
  const sources = keys.map((key) => SIGNAL_NAMES[key]).filter(Boolean);
  const basis = status === 'sample'
    ? `The illustrated combined respiratory index uses sample inputs${sources.length ? ` for ${join(sources)}` : ''}. Laboratory positivity in the sample is modeled, not a live NREVSS feed.`
    : status === 'unverified'
      ? 'The provenance of these index inputs is unverified. They do not establish a health level or trend. Laboratory positivity has no implemented live adapter.'
    : sources.length
      ? `This combined respiratory index uses the contributing readings for ${join(sources)}. Laboratory positivity has no live adapter and does not contribute to this live reading.`
      : 'No usable contributing surveillance signals are available for this combined respiratory index. No data does not mean no illness.';
  const names = neighbors.slice(0, 4).map(({ name }) => name);
  return `${basis} Each metric retains its own observation period and availability; a download date does not describe health conditions on that day.${names.length ? ` You can also compare regional states such as ${join(names)}.` : ''}`;
}

export function stateDescription(state, model, signals, weekEnding, provenance = {}) {
  return stateReadingSummary(state, model, weekEnding, provenance);
}

export function stateFaqs(state, model, signals, weekEnding, provenance = {}) {
  return [
    { q: `What does the ${state.name} respiratory index show?`, a: `<p>${escapeHtml(stateReadingSummary(state, model, weekEnding, provenance))}</p>` },
    { q: `How is the ${state.name} trend compared?`, a: `<p>The trend compares the latest available observation with the mean of up to three prior observations of the same measurement. With one prior observation it is a two-observation comparison; with more it is not an ordinary week-over-week change. Insufficient history is unknown, not stable. A zero prior mean has no defined percentage change and is excluded from relative-growth rankings. Capped percentages are labeled and distinguished from the actual comparison. The measurement and dates are shown with the reading.</p>` },
    { q: `Where does this ${state.name} data come from?`, a: `<p>${escapeHtml(stateIntro(state, [], model, signals, provenance))} See our <a href="/methodology/">methodology</a> and <a href="/data-sources/">data sources</a>.</p>` },
    { q: `How current are the ${state.name} observations?`, a: '<p>The observation period, source update or publication date when supplied, and retrieval time have different meanings. Weekly publication can describe earlier observation periods; delays and revisions vary by surveillance system. A recent build or retrieval does not establish today’s conditions. Missing, stale or sample data cannot establish a current trend.</p>' },
    { q: 'Is this medical advice?', a: '<p>No. FluTrack is an independent data-visualization utility and is not affiliated with the CDC. It does not diagnose illness or measure personal risk. For guidance about your health, consult a qualified provider.</p>' },
  ];
}

/** Visible, per-metric date and coverage evidence; unknown dates stay unknown. */
export function sourceEvidence(signals = {}, model = {}, provenance = {}) {
  const p = { ...provenance, ...model.provenance, ...signals.provenance };
  const metrics = p.metrics || {};
  const iowaNsspGap = p.geography?.abbr === 'IA' && readingStatus(model, provenance) !== 'sample' &&
    ['edVisits', 'ari'].some((key) => ['missing', 'unavailable', 'stale'].includes(metrics[key]?.status));
  const gapNote = iowaNsspGap
    ? `<p class="text-secondary" data-source-gap="iowa-nssp">Iowa surveillance gap: <a href="https://www.cdc.gov/respiratory-viruses/data/activity-levels.html">CDC's activity-level data notes, updated October 2, 2026</a>, report that Iowa's NSSP feed ended on May 6, 2026 after a change in health information exchange vendors. Data through the week ending May 2, 2026 were retained; data and levels for weeks ending May 9, 2026 onward are unavailable. This reporting gap does not mean no illness in Iowa.</p>`
    : '';
  const rows = Object.keys(SIGNAL_NAMES).map((key) => {
    const metric = metrics[key] || {};
    const contributes = model.contributors?.includes(key);
    const status = metric.status || (contributes ? (readingStatus(model, provenance) === 'sample' ? 'sample' : 'available') : key === 'positivity' ? 'unavailable' : 'missing');
    const period = metric.observationPeriod || {};
    const start = period.start || period.startDate;
    const end = period.end || period.endDate || period.weekEnding;
    const observation = start && end ? `${formatDate(start)} to ${formatDate(end)}` : end ? `Ending ${formatDate(end)}` : 'Not supplied';
    const publication = metric.publicationDate || metric.publishedAt;
    const upstreamUpdate = metric.upstreamUpdatedAt || metric.sourceUpdatedAt;
    const retrieved = metric.retrievedAt;
    const coverage = metric.coverage;
    const coverageParts = [];
    if (coverage?.reportingPathogens) coverageParts.push(`${coverage.reportingPathogens.length}/3 pathogen ED readings`);
    if (coverage?.pathogens) for (const [virus, sites] of Object.entries(coverage.pathogens)) {
      coverageParts.push(`${VIRUSES[virus] || virus}: ${sites.reportingSites ?? 'unknown'} included sites; ${sites.eligibleSites ?? 'unknown'} eligible sites; minimum ${sites.minimumSites ?? 3}`);
    }
    if (Number.isFinite(coverage?.reportedObservations)) coverageParts.push(`${coverage.reportedObservations} usable observations`);
    if (Number.isFinite(coverage?.contributingJurisdictions)) coverageParts.push(`${coverage.contributingJurisdictions}/${coverage.totalJurisdictions || 51} jurisdictions`);
    const coverageText = coverageParts.join('; ');
    return `<tr><th scope="row">${escapeHtml(SIGNAL_NAMES[key])}</th><td>${escapeHtml(status)}${contributes ? ' · contributes' : ' · does not contribute'}</td><td>${escapeHtml(observation)}</td><td>${escapeHtml(publication || 'Not supplied')}</td><td>${escapeHtml(upstreamUpdate || 'Not supplied')}</td><td>${escapeHtml(retrieved || 'Not supplied')}${metric.cacheStale ? ' · warm copy past cache TTL' : ''}${metric.requestRetrievedAt ? `; app request ${escapeHtml(metric.requestRetrievedAt)}` : ''}</td><td>${escapeHtml(coverageText || 'Not supplied')}; population coverage not supplied</td></tr>`;
  });
  return `<h3>Source periods and coverage</h3><p class="text-secondary">Source update, publication and retrieval dates do not replace the observation period. “Not supplied” is an unresolved metadata gap. Cache age is separate from observation age.</p>${gapNote}<div style="overflow-x:auto"><table><thead><tr><th>Measurement</th><th>Availability</th><th>Observation period</th><th>Publication</th><th>Upstream update</th><th>Retrieved</th><th>Coverage</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
