// ===========================================================================
// CDC epidemic trend (Rt) for COVID-19 — the build-time adapter.
//
// CDC's Center for Forecasting and Outbreak Analytics estimates, for every
// state, the probability that COVID-19 infections are growing, from emergency-
// department (ED) visit data reported through NSSP. It publishes a category for
// that probability (Growing … Declining). This is DIRECTION ONLY: CDC says the
// category does not reflect the burden of disease and should be read alongside
// other measures. FluTrack therefore shows it as its own, separately named
// signal and never folds it into the combined respiratory index.
//
// This module is deliberately small and defensive:
//
//   * parseEpidemicTrend() validates an upstream payload completely or rejects
//     it; a row that contradicts CDC's own published thresholds is dropped
//     rather than shown.
//   * fetchEpidemicTrend() / resolveEpidemicTrend() NEVER throw for a data or
//     network problem. A failure means the block is omitted — there is no
//     sample fallback, because an invented trend direction is worse than none.
//   * planEpidemicTrend() decides, per state, whether the category may be shown.
//
// The upstream file is a CDC website data file (…/wcms/vizdata/…), not a
// documented API, so every assumption about its shape is checked here and
// covered by test/epidemic-trend.test.mjs against a fixture cut from the real
// October 7, 2026 release.
// ===========================================================================

import { states as SITE_STATES } from './states.mjs';

export const EPIDEMIC_TREND_URL =
  'https://www.cdc.gov/wcms/vizdata/cfa/RtEstimates/substate/release/latest/public-jsons/v1/covid-19/map.json';
export const EPIDEMIC_TREND_PAGE = 'https://www.cdc.gov/cfa-modeling-and-forecasting/rt-estimates/index.html';
export const EPIDEMIC_TREND_SOURCE_NAME = 'CDC Center for Forecasting and Outbreak Analytics — COVID-19 epidemic trends (Rt)';

/** Upstream minor/patch bumps are additive; a new major version is a new contract. */
const UPSTREAM_SCHEMA = /^rt-map\/1\.\d+\.\d+$/;

/**
 * CDC refreshes the model weekly. Past three weeks the report no longer
 * describes the current direction, and (like the observation guard in
 * data-sources.js) the block is withheld rather than shown as current.
 */
export const MAX_REPORT_AGE_DAYS = 21;

/** A release that estimates fewer states than this is malformed, not "quiet". */
export const MIN_STATES_WITH_ESTIMATES = 40;

export const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

/**
 * CDC's categories and the share of the Rt distribution above 1 that defines
 * each ("Categorization of epidemic trends", CDC Rt page, retained October 9,
 * 2026). `min`/`max` bound that share and are used to cross-check a row's
 * category against its own probability.
 */
export const CATEGORIES = Object.freeze({
  growing: Object.freeze({ label: 'Growing', direction: 'up', min: 0.9, max: 1, band: 'more than 90%' }),
  likely_growing: Object.freeze({ label: 'Likely growing', direction: 'up', min: 0.75, max: 0.9, band: '75% to 90%' }),
  not_changing: Object.freeze({ label: 'Not changing', direction: 'flat', min: 0.25, max: 0.75, band: '25% to 75%' }),
  likely_declining: Object.freeze({ label: 'Likely declining', direction: 'down', min: 0.1, max: 0.25, band: '10% to 25%' }),
  declining: Object.freeze({ label: 'Declining', direction: 'down', min: 0, max: 0.1, band: 'less than 10%' }),
});

/** Published probabilities are rounded to three places; allow for that at the edges. */
const BAND_TOLERANCE = 0.002;

/**
 * States where CDC's own pages say the emergency-department data this model
 * estimates from are not available. FluTrack withholds the category for these
 * (see planEpidemicTrend) because a direction label with no ED series behind it
 * cannot be qualified. Each entry cites the CDC page it was read from; review
 * the list whenever CDC's data notes change.
 */
export const DOCUMENTED_ED_GAPS = Object.freeze({
  IA: Object.freeze({
    text: 'CDC’s data notes say Iowa’s NSSP data feed was terminated on May 6, 2026, after a change in health information exchange vendors, and that data for weeks ending May 9, 2026 and later show as Data Unavailable.',
    source: 'https://www.cdc.gov/respiratory-viruses/data/activity-levels.html',
    verified: '2026-10-09',
  }),
  SD: Object.freeze({
    text: 'CDC’s respiratory data page says no emergency-department visit data are available for South Dakota.',
    source: 'https://www.cdc.gov/respiratory-viruses/data/activity-levels.html',
    verified: '2026-10-09',
  }),
});

