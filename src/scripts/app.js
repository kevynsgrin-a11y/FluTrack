// ===========================================================================
// FluTrack app controller.
//
// Lifecycle:
//   1. Server-rendered HTML is already on screen (sample snapshot).
//   2. Load the bundled snapshot → build a data store → (re)render selection.
//   3. Attempt a live CDC refresh in the browser → on success, swap to live
//      data and flip the provenance badge to "Live".
//   4. Wire the state picker + geolocation (home page only).
//
// Rendering reuses the exact same functions as the build, so re-renders never
// mismatch the static markup.
// ===========================================================================

import { loadSnapshot, fetchLiveSignals, hasSignalData } from './data-sources.js';
import { computeModel } from './model.js';
import { nationalSignals } from './aggregate.js';
import { threatCard, pathogenTiles, signalRows, stateSummary } from './render.js';
import { states, stateByAbbr } from './states-data.js';
import { formatDate, formatChange } from './util.js';

const SELECT_KEY = 'flutrack-state';
const US = { abbr: 'US', name: 'United States', slug: '', isNational: true };

// A live refresh must cover a meaningful share of the country before the UI is
// allowed to call itself "Live CDC data". Below this, the bundled sample data is
// still what's mostly on screen, so the sample badge stays.
const LIVE_STATE_FLOOR = 25;

const cardRegion = document.querySelector('[data-region="threat-card"]');
if (cardRegion) {
  boot().catch((err) => console.warn('[FluTrack] init failed', err));
}

async function boot() {
  const pinnedAbbr = cardRegion.getAttribute('data-state'); // set on state pages
  const isStatePage = Boolean(pinnedAbbr);

  const store = { signals: new Map(), weekEnding: '', provenance: { live: false } };

  // Determine initial selection. A ?state= parameter wins over the saved one so
  // a chosen state can be linked and shared.
  let selection = isStatePage ? pinnedAbbr : selectionFromUrl() || readSavedSelection();

  // --- 0. Wire interaction FIRST -----------------------------------------
  // The picker must work before any network call resolves. Wiring it after an
  // await meant an early submit fell through to a native GET on a form with no
  // action, navigating to /?state=XX and silently losing the selection.
  if (!isStatePage) wirePicker(store, (abbr) => (selection = abbr));

  // --- 1. Snapshot + live refresh, started together ----------------------
  // The live request is the slow one and does not depend on the snapshot, so
  // kick it off first and let both settle in parallel.
  const livePromise = fetchLiveSignals().catch((e) => {
    console.info('[FluTrack] live CDC feed unavailable, showing sample data', e?.message || e);
    return null;
  });

  // A state page server-renders from exactly one state's signals and inlines
  // them, so it needs no network round trip at all for its baseline view.
  const inlined = readInlineSignals();
  if (inlined && pinnedAbbr) {
    store.signals.set(pinnedAbbr, inlined);
    store.weekEnding = inlined.weekEnding || cardRegion.getAttribute('data-week') || '';
  } else {
    try {
      const snap = await loadSnapshot('');
      ingestSnapshot(store, snap);
      if (snap && snap.note) store.sampleNote = snap.note;
    } catch (e) {
      console.warn('[FluTrack] snapshot load failed', e);
    }
  }

  // The server already rendered this exact view from this exact data, so the
  // first client render would be byte-identical — it would only tear down the
  // DOM and restart the gauge and tile animations. Skip it.
  const ssrWeek = cardRegion.getAttribute('data-week');
  const ssrMatches = Boolean(ssrWeek) && ssrWeek === store.weekEnding && selection === (pinnedAbbr || readSavedSelection());
  if (!ssrMatches) render(store, selection);

  // --- 2. Apply the live refresh if it produced usable data --------------
  const live = await livePromise;
  if (live && live.statesWithData >= LIVE_STATE_FLOOR && isIsoDate(live.weekEnding)) {
    ingestLive(store, live);
    store.provenance = { live: true, sources: live.sources };
    render(store, selection);
    announceLive(store, selection, live);
  } else {
    // Either the fetch failed, or it succeeded but carried nothing usable
    // (empty result set, or an upstream schema change that stopped resolving
    // geographies). Both cases leave sample data on screen, so say so plainly
    // rather than leaving the badge reading "not loaded yet" forever.
    if (live) {
      console.warn(
        `[FluTrack] live CDC feed returned no usable data (${live.statesWithData} states); keeping sample data`
      );
    }
    store.provenance = { live: false, failed: true };
    render(store, selection);
    announceLiveFailure();
  }
}

/** Read the per-state signal bundle inlined by the build, if present. */
function readInlineSignals() {
  const el = document.querySelector('script[type="application/json"][data-state-signals]');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    console.warn('[FluTrack] inline state signals could not be parsed', e);
    return null;
  }
}

/** Strict YYYY-MM-DD check — guards against '' and malformed upstream dates. */
function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ingestSnapshot(store, snap) {
  store.weekEnding = snap.weekEnding;
  for (const [abbr, sig] of Object.entries(snap.states || {})) {
    store.signals.set(abbr, sig);
  }
  store.signals.set('US', nationalSignals([...store.signals.values()]));
}

