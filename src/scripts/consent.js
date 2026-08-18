// ===========================================================================
// Consent gate for non-essential storage.
//
// The rule this enforces: **no non-essential tag runs until a decision is
// recorded.** Not "until the banner is dismissed", not "unless the visitor is
// outside the EU" — until an actual, timestamped decision exists.
//
// Three design choices worth stating, because each is deliberate:
//
//   1. DEFAULT DENY EVERYWHERE, not only where consent law applies. Deciding
//      per-jurisdiction means geolocating every visitor before you are allowed
//      to store anything about them, and getting that lookup wrong fails in the
//      dangerous direction — an EU visitor misread as US would load ad tags
//      with no consent at all. Denying globally is strictly stronger and needs
//      no location signal, which is itself the more private design.
//
//   2. NO BANNER UNTIL THERE IS SOMETHING TO CONSENT TO. `VENDORS` is the
//      registry of gated tags. While nothing is registered in a category there
//      is no lawful basis question to put to the visitor, and interrupting them
//      to ask anyway is how people learn to click "accept" without reading. The
//      banner appears by itself the moment a gated vendor is registered.
//
//   3. GLOBAL PRIVACY CONTROL IS A DECISION, NOT A HINT. A visitor sending GPC
//      has already answered; we record a denial on their behalf, never show the
//      banner, and say so on the preferences page. They can still override it
//      there — an opt-out signal must not become a lock-out.
//
// Storage: one `flutrack-consent` localStorage entry, first-party, no cookie,
// never transmitted. Essential processors (hosting, the alert store, the FCC
// geocoder) are outside this gate by definition and are documented at /vendors/.
// ===========================================================================

export const CONSENT_KEY = 'flutrack-consent';
// Bump when the category set or its meaning changes: an old decision no longer
// answers the new question, so it is re-asked rather than silently reused.
export const CONSENT_VERSION = 1;

export const CATEGORIES = ['analytics', 'advertising'];

/**
 * Non-essential tags, gated by category. Registering one is what arms the
 * banner — the registry is intentionally empty today because FluTrack runs no
 * advertising and its only analytics (Cloudflare Web Analytics) is cookieless
 * and writes nothing to the device, so it never reaches this gate.
 *
 * Shape: { key, category, label, load() }
 * `load` is called at most once, and only after that category is granted.
 */
const VENDORS = [];

const DENY_ALL = Object.freeze(
  CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: false }), {})
);

const listeners = new Set();
const loaded = new Set();

// --- Global Privacy Control ----------------------------------------------- //

/** True when the browser is sending a GPC opt-out signal. */
export function gpcEnabled() {
  try {
    return navigator.globalPrivacyControl === true;
  } catch (e) {
    return false;
  }
}

// --- Stored decision ------------------------------------------------------ //

/**
 * The recorded decision, or null if none exists (or it predates the current
 * category set). Never throws: storage can be blocked entirely.
 */
export function readDecision() {
  let raw;
  try {
    raw = localStorage.getItem(CONSENT_KEY);
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!parsed || parsed.version !== CONSENT_VERSION || !parsed.grants) return null;
  return parsed;
}

/**
 * Record a decision.
 * @param grants {analytics: bool, advertising: bool}
 * @param source 'banner' | 'preferences' | 'gpc'
 */
export function writeDecision(grants, source) {
  const clean = {};
  for (const c of CATEGORIES) clean[c] = grants[c] === true;
  const record = {
    version: CONSENT_VERSION,
    grants: clean,
    source: source || 'preferences',
    // The timestamp is the point of the record: "we had consent" is only
    // demonstrable if you can say when it was given and what was asked.
    recordedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch (e) {
    /* storage blocked — the decision still applies for this page view */
  }
  applyGrants(clean);
  for (const fn of listeners) {
    try {
      fn(record);
    } catch (e) {
      /* a bad listener must not break the gate */
    }
  }
  return record;
}

/** Current grants. Denied for everything until a decision says otherwise. */
export function currentGrants() {
  const decision = readDecision();
  return decision ? decision.grants : { ...DENY_ALL };
}

/** True when the visitor has an explicit, current-version decision on file. */
export function decisionRecorded() {
  return readDecision() !== null;
}

/** Subscribe to decision changes. Returns an unsubscribe function. */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// --- The gate itself ------------------------------------------------------ //

/**
 * Register a non-essential tag. It will load if and when its category is
 * granted, and never before. Safe to call at any time.
 */
export function register(vendor) {
  if (!vendor || !vendor.key || !CATEGORIES.includes(vendor.category)) return;
  if (VENDORS.some((v) => v.key === vendor.key)) return;
  VENDORS.push(vendor);
  applyGrants(currentGrants());
  refreshBanner();
}

/** Categories that have at least one gated vendor registered against them. */
export function gatedCategories() {
  return CATEGORIES.filter((c) => VENDORS.some((v) => v.category === c));
}

/** Load whatever is now permitted. Idempotent — each vendor loads at most once. */
function applyGrants(grants) {
  for (const vendor of VENDORS) {
    if (!grants[vendor.category] || loaded.has(vendor.key)) continue;
    loaded.add(vendor.key);
    try {
      vendor.load();
    } catch (e) {
      console.warn(`[FluTrack] consented vendor "${vendor.key}" failed to load`, e);
    }
  }
}

// --- Banner --------------------------------------------------------------- //

const BANNER_ID = 'consent-banner';

/**
 * Show the banner only when there is a real question outstanding: a gated
 * vendor exists, and no decision has been recorded for its category.
 */
function bannerNeeded() {
  if (decisionRecorded()) return false;
  return gatedCategories().length > 0;
}

function removeBanner() {
  const existing = document.getElementById(BANNER_ID);
  if (existing) existing.remove();
}

function refreshBanner() {
  if (typeof document === 'undefined') return;
  if (!bannerNeeded()) {
    removeBanner();
    return;
  }
  if (document.getElementById(BANNER_ID)) return;
  renderBanner();
}

/**
 * Reject all, Manage preferences and Accept all are rendered with the SAME
 * button class and the same order of appearance every time. Equal prominence is
 * the requirement; styling the accept path more heavily is the dark pattern
 * this is guarding against.
 */
function renderBanner() {
  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.className = 'consent-banner';
  // A landmark region, not a dialog. We deliberately do NOT move or trap focus:
  // declining to decide is a valid outcome (everything stays denied), so the
  // banner must not interrupt. role="dialog" would promise focus management
  // that never arrives, leaving the banner unannounced in some screen readers.
  el.setAttribute('role', 'region');
  el.setAttribute('aria-labelledby', 'consent-banner-title');
  el.innerHTML = `
    <div class="consent-banner__inner">
      <div class="consent-banner__copy">
        <p class="consent-banner__title" id="consent-banner-title">Your choice about non-essential storage</p>
        <p class="consent-banner__text">FluTrack works without any of this. We ask before advertising or analytics
        storage is used on your device, and nothing loads until you decide.
        <a href="/consent/">What this covers</a> · <a href="/privacy/">Privacy Policy</a></p>
      </div>
      <div class="consent-banner__actions">
        <button class="btn btn--secondary" type="button" data-consent="reject">Reject all</button>
        <button class="btn btn--secondary" type="button" data-consent="manage">Manage preferences</button>
        <button class="btn btn--secondary" type="button" data-consent="accept">Accept all</button>
      </div>
    </div>`;

  el.addEventListener('click', (e) => {
    const action = e.target.closest('[data-consent]')?.getAttribute('data-consent');
    if (!action) return;
    if (action === 'manage') {
      window.location.href = '/consent/';
      return;
    }
    const grant = action === 'accept';
    writeDecision(
      CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: grant }), {}),
      'banner'
    );
    removeBanner();
    announce(grant ? 'Non-essential storage allowed.' : 'Non-essential storage rejected.');
  });

  document.body.appendChild(el);
}

