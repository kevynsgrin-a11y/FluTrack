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

import { loadSnapshot, fetchLiveSignals } from './data-sources.js';
import { computeModel } from './model.js';
import { nationalSignals } from './aggregate.js';
import { threatCard, pathogenTiles, signalRows } from './render.js';
import { states, stateByAbbr } from './states-data.js';
import { formatDate, formatChange } from './util.js';

const SELECT_KEY = 'flutrack-state';
const US = { abbr: 'US', name: 'United States', slug: '', isNational: true };

const cardRegion = document.querySelector('[data-region="threat-card"]');
if (cardRegion) {
  boot().catch((err) => console.warn('[FluTrack] init failed', err));
}

async function boot() {
  const pinnedAbbr = cardRegion.getAttribute('data-state'); // set on state pages
  const isStatePage = Boolean(pinnedAbbr);

  const store = { signals: new Map(), weekEnding: '', provenance: { live: false } };

  // --- 1. Snapshot (always available) ------------------------------------
  try {
    const snap = await loadSnapshot('');
    ingestSnapshot(store, snap);
  } catch (e) {
    console.warn('[FluTrack] snapshot load failed', e);
  }

  // Determine initial selection.
  let selection = isStatePage ? pinnedAbbr : readSavedSelection();
  render(store, selection);
  if (!isStatePage) wirePicker(store, (abbr) => (selection = abbr));

  // --- 2. Live refresh (progressive enhancement) -------------------------
  try {
    const live = await fetchLiveSignals();
    ingestLive(store, live);
    store.provenance = { live: true, sources: live.sources };
    render(store, selection);
    announceLive(live);
  } catch (e) {
    console.info('[FluTrack] live CDC feed unavailable, showing sample data', e?.message || e);
  }
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
    if (hasData(sig)) store.signals.set(abbr, sig);
  }
  store.signals.set('US', nationalSignals(states.map((s) => store.signals.get(s.abbr)).filter(Boolean)));
}

function hasData(sig) {
  return (sig.edCombinedSeries && sig.edCombinedSeries.length) ||
    (sig.wastewaterSeries && sig.wastewaterSeries.length) ||
    Number.isFinite(sig.ariLevel);
}

function resolveState(abbr) {
  if (!abbr || abbr === 'US') return US;
  return stateByAbbr(abbr) || US;
}

function render(store, abbr) {
  const st = resolveState(abbr);
  const signals = store.signals.get(st.abbr) || store.signals.get('US');
  if (!signals) return;
  const model = computeModel(signals);
  const opts = { weekEnding: store.weekEnding, provenance: store.provenance };

  setRegion('threat-card', threatCard(st, model, opts));
  setRegion('pathogen-tiles', pathogenTiles(model));
  setRegion('signal-rows', signalRows(signals));

  // Home-only regions.
  setText('state-name', st.isNational ? 'the U.S.' : st.name);
  const link = document.querySelector('[data-region="state-link"]');
  if (link) link.setAttribute('href', st.isNational ? '/states/' : `/state/${st.slug}/`);

  // State-page "at a glance" regions.
  setRegion('glance-level', `<strong>${escapeText(model.label)}</strong>`);
  setRegion(
    'glance-trend',
    `${escapeText(model.trend.label)} ${model.trend.direction !== 'flat' ? escapeText(formatChange(model.trend.changePct)) : ''}`
  );
  setText('glance-week', formatDate(store.weekEnding));
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
    render(store, abbr);
    document.getElementById('breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    apply(select.value);
  });
  select.addEventListener('change', () => {
    onChange(select.value);
    saveSelection(select.value);
    render(store, select.value);
  });

  if (geoBtn && 'geolocation' in navigator) {
    geoBtn.addEventListener('click', () => locate(select, apply, geoBtn));
  } else if (geoBtn) {
    geoBtn.hidden = true;
  }
}

// Reverse-geolocate to a state using the free, keyless FCC Area API (US only).
async function locate(select, apply, btn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Locating…';
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 600000 })
    );
    const { latitude, longitude } = pos.coords;
    const url = `https://geo.fcc.gov/api/census/area?lat=${latitude}&lon=${longitude}&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    const stateAbbr = data?.results?.[0]?.state_code;
    const st = stateAbbr && stateByAbbr(stateAbbr);
    if (st) {
      select.value = st.abbr;
      apply(st.abbr);
    } else {
      throw new Error('No state match');
    }
  } catch (e) {
    btn.textContent = 'Location unavailable';
    setTimeout(() => (btn.innerHTML = original), 2500);
    btn.disabled = false;
    return;
  }
  btn.innerHTML = original;
  btn.disabled = false;
}

function announceLive(live) {
  const region = document.getElementById('live-status');
  if (region) region.textContent = `Live CDC data loaded (week ending ${formatDate(live.weekEnding)}).`;
}
