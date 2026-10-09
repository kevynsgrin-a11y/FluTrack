// ===========================================================================
// Shared render library — pure markup functions for build and live refresh.
// The health-data model and its strings remain unchanged; only the structural
// presentation is rebuilt for the public-health bulletin interface.
// ===========================================================================

import { escapeHtml, formatPct, formatDate } from './util.js';
import { SEVERITY_LABELS, levelLabel } from './threat-index.js';
import { computeModel } from './model.js';
import { MEASUREMENT_NAMES, TREND_COMPARISON, metricAvailable, observationWeek, presentationModel, readingStatus, resolveProvenance, trendChangeText } from './reading-provenance.js';

const PATHOGEN_META = {
  influenza: { name: 'Influenza (Flu)', short: 'Flu' },
  covid: { name: 'COVID-19', short: 'COVID' },
  rsv: { name: 'RSV', short: 'RSV' },
};

const LEVEL_GLYPHS = ['·', '−', '=', '≋', '✚'];
const SIGNAL_NAMES = { edVisits: 'ED-visit share', ari: 'ARI activity category', wastewater: 'wastewater activity index', positivity: 'laboratory test positivity' };

/** Decorative sparkline. The accompanying word and trend shape carry meaning. */
export function sparkline(series, { width = 120, height = 32, direction = 'flat' } = {}) {
  const pts = (series || []).filter((n) => Number.isFinite(n));
  const stroke = direction === 'up' ? 'var(--trend-up)' : direction === 'down' ? 'var(--trend-down)' : 'var(--trend-flat)';
  if (pts.length < 2) return `<svg class="spark" width="${width}" height="${height}" aria-hidden="true"></svg>`;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = width / (pts.length - 1);
  const pad = 3;
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
  const coords = pts.map((v, i) => [i * stepX, y(v)]);
  const line = coords.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`).join(' ');
  const [lx, ly] = coords[coords.length - 1];
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.5" fill="${stroke}"/>
  </svg>`;
}

/** A severity specimen always includes pattern, glyph, word and numeric rank. */
export function levelToken(level, label = '') {
  const valid = Number.isFinite(level);
  const safeLevel = valid ? Math.max(0, Math.min(4, Math.round(level))) : 0;
  const word = label || (valid ? levelLabel(safeLevel) : 'No data');
  const glyph = valid ? LEVEL_GLYPHS[safeLevel] : '—';
  return `<span class="level-token"${valid ? ` data-sev="${safeLevel}"` : ''}>
    <span class="level-token__swatch" aria-hidden="true">${glyph}</span>
    <span class="level-token__word">${escapeHtml(word)}</span>
    ${valid ? `<span class="level-token__index" aria-label="level ${safeLevel}">${safeLevel}</span>` : ''}
  </span>`;
}