const NOT_ESTIMATED_CODES = new Set(['opt_out', 'low_data', 'low_recent_reporting']);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** A strict YYYY-MM-DD that round-trips through Date (rejects 2026-02-31). */
function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value ? value : null;
}

/** Whole days from a YYYY-MM-DD date to `now`. */
export function ageDays(iso, now = new Date()) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86_400_000) : NaN;
}

/** Does `p` (share of the Rt distribution above 1) sit in the category's band? */
export function inBand(category, p) {
  const c = CATEGORIES[category];
  return Boolean(c) && isNum(p) && p >= c.min - BAND_TOLERANCE && p <= c.max + BAND_TOLERANCE;
}

function estimateFrom(row) {
  if (typeof row.category !== 'string' || !Object.hasOwn(CATEGORIES, row.category)) return { reason: 'unknown-category' };
  const { p_growing: p, median: m, lower_95: lo, upper_95: hi } = row;
  if (![p, m, lo, hi].every(isNum)) return { reason: 'non-numeric' };
  if (p < 0 || p > 1) return { reason: 'probability-out-of-range' };
  if (!(lo > 0 && lo <= m && m <= hi && hi < 10)) return { reason: 'interval-invalid' };
  if (!inBand(row.category, p)) return { reason: 'category-probability-mismatch' };
  const c = CATEGORIES[row.category];
  return { value: { category: row.category, label: c.label, direction: c.direction, pGrowing: p, median: m, lower95: lo, upper95: hi } };
}

/**
 * Validate an upstream payload. Returns { ok: true, data } or { ok: false,
 * reason, detail? }; never throws. Rows that fail their own checks are dropped
 * and listed in data.rejected rather than shown.
 */
