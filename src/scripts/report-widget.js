// ===========================================================================
// "Check your area / Report how you feel" — progressive enhancement over the
// server-rendered forms in the home page (build/lib/report-section.mjs).
// No dependencies; loaded lazily by report-boot.js.
//
//   * first interaction → GET /api/area (approximate location) → "Looks like
//     you're near <County>, <ST> — Correct? [Yes] [Change ZIP]"
//   * the result card is the same markup the no-JS page renders
//     (report-render.js), then the globe loads lazily after it
//   * the Turnstile script loads only once the report form is used
//   * one report per device per 7 days: localStorage "ff_last_report" holds
//     only a timestamp (disclosed on /vendors/ and in the privacy notices)
// ===========================================================================

import { resultCard } from './report-render.js';

const LAST_KEY = 'ff_last_report';
const WEEK_MS = 7 * 86_400_000;
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let section;
let current = null; // last area payload
let confirmedZip = '';
let turnstileReady = null;
let widgetId = null;

const $ = (sel) => section.querySelector(sel);

function storage(fn, fallback = null) {
  try {
    return fn(window.localStorage);
  } catch (e) {
    return fallback;
  }
}

const lastReport = () => Number(storage((s) => s.getItem(LAST_KEY))) || 0;

function status(el, msg, kind = '') {
  if (!el) return;
  el.textContent = msg;
  el.dataset.state = kind;
}