function ingestLive(store, live) {
  store.weekEnding = live.weekEnding || store.weekEnding;
  for (const [abbr, sig] of live.signalsByAbbr) {
    // Only overwrite when the live bundle actually has data for the state.
    if (hasSignalData(sig)) store.signals.set(abbr, sig);
  }
  store.signals.set('US', nationalSignals(states.map((s) => store.signals.get(s.abbr)).filter(Boolean)));
}

function resolveState(abbr) {
  if (!abbr || abbr === 'US') return US;
  return stateByAbbr(abbr) || US;
}

function render(store, abbr) {
  const st = resolveState(abbr);
  // Falling back to national data is right for the US view, but on a state page
  // it would render national numbers under that state's own heading — plausible
  // enough that the reader could never tell. Let the "No data" branch handle it.
  const signals = st.isNational
    ? store.signals.get('US')
    : store.signals.get(st.abbr);
  if (!signals) {
    // Render an explicit "No data" view rather than returning silently — a bare
    // return left the picker looking dead when the store was empty.
    const empty = computeModel({});
    setRegion('threat-card', threatCard(st, empty, { weekEnding: '', provenance: store.provenance }));
    setRegion('pathogen-tiles', pathogenTiles(empty));
    setRegion('signal-rows', signalRows({}));
    setStatus(`No data available for ${st.isNational ? 'the United States' : st.name}.`);
    return;
  }
  const model = computeModel(signals);
  const opts = { weekEnding: store.weekEnding, provenance: store.provenance };

  setRegion('threat-card', threatCard(st, model, opts));
  setRegion('pathogen-tiles', pathogenTiles(model));
  setRegion('signal-rows', signalRows(signals));
  // Keep the prose in step with the numbers — stale data-derived text sitting
  // under a freshly-updated card is worse than no prose at all.
  setRegion('state-summary', stateSummary(st, model, signals));

  // Home-only regions.
  setText('state-name', st.isNational ? 'the U.S.' : st.name);
  const link = document.querySelector('[data-region="state-link"]');
  if (link) link.setAttribute('href', st.isNational ? '/states/' : `/state/${st.slug}/`);

  // State-page "at a glance" regions.
  setRegion('glance-level', `<strong>${escapeText(model.label)}</strong>`);
  setRegion(
    'glance-trend',
    model.trend.direction !== 'flat'
      ? `${escapeText(model.trend.label)} ${escapeText(formatChange(model.trend.changePct))}`
      : escapeText(model.trend.label)
  );
  // Only overwrite the server-rendered date when we have a real one to put
  // there — otherwise a malformed/missing weekEnding blanks a correct value.
  const asOf = formatDate(store.weekEnding);
  if (asOf && asOf !== store.weekEnding) setText('glance-week', asOf);
  const heroBg = document.querySelector('.hero__bg');
  if (heroBg && Number.isFinite(model.level)) heroBg.setAttribute('data-sev', String(model.level));
  repaintMap(store, st.abbr);
  return { st, model };
}

// Recolor the US tile-grid map from the store (live data upgrade) and highlight
// the current selection. No-op on pages without a map.
function repaintMap(store, selectedAbbr) {
  const tiles = document.querySelectorAll('.us-tile');
  if (!tiles.length) return;
  tiles.forEach((tile) => {
    const abbr = tile.getAttribute('data-abbr');
    const signals = store.signals.get(abbr);
    if (signals) {
      const m = computeModel(signals);
      if (Number.isFinite(m.level)) tile.setAttribute('data-sev', String(m.level));
      else tile.removeAttribute('data-sev');
      const title = tile.querySelector('title');
      if (title) title.textContent = `${stateByAbbr(abbr)?.name || abbr} — ${m.label}`;
      const st = stateByAbbr(abbr);
      if (st) tile.setAttribute('aria-label', `${st.name}: ${m.label}. View ${st.name} report.`);
    }
    tile.classList.toggle('is-selected', abbr === selectedAbbr);
  });
}

// Announce a picker-driven change to assistive tech via the polite live region.
function announceSelection(st, model) {
  setStatus(`${st.isNational ? 'United States' : st.name}: ${model.label}, ${model.trend.label}.`);
}

function setStatus(text) {
  const region = document.getElementById('live-status');
  if (region) region.textContent = text;
}