export function parseEpidemicTrend(payload, { states = SITE_STATES, now = new Date() } = {}) {
  const fail = (reason, detail) => ({ ok: false, reason, ...(detail === undefined ? {} : { detail: String(detail).slice(0, 80) }) });
  if (!isPlainObject(payload)) return fail('not-an-object');
  if (typeof payload.schema !== 'string' || !UPSTREAM_SCHEMA.test(payload.schema)) return fail('unsupported-schema', payload.schema);
  if (payload.disease !== 'covid-19') return fail('wrong-disease', payload.disease);
  if (payload.status !== 'available') return fail('status-not-available', payload.status);
  const reportDate = isoDate(payload.report_date);
  const trainingDataEnd = isoDate(payload.training_data_end);
  if (!reportDate || !trainingDataEnd) return fail('invalid-dates');
  if (trainingDataEnd > reportDate) return fail('training-end-after-report', `${trainingDataEnd} > ${reportDate}`);
  const age = ageDays(reportDate, now);
  if (age > MAX_REPORT_AGE_DAYS) return fail('stale-report', `${age} days old (limit ${MAX_REPORT_AGE_DAYS})`);
  if (age < -1) return fail('future-report', `${-age} days ahead`);
  if (!Array.isArray(payload.rows)) return fail('rows-missing');

  const byFips = new Map(states.map((s) => [s.fips, s]));
  const stateEstimates = {};
  const notEstimated = {};
  const rejected = [];
  let national = null;

  for (const row of payload.rows) {
    if (!isPlainObject(row)) { rejected.push({ fips: null, reason: 'row-not-an-object' }); continue; }
    if (row.location_type === 'national') {
      if (row.fips !== '00000' || national) continue;
      const parsed = estimateFrom(row);
      if (parsed.value) national = parsed.value;
      else rejected.push({ fips: row.fips, reason: parsed.reason });
      continue;
    }
    if (row.location_type !== 'state') continue; // substate (HSA) rows are not used
    const st = byFips.get(row.fips);
    if (!st) { rejected.push({ fips: String(row.fips).slice(0, 8), reason: 'unknown-jurisdiction' }); continue; }
    if (Object.hasOwn(stateEstimates, st.abbr) || Object.hasOwn(notEstimated, st.abbr)) return fail('duplicate-state-rows', st.abbr);
    if (row.not_estimated === true) {
      if (row.category !== null && row.category !== undefined) { rejected.push({ fips: row.fips, reason: 'contradictory-row' }); continue; }
      notEstimated[st.abbr] = NOT_ESTIMATED_CODES.has(row.not_estimated_detail) ? row.not_estimated_detail : 'other';
      continue;
    }
    const parsed = estimateFrom(row);
    if (parsed.value) stateEstimates[st.abbr] = parsed.value;
    else rejected.push({ fips: row.fips, reason: parsed.reason });
  }

  const count = Object.keys(stateEstimates).length;
  if (count < MIN_STATES_WITH_ESTIMATES) return fail('too-few-states', `${count} of ${states.length} (minimum ${MIN_STATES_WITH_ESTIMATES})`);
  return { ok: true, data: { upstreamSchema: payload.schema, reportDate, trainingDataEnd, national, states: stateEstimates, notEstimated, rejected } };
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch and validate the CDC file. Retries transient failures (network error,
 * timeout, 429, 5xx); a content problem is final, because the same bytes will
 * not improve in two seconds. Never throws.
 */
export async function fetchEpidemicTrend({
  url = EPIDEMIC_TREND_URL,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  attempts = 3,
  backoffMs = [2000, 5000],
  timeoutMs = 20_000,
  sleep = defaultSleep,
  states = SITE_STATES,
} = {}) {
  let last = { reason: 'network-error', detail: 'no attempt made' };
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(backoffMs[Math.min(i - 1, backoffMs.length - 1)] ?? 0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        last = { reason: 'http-error', detail: `HTTP ${res.status}` };
        if (res.status >= 500 || res.status === 429) continue;
        return { ok: false, ...last };
      }
      // A redirect to some other host (a captive portal, a misrouted proxy) is
      // not CDC data, whatever it parses as.
      if (typeof res.url === 'string' && res.url) {
        let host = '';
        try { host = new URL(res.url).hostname; } catch { host = ''; }
        if (host !== 'cdc.gov' && !host.endsWith('.cdc.gov')) return { ok: false, reason: 'unexpected-host', detail: host || 'unparseable' };
      }
      const declared = Number(res.headers?.get?.('content-length'));
      if (Number.isFinite(declared) && declared > MAX_PAYLOAD_BYTES) return { ok: false, reason: 'payload-too-large' };
      const text = await res.text();
      if (text.length > MAX_PAYLOAD_BYTES) return { ok: false, reason: 'payload-too-large' };
      let payload;
      try { payload = JSON.parse(text); } catch { return { ok: false, reason: 'invalid-json' }; }
      const parsed = parseEpidemicTrend(payload, { states, now });
      if (!parsed.ok) return parsed;
      return { ok: true, data: { ...parsed.data, retrievedAt: now.toISOString(), sourceUrl: url } };
    } catch (err) {
      last = { reason: 'network-error', detail: err?.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : err?.message || String(err) };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, ...last };
}

/**
 * Apply the build policy. EPIDEMIC_TREND=off skips the fetch; so does an
 * offline build (LIVE_PRERENDER=off), which must stay deterministic and must
 * not touch the network. Anything else tries the fetch and, on any failure,
 * returns data: null — the block is simply omitted.
 */
export async function resolveEpidemicTrend({ env = process.env, now = new Date(), ...fetchOptions } = {}) {
  const mode = String(env.EPIDEMIC_TREND || 'auto').toLowerCase();
  if (mode !== 'auto' && mode !== 'off') {
    throw new Error(`EPIDEMIC_TREND must be "auto" or "off" (got "${env.EPIDEMIC_TREND}"). A failed CDC fetch never fails the build, so there is no "require" mode.`);
  }
  if (mode === 'off') return { status: 'skipped', reason: 'EPIDEMIC_TREND=off', data: null };
  if (String(env.LIVE_PRERENDER || 'auto').toLowerCase() === 'off') {
    return { status: 'skipped', reason: 'LIVE_PRERENDER=off (offline build)', data: null };
  }
  const result = await fetchEpidemicTrend({ now, ...fetchOptions });
  if (result.ok) {
    return { status: 'ok', reason: `report ${result.data.reportDate}, data through ${result.data.trainingDataEnd}`, data: result.data };
  }
  return { status: 'unavailable', reason: `${result.reason}${result.detail ? ` (${result.detail})` : ''}`, data: null };
}

