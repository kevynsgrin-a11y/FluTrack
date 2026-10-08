// ===========================================================================
// FluTrack app controller.
//
// Lifecycle:
//   1. Server-rendered HTML is already on screen — pre-rendered at build time
//      from live CDC data, or from the labeled sample if the feed was down.
//   2. Load the snapshot the page was built from → build a data store →
//      (re)render selection. Its `kind` decides the provenance badge, so a
//      live pre-render stays "Live CDC data" instead of flashing to sample.
//   3. Refresh from the live CDC feed in the browser only when the shipped
//      snapshot is sample data or a newer CDC week may exist
//      (shouldRefreshLive) — otherwise it would re-download the same week.
//   4. Wire the state picker + geolocation (home page only).
//
// Rendering reuses the exact same functions as the build, so re-renders never
// mismatch the static markup.
// ===========================================================================

import { loadSnapshot, fetchLiveSignals, hasSignalData, shouldRefreshLive } from './data-sources.js';
import { computeModel } from './model.js';
import { nationalSignals } from './aggregate.js';
import { threatCard, pathogenTiles, signalRows, levelToken, trendChip } from './render.js';
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
  let snap = null;
  try {
    snap = await loadSnapshot('');
    ingestSnapshot(store, snap);
  } catch (e) {
    console.warn('[FluTrack] snapshot load failed', e);
  }

  // Determine initial selection.
  let selection = isStatePage ? pinnedAbbr : readSavedSelection();
  render(store, selection);
  if (!isStatePage) wirePicker(store, (abbr) => (selection = abbr));

  // --- 2. Live refresh (progressive enhancement) -------------------------
  if (!shouldRefreshLive(snap)) return;
  try {
    // fetchLiveSignals() only resolves when >= 25 states carry real data and
    // the week is valid, so a successful result here is genuinely live.
    const live = await fetchLiveSignals();
    // Never step backwards: a lagging cache must not replace a newer pre-render.
    if (store.provenance.live && live.weekEnding < store.weekEnding) return;
    ingestLive(store, live);
    store.provenance = { live: true, sources: live.sources };
    render(store, selection);
    announceLive(live);
  } catch (e) {
    console.info(`[FluTrack] live CDC feed unavailable, keeping the ${store.provenance.live ? 'build-time CDC data' : 'sample data'}`, e?.message || e);
  }
}

function ingestSnapshot(store, snap) {
  store.weekEnding = snap.weekEnding;
  store.provenance = snap.kind === 'live' ? { live: true, sources: snap.sources || [] } : { live: false };
  for (const [abbr, sig] of Object.entries(snap.states || {})) {
    store.signals.set(abbr, sig);
  }
  store.signals.set('US', nationalSignals([...store.signals.values()]));
}

function ingestLive(store, live) {
  // Over SAMPLE data every state is replaced — one with no live readings shows
  // "No data" rather than keeping a sample figure under a "Live" badge. Over a
  // live pre-render, a state the refresh lacks keeps its build-time CDC data.
  const replaceAll = !store.provenance.live;
  store.weekEnding = live.weekEnding || store.weekEnding;
  for (const [abbr, sig] of live.signalsByAbbr) {
    if (replaceAll || hasSignalData(sig)) store.signals.set(abbr, sig);
  }
  store.signals.set('US', nationalSignals(states.map((s) => store.signals.get(s.abbr)).filter(Boolean)));
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
    model.trend.direction !== 'flat'
      ? `${escapeText(model.trend.label)} ${escapeText(formatChange(model.trend.changePct))}`
      : escapeText(model.trend.label)
  );
  setText('glance-week', formatDate(store.weekEnding));
  setRegion('sticky-level', levelToken(model.level, model.label));
  setRegion('sticky-trend', trendChip(model.trend));
  const stickyLevel = document.querySelector('[data-region="sticky-level"]');
  if (stickyLevel && Number.isFinite(model.level)) stickyLevel.setAttribute('data-sev', String(model.level));
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
      // Mirror map-render.js exactly, rank included — hydration used to drop
      // the ", level N" the server-rendered label carries.
      if (st) {
        const rank = Number.isFinite(m.level) ? `, level ${m.level}` : '';
        tile.setAttribute('aria-label', `${st.name}: ${m.label}${rank}. View ${st.name} report.`);
      }
    }
    tile.classList.toggle('is-selected', abbr === selectedAbbr);
  });
}

// Announce a picker-driven change to assistive tech via the polite live region.
function announceSelection(st, model) {
  const region = document.getElementById('live-status');
  if (region) region.textContent = `${st.isNational ? 'United States' : st.name}: ${model.label}, ${model.trend.label}.`;
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