function setRegion(name, html) {
  const el = document.querySelector(`[data-region="${name}"]`);
  if (el) el.innerHTML = html;
}
function setText(name, text) {
  const el = document.querySelector(`[data-region="${name}"]`);
  if (el) el.textContent = text;
}
function escapeText(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function readSavedSelection() {
  try {
    const saved = localStorage.getItem(SELECT_KEY);
    if (saved && (saved === 'US' || stateByAbbr(saved))) return saved;
  } catch (e) {
    /* ignore */
  }
  const def = cardRegion.closest('[data-week]')?.querySelector?.('#state-select')?.dataset?.default;
  return def || 'US';
}

function saveSelection(abbr) {
  try {
    localStorage.setItem(SELECT_KEY, abbr);
  } catch (e) {
    /* ignore */
  }
}

function wirePicker(store, onChange) {
  const form = document.getElementById('state-picker');
  const select = document.getElementById('state-select');
  const geoBtn = document.getElementById('geo-btn');
  if (!form || !select) return;

  // Reflect saved selection in the dropdown.
  const saved = readSavedSelection();
  if (saved && [...select.options].some((o) => o.value === saved)) select.value = saved;

  const apply = (abbr) => {
    onChange(abbr);
    saveSelection(abbr);
    reflectSelectionInUrl(abbr);
    const r = render(store, abbr);
    if (r) announceSelection(r.st, r.model);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('breakdown')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    apply(select.value);
  });
  select.addEventListener('change', () => {
    onChange(select.value);
    saveSelection(select.value);
    const r = render(store, select.value);
    if (r) announceSelection(r.st, r.model);
  });

  if (geoBtn && 'geolocation' in navigator) {
    const ctx = { original: geoBtn.innerHTML, resetTimer: 0, busy: false };
    geoBtn.addEventListener('click', () => locate(select, apply, geoBtn, ctx));
  } else if (geoBtn) {
    geoBtn.hidden = true;
  }
}

// Reverse-geolocate to a state using the free, keyless FCC Area API (US only).
// `original` and `resetTimer` are captured once per button at wire time: reading
// innerHTML at click time meant a second click during the error window captured
// "Location unavailable" and destroyed the label permanently.
async function locate(select, apply, btn, ctx) {
  if (ctx.busy) return;
  ctx.busy = true;
  clearTimeout(ctx.resetTimer);
  btn.disabled = true;
  btn.textContent = 'Locating…';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 600000 })
    );
    const { latitude, longitude } = pos.coords;
    const url = `https://geo.fcc.gov/api/census/area?lat=${latitude}&lon=${longitude}&format=json`;
    // The FCC endpoint has no SLA; without an abort a stall left the button
    // reading "Locating…" forever with no way back short of a reload.
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const stateAbbr = data?.results?.[0]?.state_code;
    const st = stateAbbr && stateByAbbr(stateAbbr);
    if (!st) throw new Error('outside-us');
    select.value = st.abbr;
    apply(st.abbr);
    btn.innerHTML = ctx.original;
  } catch (e) {
    const message = geoErrorMessage(e);
    btn.textContent = message.short;
    setStatus(message.long);
    ctx.resetTimer = setTimeout(() => {
      btn.innerHTML = ctx.original;
    }, 4000);
  } finally {
    clearTimeout(timer);
    btn.disabled = false;
    ctx.busy = false;
  }
}

/** Distinguish the geolocation failure modes — "unavailable" told a user who
 *  denied permission nothing about how to recover. */
function geoErrorMessage(err) {
  if (err && err.code === 1) {
    return {
      short: 'Permission blocked',
      long: 'Location permission is blocked. Choose your state from the list instead.',
    };
  }
  if (err && (err.code === 2 || err.code === 3)) {
    return {
      short: 'Location unavailable',
      long: 'Could not determine your location. Choose your state from the list instead.',
    };
  }
  if (err && err.message === 'outside-us') {
    return {
      short: 'Not a US location',
      long: 'That location is outside the United States. Choose a state from the list instead.',
    };
  }
  return {
    short: 'Location unavailable',
    long: 'Location lookup failed. Choose your state from the list instead.',
  };
}

// Announce the live upgrade in terms of what actually changed on screen, not
// merely that a fetch completed — the level itself may have moved.
function announceLive(store, selection, live) {
  const st = resolveState(selection);
  const signals = st.isNational ? store.signals.get('US') : store.signals.get(st.abbr);
  const where = st.isNational ? 'United States' : st.name;
  const week = formatDate(live.weekEnding);
  if (!signals) {
    setStatus(`Live CDC data loaded (week ending ${week}).`);
    return;
  }
  const model = computeModel(signals);
  setStatus(
    `Live CDC data loaded (week ending ${week}). ${where}: ${model.label}, ${model.trend.label}.`
  );
}

function announceLiveFailure() {
  setStatus('Live CDC data is unavailable. Showing bundled sample data instead.');
}

/**
 * Mirror the selection into ?state=XX so the view can be linked and shared.
 * replaceState (not pushState): the picker is a filter on one page, not a
 * navigation, so it should not stack up Back-button entries.
 */
function reflectSelectionInUrl(abbr) {
  try {
    const url = new URL(window.location.href);
    if (!abbr || abbr === 'US') url.searchParams.delete('state');
    else url.searchParams.set('state', abbr);
    window.history.replaceState(null, '', url);
  } catch (e) {
    /* ignore */
  }
}

/** Read a ?state=XX parameter, so a selection can be linked and shared. */
function selectionFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get('state');
    if (!raw) return null;
    const abbr = raw.trim().toUpperCase();
    if (abbr === 'US' || stateByAbbr(abbr)) return abbr;
  } catch (e) {
    /* ignore */
  }
  return null;
}
