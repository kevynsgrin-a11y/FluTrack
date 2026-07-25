// ===========================================================================
// Cloudflare Pages Function — POST /api/subscribe
//
// Backs the "surge alert" email signup. Deployment-agnostic by design:
//   * The KV namespace binding `SUBSCRIBERS` is REQUIRED. It stores the
//     subscription (keyed by email, deduped and timestamped) and backs the
//     per-IP rate limiter. Without it the endpoint declines all work with 501,
//     because an unmetered public POST endpoint that forwards arbitrary
//     addresses to an email provider is an open relay.
//   * If `ALERTS_WEBHOOK_URL` is also configured (e.g. an email provider /
//     automation endpoint), each subscription is additionally forwarded to it on
//     a best-effort basis; KV remains the source of truth.
//   * If KV is absent we respond 501 so the client shows a friendly
//     "not switched on in this demo" message instead of a hard error.
//
// Bind these in the Cloudflare Pages dashboard (Settings → Functions):
//   KV namespace: SUBSCRIBERS          (required)
//   Env var:      ALERTS_WEBHOOK_URL   (optional)
// ===========================================================================

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Redirect non-JSON (i.e. no-JS form) submissions back to a human-readable page.
 * The endpoint only ever returned JSON, so a visitor without JS landed on a
 * white page showing a raw object.
 */
function seeOther(path) {
  return new Response(null, {
    status: 303,
    headers: { Location: path, 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  // A cross-origin <form> can drive this endpoint without JS (urlencoded bodies
  // are CORS "simple requests"), so reject anything that did not originate here.
  const originHeader = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return json({ ok: false, message: 'Cross-origin submissions are not accepted.' }, 403);
  }
  if (originHeader) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(originHeader).origin === new URL(request.url).origin;
    } catch (e) {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      return json({ ok: false, message: 'Cross-origin submissions are not accepted.' }, 403);
    }
  }

  let payload;
  let wantsHtml = false;
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      payload = await request.json();
    } else {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
      // A native form POST (no fetch) expects a document back, not JSON.
      wantsHtml =
        request.headers.get('sec-fetch-dest') === 'document' ||
        (request.headers.get('accept') || '').includes('text/html');
    }
  } catch (e) {
    return json({ ok: false, message: 'Invalid request body.' }, 400);
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const state = String(payload.state || '').trim().toUpperCase();
  const honeypot = String(payload.company || '').trim(); // bots fill hidden fields

  // Silently accept-and-drop obvious bot submissions.
  if (honeypot) {
    return wantsHtml ? seeOther('/alerts/?subscribed=1') : json({ ok: true, message: 'Thanks!' });
  }

  const hasKv = env && env.SUBSCRIBERS && typeof env.SUBSCRIBERS.put === 'function';
  const hasWebhook = env && env.ALERTS_WEBHOOK_URL;

  // KV is now REQUIRED, not optional. The rate limiter below is backed by KV, so
  // a webhook-only deployment previously accepted unlimited unauthenticated
  // POSTs with arbitrary victim addresses — a free relay into whatever email
  // provider sits behind the webhook. Without a durable counter we decline the
  // work entirely; the client already treats 501 as a friendly "not switched on".
  if (!hasKv) {
    return json(
      { ok: false, message: 'Subscription delivery is not configured in this deployment.' },
      501
    );
  }

  // Best-effort per-IP rate limiting, BEFORE validation so that a flood of
  // malformed submissions is also counted. Eventually-consistent, so it is
  // friction, not a hard guarantee.
  {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const rlKey = `rl:${ip}`;
    try {
      const count = parseInt((await env.SUBSCRIBERS.get(rlKey)) || '0', 10);
      if (count >= 10) {
        return json({ ok: false, message: 'Too many requests. Please try again later.' }, 429);
      }
      await env.SUBSCRIBERS.put(rlKey, String(count + 1), { expirationTtl: 3600 });
    } catch (e) {
      /* rate-limit store hiccup should not block a legitimate signup */
    }
  }

  // Cheap length guard before the regex.
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return wantsHtml
      ? seeOther('/alerts/?error=email')
      : json({ ok: false, message: 'Please enter a valid email address.' }, 422);
  }
  if (!US_STATES.has(state)) {
    return wantsHtml
      ? seeOther('/alerts/?error=state')
      : json({ ok: false, message: 'Please choose a valid U.S. state.' }, 422);
  }

  const record = {
    email,
    state,
    source: 'flutrack-web',
    ts: new Date().toISOString(),
    // Truncated and stripped of control characters: this value is attacker-
    // controlled and is relayed to a third-party system that may render it.
    ua: sanitizeHeader(request.headers.get('user-agent'), 256),
    country: sanitizeHeader(request.headers.get('cf-ipcountry'), 8),
  };

  // Run the durable write and the optional webhook independently. Success is
  // gated on the DURABLE store (KV) when present; a webhook-only failure is
  // logged but does not fail the request.
  let durableOk = false;
  try {
    await env.SUBSCRIBERS.put(`sub:${email}`, JSON.stringify(record), {
      metadata: { state, ts: record.ts },
    });
    durableOk = true;
  } catch (e) {
    durableOk = false;
  }
  // The webhook is a best-effort side-channel; KV is the source of truth.
  if (hasWebhook) await postWebhook(env.ALERTS_WEBHOOK_URL, record);

  if (!durableOk) {
    return wantsHtml
      ? seeOther('/alerts/?error=save')
      : json({ ok: false, message: 'Could not save your subscription. Please try again shortly.' }, 502);
  }

  return wantsHtml
    ? seeOther('/alerts/?subscribed=1')
    : json({
        ok: true,
        message: "You're on the list. We'll email you when activity climbs in your state.",
      });
}

/** Clamp an attacker-controlled header to a bounded, printable string. */
function sanitizeHeader(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, max);
}

/** POST the record to an external webhook with a hard timeout. Returns bool. */
async function postWebhook(url, record) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
      signal: controller.signal,
    });
    return res.ok;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Only POST is handled; Pages returns 405 automatically for other methods.