/** The gauge uses tick marks and named thresholds instead of a dashboard arc. */
export function arcGauge(model, opts = {}) {
  model = presentationModel(model, opts.provenance);
  const score = Number.isFinite(model.composite) ? model.composite : 0;
  const level = Number.isFinite(model.level) ? model.level : 0;
  const noData = !Number.isFinite(model.composite);
  const angle = -90 + (score / 100) * 180;
  const tick = (i) => {
    const a = (-180 + i * 45) * (Math.PI / 180);
    const x1 = 120 + Math.cos(a) * 84;
    const y1 = 120 + Math.sin(a) * 84;
    const x2 = 120 + Math.cos(a) * 91;
    const y2 = 120 + Math.sin(a) * 91;
    return `<line class="gauge__threshold" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  };
  const labels = SEVERITY_LABELS.map((name, i) => {
    const a = (-180 + i * 45) * (Math.PI / 180);
    const x = 120 + Math.cos(a) * 106;
    const y = 120 + Math.sin(a) * 106;
    return `<text class="gauge__threshold-label" x="${x.toFixed(1)}" y="${(y + (i === 0 || i === 4 ? 4 : 0)).toFixed(1)}" text-anchor="middle">${escapeHtml(name)}</text>`;
  }).join('');
  const ticks = Array.from({ length: 5 }, (_, i) => tick(i)).join('');
  return `<svg class="gauge"${noData ? '' : ` data-sev="${level}"`} viewBox="0 0 240 146" role="img" aria-label="Combined respiratory index ${noData ? 'unavailable' : `${score} of 100`}, ${escapeHtml(model.label)}">
    <path class="gauge__track" d="M36 120 A84 84 0 0 1 204 120"></path>
    ${ticks}
    ${noData ? '' : `<line class="gauge__needle" x1="120" y1="120" x2="120" y2="49" style="--needle-angle:${angle}deg"></line>
    <circle class="gauge__hub" cx="120" cy="120" r="4"></circle>`}
    <text class="gauge__score" x="120" y="105" text-anchor="middle">${noData ? '—' : score}</text>
    <text class="gauge__unit" x="120" y="139" text-anchor="middle">activity index / 100</text>
    ${labels}
  </svg>`;
}

/** Structural provenance removes the inherited middle-dot metadata string. */
export function provenanceStrip(provenance = {}, opts = {}) {
  const p = resolveProvenance({}, provenance);
  const sample = p.kind === 'sample';
  const badge = p.live
    ? `<span class="prov__live"><span class="prov__dot" aria-hidden="true"></span>${p.stale ? 'Historical CDC data' : 'Reported CDC data'}</span>`
    : `<span class="prov__live prov__live--sample">${sample ? 'Sample data' : 'Unverified provenance'}</span>`;
  const contributors = opts.model?.contributors || Object.entries(p.metrics || {}).filter(([, metric]) => metric.contributes === true && metric.status === 'available').map(([key]) => key);
  const sourceNames = contributors.length
    ? contributors.map((key) => key === 'wastewater' ? 'NWSS' : ['edVisits', 'ari'].includes(key) ? 'NSSP' : key === 'positivity' ? 'Laboratory positivity' : key)
    : opts.model || Object.keys(p.metrics || {}).length ? [] : p.sources || [];
  const tags = p.live
    ? [...new Set(sourceNames.map((s) => (/NWSS|wastewater/i.test(s) ? 'NWSS' : /NSSP|emergency|acute respiratory/i.test(s) ? 'NSSP' : s)))]
    : sample ? ['Illustrative inputs'] : [];
  return `<div class="prov" role="note">
    <span class="prov__src">${p.live ? 'CDC surveillance observations' : sample ? 'Demonstration only' : 'Source provenance is unverified'}</span>
    <span class="prov__tags" aria-label="Sources">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</span>
    <span>${p.live ? 'Observation periods follow source publication schedules' : sample ? 'Not measured health conditions' : 'Current health conditions cannot be established'}</span>
    ${badge}
  </div>`;
}

export function severityMeter(level) {
  const on = Number.isFinite(level) ? level : -1;
  const segs = SEVERITY_LABELS.map((_, i) => `<span class="meter__seg" data-on="${i <= on}"></span>`).join('');
  return `<div class="meter" role="img" aria-label="${on >= 0 ? `Severity ${on + 1} of 5: ${escapeHtml(levelLabel(on))}` : 'No data: severity unavailable'}">${segs}</div>
  <div class="meter__scale" aria-hidden="true"><span>Minimal</span><span>Very High</span></div>`;
}

export function provenanceBadge(provenance = {}) {
  const p = resolveProvenance({}, provenance);
  if (p.live) return `<span class="badge badge--live"><span class="badge__dot" aria-hidden="true"></span>${p.stale ? 'Historical CDC data' : 'Reported CDC data'}</span>`;
  if (p.kind !== 'sample') return `<span class="badge badge--cached">Unverified provenance</span>`;
  return `<span class="badge badge--cached" title="Illustrative figures; not measured health conditions">Sample data</span>`;
}

function trendShape(direction) {
  const shapes = {
    up: '<path d="M1 10 6 5l4 3 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><path d="M13 2h3v3" fill="none" stroke="currentColor" stroke-width="2"/>',
    down: '<path d="M1 3 6 8l4-3 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><path d="M13 14h3v-3" fill="none" stroke="currentColor" stroke-width="2"/>',
    flat: '<path d="M1 8h15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><path d="M5 5v6M12 5v6" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  };
  return shapes[direction] ? `<svg class="trend__shape" viewBox="0 0 17 16" aria-hidden="true" focusable="false">${shapes[direction]}</svg>` : '';
}

export function trendChip(trend, opts = {}) {
  if (!trend) return '';
  const p = resolveProvenance(trend.provenance, opts.provenance || opts);
  const unverified = !p.live && p.kind !== 'sample';
  const known = !unverified && ['up', 'down', 'flat'].includes(trend.direction) && Number.isFinite(trend.changePct) && trend.label !== 'Not enough data';
  const direction = known ? trend.direction : 'unknown';
  const prefix = p.kind === 'sample' ? 'Sample trend: ' : p.stale ? 'Historical trend: ' : '';
  const measurement = MEASUREMENT_NAMES[trend.source];
  const change = unverified ? 'Trend unavailable: unverified provenance' : known
    ? `${prefix}${trend.label}${trend.zeroBaseline ? ` (${trendChangeText(trend)})` : direction === 'flat' ? '' : ` ${trendChangeText(trend)}`}${measurement ? ` in ${measurement}` : ''} vs prior-observation mean`
    : `${prefix}${trend.reason === 'changing-coverage' ? 'Not enough comparable data to determine trend; reporting coverage changed' : 'Not enough data to determine trend'}`;
  return `<span class="trend trend--${direction}" title="${escapeHtml(TREND_COMPARISON)}">${trendShape(direction)}<span>${escapeHtml(change)}</span></span>`;
}

export function threatCard(state, model, opts = {}) {
  model = presentationModel(model, opts.provenance);
  const provenance = resolveProvenance(model.provenance, opts.provenance);
  const level = Number.isFinite(model.level) ? model.level : 0;
  const noData = !Number.isFinite(model.level);
  const week = observationWeek(model, { ...provenance, weekEnding: opts.weekEnding || provenance.weekEnding });
  const asOf = week && !noData ? formatDate(week) : '';
  // The region is named by its label AND its reading. Production put
  // id="threat-level" on the level readout; the overhaul moved it to the label,
  // which left assistive tech announcing "Respiratory threat level / Florida"
  // and omitting "Moderate" — the one word the card exists to say.
  return `<article class="threat"${noData ? '' : ` data-sev="${level}"`} aria-labelledby="threat-level threat-reading">
    <div class="threat__head">
      <h2 class="threat__label" id="threat-level"><span>Combined respiratory index</span><span aria-hidden="true">/</span><span>${escapeHtml(state.name)}</span></h2>
      ${provenanceBadge(provenance)}
    </div>
    <div class="threat__body">
      <div class="threat__readout">
        <p class="threat__level" id="threat-reading">${escapeHtml(model.label)}</p>
        <p class="threat__meta">${escapeHtml(threatSentence(state, model, provenance))}${asOf ? ` <span class="muted">${provenance.kind === 'sample' ? 'illustrative period' : 'observations for week ending'} ${escapeHtml(asOf)}</span>` : ''}</p>
        <div class="cluster">
          ${trendChip(model.trend, { provenance })}
          ${levelToken(model.level, model.label)}
          <span class="badge"><span>Flu</span><span>RSV</span><span>COVID-19</span><span>combined</span></span>
        </div>
      </div>
      <div class="threat__gauge" aria-hidden="${noData}">${arcGauge(model, { provenance })}</div>
    </div>
    <div class="threat__meter">${severityMeter(model.level)}</div>
  </article>`;
}

function threatSentence(state, model, provenance) {
  const status = readingStatus(model, provenance);
  if (status === 'sample') return `Illustrative sample index only; these figures do not describe illness in ${state.name}.`;
  if (status === 'missing') return `No usable combined reading is available for ${state.name}. Missing surveillance data does not mean no illness.`;
  if (status === 'stale') return `Historical combined respiratory index: ${model.label.toLowerCase()}. This stale snapshot does not establish current conditions.`;
  if (status === 'unverified') return 'The provenance of this index is unverified; it does not establish current conditions.';
  return `The combined flu, RSV and COVID-19 index is ${model.label.toLowerCase()} for the reported observation period.`;
}

export function pathogenTiles(model, opts = {}) {
  model = presentationModel(model, opts.provenance);
  return `<div class="pathogens">${['influenza', 'covid', 'rsv'].map((key) => pathogenTile(key, model.pathogens[key], opts)).join('')}</div>`;
}

function pathogenTile(key, p, opts) {
  const meta = PATHOGEN_META[key];
  const level = Number.isFinite(p?.level) ? p.level : null;
  const label = p?.label || 'No data';
  const provenance = resolveProvenance(p?.provenance, opts.provenance);
  const status = readingStatus(p, provenance);
  const spark = p?.trend ? sparkline(sparkSeriesFor(p), { direction: p.trend.direction }) : '';
  const basis = (p?.contributors || []).map((key) => SIGNAL_NAMES[key]).filter(Boolean);
  const week = observationWeek(p, { ...provenance, weekEnding: opts.weekEnding || provenance.weekEnding });
  const evidence = basis.length ? `<span>${status === 'sample' ? 'Illustrative inputs' : 'Contributing inputs'}: ${escapeHtml(basis.join(', '))}.${week ? ` ${status === 'sample' ? 'Illustrative period' : 'Observation week ending'} ${escapeHtml(formatDate(week))}.` : ''}</span>` : '';
  return `<div class="pathogen"${level != null ? ` data-sev="${level}"` : ''}>
    <p class="pathogen__name">${escapeHtml(meta.name)}</p>
    <div class="pathogen__level">${levelToken(level, label)}</div>
    <div class="pathogen__spark">${spark}</div>
    <p class="pathogen__foot">${p?.trend ? trendChip(p.trend, { provenance }) : 'Awaiting data'}${evidence}${status === 'missing' ? '<span>No usable reading; no data does not mean no illness.</span>' : status === 'sample' ? '<span>Illustrative sample reading.</span>' : status === 'stale' ? '<span>Historical reading; current conditions unknown.</span>' : status === 'unverified' ? '<span>Unverified provenance; current conditions unknown.</span>' : ''}</p>
  </div>`;
}

function sparkSeriesFor(p) { return p._series || []; }

export function stateChip(state, model) {
  model = presentationModel(model);
  const level = Number.isFinite(model?.level) ? model.level : null;
  const status = readingStatus(model);
  const qualifier = status === 'sample' ? ' (sample)' : status === 'stale' ? ' (historical)' : status === 'unverified' ? ' (unverified)' : '';
  const label = level != null ? `${model.label}${qualifier}` : model?.label || 'No data';
  const glyph = level != null ? LEVEL_GLYPHS[level] : '—';
  const week = observationWeek(model);
  return `<a class="state-chip" href="/state/${state.slug}/"${level != null ? ` data-sev="${level}"` : ''}${week && level != null ? ` title="${status === 'sample' ? 'Illustrative period' : 'Observation week ending'} ${escapeHtml(formatDate(week))}"` : ''}>
    <span class="state-chip__name">${escapeHtml(state.name)}</span>
    <span class="state-chip__status"><span class="state-chip__mark" aria-hidden="true">${glyph}</span><span>${escapeHtml(label)}</span>${level != null ? `<span aria-label="level ${level}">${level}</span>` : ''}</span>
  </a>`;
}

export function signalRows(signals = {}, opts = {}) {
  const model = presentationModel(opts.model || computeModel(signals, opts.provenance), opts.provenance);
  const provenance = resolveProvenance(model.provenance, opts.provenance);
  const contributors = model.contributors || [];
  const rows = [];
  const latest = (series) => (series || []).filter(Number.isFinite).at(-1);
  const add = (key, name, value, hint) => {
    if (!contributors.includes(key) || !metricAvailable(signals, key)) return;
    const metric = provenance.metrics?.[key] || {};
    const period = metric.observationPeriod?.weekEnding || metric.weekEnding || provenance.weekEnding || opts.weekEnding;
    const qualifiers = [hint, provenance.kind === 'sample' ? 'Illustrative sample input' : ''];
    if (period) qualifiers.push(`${provenance.kind === 'sample' ? 'Illustrative period' : 'Observation week ending'} ${formatDate(period)}`);
    if (metric.publicationDate) qualifiers.push(`Published ${formatDate(metric.publicationDate)}`);
    else if (provenance.live) qualifiers.push('Publication date not provided by this feed');
    if (metric.retrievedAt) qualifiers.push(`Retrieved ${metric.retrievedAt}`);
    const sites = metric.coverage?.reportingSites ?? metric.coverage?.siteCount;
    if (Number.isFinite(sites)) qualifiers.push(`${sites} reporting wastewater sites`);
    rows.push(row(name, value, qualifiers.filter(Boolean).join(' · ')));
  };
  if (Number.isFinite(signals.ariLevel)) add('ari', 'Acute respiratory illness activity', signals.ariLabel || levelLabel(signals.ariLevel), 'CDC NSSP activity category; broader than the three-virus index');
  const ed = latest(signals.edCombinedSeries);
  if (Number.isFinite(ed)) add('edVisits', 'Combined flu, RSV and COVID-19 ED visits', formatPct(ed), 'Share of emergency-department visits; not a case count (NSSP)');
  const ww = latest(signals.wastewaterSeries);
  if (Number.isFinite(ww)) add('wastewater', 'Wastewater viral activity input', ww.toFixed(1), 'NWSS wastewater index input; not test positivity or hospitalizations');
  if (Number.isFinite(signals.positivityCombined)) add('positivity', 'Laboratory test positivity input', formatPct(signals.positivityCombined), 'Share of laboratory tests positive; not population prevalence');
  if (!rows.length) return '<p class="muted">No contributing signal detail is available for this area. No data does not mean no illness.</p>';
  const unavailable = provenance.live && !contributors.includes('positivity') ? '<p class="field__hint">Laboratory test positivity is unavailable from the implemented live adapter and does not contribute to this reading.</p>' : '';
  return `<div class="signal-ledger">${rows.join('')}</div>${unavailable}`;
}

function row(name, value, hint) {
  return `<div class="signal-row"><span class="signal-row__name">${escapeHtml(name)}<br><span class="field__hint">${escapeHtml(hint)}</span></span><span class="signal-row__val">${escapeHtml(value)}</span></div>`;
}