function announce(message) {
  const live = document.getElementById('live-status');
  if (live) live.textContent = message;
}

// --- Preferences page wiring ---------------------------------------------- //

/**
 * Wire the /consent/ preference form, if it is on the page. The markup is
 * server-rendered so it works as a plain, readable page even if this never
 * runs; this only makes the controls live.
 */
function initPreferences() {
  const form = document.getElementById('consent-preferences');
  if (!form) return;

  const status = form.querySelector('[data-consent-status]');
  const gpc = gpcEnabled();

  const paint = () => {
    const grants = currentGrants();
    const decision = readDecision();
    for (const c of CATEGORIES) {
      const box = form.querySelector(`input[name="${c}"]`);
      if (box) box.checked = grants[c] === true;
    }
    if (!status) return;
    if (decision) {
      const allowed = CATEGORIES.filter((c) => decision.grants[c]);
      const via =
        decision.source === 'gpc'
          ? ' (recorded automatically from your browser’s Global Privacy Control signal)'
          : '';
      status.textContent = allowed.length
        ? `Current setting: ${allowed.join(' and ')} allowed. Recorded ${formatWhen(
            decision.recordedAt
          )}${via}.`
        : `Current setting: all non-essential storage rejected. Recorded ${formatWhen(
            decision.recordedAt
          )}${via}.`;
    } else {
      status.textContent =
        'Current setting: all non-essential storage is denied. No decision has been recorded yet, and nothing non-essential has run.';
    }
  };

  form.addEventListener('click', (e) => {
    const action = e.target.closest('[data-consent]')?.getAttribute('data-consent');
    if (!action) return;
    e.preventDefault();
    if (action === 'accept' || action === 'reject') {
      const grant = action === 'accept';
      writeDecision(
        CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: grant }), {}),
        'preferences'
      );
    } else if (action === 'save') {
      const grants = {};
      for (const c of CATEGORIES) {
        grants[c] = Boolean(form.querySelector(`input[name="${c}"]`)?.checked);
      }
      writeDecision(grants, 'preferences');
    } else if (action === 'withdraw') {
      // Withdrawal must be as easy as granting: clear the record entirely and
      // fall back to deny-by-default.
      try {
        localStorage.removeItem(CONSENT_KEY);
      } catch (err) {
        /* ignore */
      }
      loaded.clear();
    }
    paint();
    refreshBanner();
    announce('Your storage preferences were updated.');
  });

  const gpcNote = form.querySelector('[data-consent-gpc]');
  if (gpcNote) {
    gpcNote.textContent = gpc
      ? 'Your browser is sending a Global Privacy Control signal, so non-essential storage was rejected automatically. You can still change it here.'
      : 'Your browser is not sending a Global Privacy Control signal. If you turn one on, we will honor it automatically.';
  }

  paint();
}

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (e) {
    return 'previously';
  }
}

// --- Boot ----------------------------------------------------------------- //

function init() {
  // GPC first: it is an expressed decision, so it must be on file before
  // anything consults the gate, and it must suppress the banner rather than
  // asking a question the visitor has already answered.
  if (gpcEnabled() && !decisionRecorded()) {
    writeDecision({ ...DENY_ALL }, 'gpc');
  }
  applyGrants(currentGrants());
  initPreferences();
  refreshBanner();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