async function getArea(zip) {
  const qs = zip ? `?zip=${encodeURIComponent(zip)}` : '';
  const res = await fetch(`/api/area${qs}`, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Could not load your area.'), { code: data.error, status: res.status });
  return data;
}

function placeName(p) {
  return p.location.county_name ? `${p.location.county_name}, ${p.location.state}` : p.location.state_name;
}

async function locate() {
  const areaStatus = $('[data-area-status]');
  status(areaStatus, 'Finding your area…');
  try {
    current = await getArea('');
    status(areaStatus, '');
    const box = $('[data-confirm]');
    box.querySelector('[data-place]').textContent = placeName(current);
    box.hidden = false;
  } catch (e) {
    status(areaStatus, e.code === 'us_only' ? 'FluFollower is US-only for now.' : 'Enter your ZIP code to check your area.', e.code === 'us_only' ? 'error' : '');
    if (e.code !== 'us_only') $('#area-zip')?.focus();
  }
}

function render(payload, heading = '') {
  current = payload;
  const out = $('[data-result]');
  out.innerHTML = resultCard(payload, { heading });
  const share = out.querySelector('[data-share]');
  if (share && navigator.share) {
    share.hidden = false;
    share.addEventListener('click', () => {
      navigator.share({ title: 'FluTrack', text: share.dataset.share, url: `${location.origin}/` }).catch(() => {});
    });
  }
  out.querySelector('.result')?.setAttribute('tabindex', '-1');
  out.querySelector('.result')?.focus({ preventScroll: true });
  out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  mountGlobeLater(out.querySelector('[data-globe]'), payload);
}

function mountGlobeLater(el, payload) {
  if (!el) return;
  const start = () => {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    idle(() =>
      import('./globe.js')
        .then((m) => m.mountGlobe(el, { state: payload.location.state, level: payload.level?.level }))
        .catch(() => {})
    );
  };
  if (!('IntersectionObserver' in window)) return start();
  const io = new IntersectionObserver((entries) => {
    if (entries.some((x) => x.isIntersecting)) {
      io.disconnect();
      start();
    }
  });
  io.observe(el);
}

// --- Turnstile ------------------------------------------------------------- //

function loadTurnstile(form) {
  if (turnstileReady) return turnstileReady;
  const sitekey = form.dataset.sitekey;
  const host = form.querySelector('[data-turnstile]');
  turnstileReady = new Promise((resolve, reject) => {
    window.onFluTurnstile = () => {
      try {
        widgetId = window.turnstile.render(host, { sitekey, size: 'flexible', appearance: 'interaction-only', action: 'report' });
        resolve(widgetId);
      } catch (e) {
        reject(e);
      }
    };
    const s = document.createElement('script');
    s.src = `${TURNSTILE_SRC}&onload=onFluTurnstile`;
    s.async = true;
    s.onerror = () => reject(new Error('turnstile'));
    document.head.appendChild(s);
  });
  return turnstileReady;
}

function turnstileToken() {
  try {
    return widgetId != null ? window.turnstile.getResponse(widgetId) || '' : '';
  } catch (e) {
    return '';
  }
}

// --- Submits ---------------------------------------------------------------- //

async function submitArea(form) {
  const zip = (form.elements.zip?.value || '').trim();
  const areaStatus = $('[data-area-status]');
  if (zip && !/^\d{5}$/.test(zip)) return status(areaStatus, 'Please enter a 5-digit ZIP code.', 'error');
  status(areaStatus, 'Loading this week’s CDC data…');
  try {
    const payload = zip ? await getArea(zip) : current || (await getArea(''));
    if (zip) confirmedZip = zip;
    $('[data-confirm]').hidden = true;
    status(areaStatus, '');
    render(payload);
  } catch (e) {
    status(areaStatus, e.message, 'error');
  }
}

async function submitReport(form, submitter) {
  const out = form.querySelector('[data-report-status]');
  if (!form.reportValidity()) return;
  const last = lastReport();
  if (last && Date.now() - last < WEEK_MS) {
    return status(out, 'You’ve already sent a report from this device this week — thank you. You can report again after 7 days.', 'success');
  }
  const feeling = submitter?.value === 'sick' ? 'sick' : 'fine';
  const body = Object.fromEntries(new FormData(form).entries());
  body.feeling = feeling;
  if (!body.zip && confirmedZip) body.zip = confirmedZip;
  body.returning = last ? '1' : '0';
  try {
    await loadTurnstile(form);
  } catch (e) {
    return status(out, 'The bot check could not load. Please try again in a moment.', 'error');
  }
  status(out, 'Running a quick, private bot check…');
  for (let i = 0; i < 24 && !(body['cf-turnstile-response'] ||= turnstileToken()); i += 1) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!body['cf-turnstile-response']) {
    return status(out, 'The bot check needs a moment — please complete it above and press the button again.', 'error');
  }

  const btns = form.querySelectorAll('button[type="submit"]');
  btns.forEach((b) => (b.disabled = true));
  status(out, 'Sending…');
  try {
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 202 && data.area) {
      storage((s) => s.setItem(LAST_KEY, String(Date.now())));
      form.reset();
      form.querySelector('[data-sick]')?.removeAttribute('open');
      status(out, 'Thanks — your report was counted.', 'success');
      render(data.area, 'Thanks — your report was counted. Community numbers update once a day.');
    } else if (res.status === 503) {
      status(out, data.message || 'Symptom reporting is paused right now.', 'error');
    } else {
      status(out, data.message || 'Something went wrong. Please try again shortly.', 'error');
    }
  } catch (e) {
    status(out, 'Network error — please try again in a moment.', 'error');
  } finally {
    btns.forEach((b) => (b.disabled = false));
    try {
      if (widgetId != null) window.turnstile.reset(widgetId);
    } catch (e) {
      /* ignore */
    }
  }
}

export function handleSubmit(form, submitter) {
  if (form.matches('[data-area-form]')) return submitArea(form);
  if (form.matches('[data-report-form]')) return submitReport(form, submitter);
  return undefined;
}

export function init(root) {
  if (section) return { handleSubmit };
  section = root;
  locate();
  $('[data-confirm-yes]')?.addEventListener('click', () => {
    $('[data-confirm]').hidden = true;
    if (current) render(current);
  });
  $('[data-confirm-change]')?.addEventListener('click', () => {
    $('[data-confirm]').hidden = true;
    $('#area-zip')?.focus();
  });
  const form = $('[data-report-form]');
  if (form) {
    const last = lastReport();
    if (last && Date.now() - last < WEEK_MS) {
      status(form.querySelector('[data-report-status]'), 'You’ve already reported from this device this week — thank you.', 'success');
    }
    form.addEventListener('focusin', () => loadTurnstile(form).catch(() => {}), { once: true });
  }
  return { handleSubmit };
}