/**
 * Decide, state by state, what the page may show.
 *
 *   shown          a category with the ED observations it rests on in view
 *   withheld       CDC publishes a category, but FluTrack has no emergency-
 *                  department series for the state (documented gap, or none
 *                  that passed its own checks), so it cannot be qualified
 *   not-estimated  CDC says it did not estimate a trend for the state
 *   no-record      the file has nothing for the state; the page says nothing
 *
 * Returns null unless the snapshot is live: a page labelled "Sample data" must
 * not also carry a real-looking health signal.
 *
 * @param {object|null} data parseEpidemicTrend() data (plus retrievedAt)
 * @param {{ states?: object[], models: Map<string, {signals: object}>, provenance: object }} ctx
 */
export function planEpidemicTrend(data, { states = SITE_STATES, models, provenance } = {}) {
  if (!data || !provenance?.live || !models) return null;
  const byState = new Map();
  const counts = { shown: 0, up: 0, flat: 0, down: 0, withheld: 0, notEstimated: 0 };
  for (const st of states) {
    const estimate = data.states[st.abbr];
    const notEstimated = data.notEstimated?.[st.abbr];
    if (!estimate) {
      if (notEstimated) { byState.set(st.abbr, { status: 'not-estimated', reason: notEstimated }); counts.notEstimated += 1; }
      else byState.set(st.abbr, { status: 'no-record' });
      continue;
    }
    const gap = DOCUMENTED_ED_GAPS[st.abbr];
    // "Available" is a current, finite COVID-19 ED observation. It need not be
    // from the same week as the index's other inputs (`contributes`): the point
    // is that the data CDC estimates from are not missing altogether.
    const ed = models.get(st.abbr)?.signals?.pathogens?.covid?.provenance?.metrics?.edVisits;
    const edAvailable = Boolean(ed) && ed.status === 'available';
    if (gap || !edAvailable) {
      byState.set(st.abbr, { status: 'withheld', reason: gap ? 'documented-ed-gap' : 'no-ed-series', gap: gap || null });
      counts.withheld += 1;
      continue;
    }
    byState.set(st.abbr, { status: 'shown', estimate });
    counts.shown += 1;
    counts[estimate.direction] += 1;
  }
  return {
    reportDate: data.reportDate,
    trainingDataEnd: data.trainingDataEnd,
    retrievedAt: data.retrievedAt || null,
    sourceUrl: data.sourceUrl || EPIDEMIC_TREND_URL,
    upstreamSchema: data.upstreamSchema,
    national: data.national,
    byState,
    counts,
  };
}

/**
 * Do any measurements point opposite to CDC's category? Only up-versus-down
 * counts: "rising" next to "not changing" is not a disagreement, and an
 * unknown direction (too little or non-comparable history) says nothing.
 *
 * @param {string} category a key of CATEGORIES
 * @param {{ key: string, direction: string }[]} measures
 */
export function compareDirections(category, measures = []) {
  const cdc = CATEGORIES[category]?.direction ?? 'flat';
  const opposite = measures.filter((m) => (cdc === 'up' && m.direction === 'down') || (cdc === 'down' && m.direction === 'up'));
  return { cdcDirection: cdc, divergent: opposite.length > 0, opposite };
}

const publicEstimate = (e) => ({ category: e.category, label: e.label, pGrowing: e.pGrowing, median: e.median, lower95: e.lower95, upper95: e.upper95 });

/** The machine-readable record shipped as /data/epidemic-trends.json. */
export function publicEpidemicTrend(plan) {
  if (!plan) return null;
  const states = {};
  const withheld = {};
  const notEstimated = {};
  for (const [abbr, d] of plan.byState) {
    if (d.status === 'shown') states[abbr] = publicEstimate(d.estimate);
    else if (d.status === 'withheld') withheld[abbr] = d.reason;
    else if (d.status === 'not-estimated') notEstimated[abbr] = d.reason;
  }
  return {
    schema: 'flutrack-epidemic-trends/1',
    disease: 'covid-19',
    measure: 'Probability that infections are growing (Rt > 1), and CDC’s category for it. Direction only; not the burden of disease.',
    source: { name: EPIDEMIC_TREND_SOURCE_NAME, url: plan.sourceUrl, page: EPIDEMIC_TREND_PAGE, upstreamSchema: plan.upstreamSchema },
    reportDate: plan.reportDate,
    trainingDataEnd: plan.trainingDataEnd,
    retrievedAt: plan.retrievedAt,
    national: plan.national ? publicEstimate(plan.national) : null,
    states,
    withheld,
    notEstimated,
    counts: { ...plan.counts },
  };
}
