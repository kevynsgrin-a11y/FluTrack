// ===========================================================================
// Cloudflare Pages Function — POST /api/subscribe
//
// Backs the "surge alert" email signup. Deployment-agnostic by design:
//   * If a KV namespace binding `SUBSCRIBERS` is configured, the subscription is
//     persisted (keyed by email) — deduped and timestamped.
//   * If `ALERTS_WEBHOOK_URL` is configured (e.g. an email provider / automation
//     endpoint), the subscription is forwarded to it.
//   * If NEITHER is configured, we respond 501 so the client shows a friendly
//     "not switched on in this demo" message instead of a hard error.
//
// Bind these in the Cloudflare Pages dashboard (Settings → Functions):
//   KV namespace: SUBSCRIBERS
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

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      payload = await request.json();
    } else {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
    }
  } catch (e) {
    return json({ ok: false, message: 'Invalid request body.' }, 400);
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const state = String(payload.state || '').trim().toUpperCase();
  const honeypot = String(payload.company || '').trim(); // bots fill hidden fields

  // Silently accept-and-drop obvious bot submissions.
  if (honeypot) return json({ ok: true, message: 'Thanks!' });

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ ok: false, message: 'Please enter a valid email address.' }, 422);
  }
  if (!US_STATES.has(state)) {
    return json({ ok: false, message: 'Please choose a valid U.S. state.' }, 422);
  }

  const record = {
    email,
    state,
    source: 'flutrack-web',
    ts: new Date().toISOString(),
    ua: request.headers.get('user-agent') || '',
    country: request.headers.get('cf-ipcountry') || '',
  };

  const hasKv = env && env.SUBSCRIBERS && typeof env.SUBSCRIBERS.put === 'function';
  const hasWebhook = env && env.ALERTS_WEBHOOK_URL;

  if (!hasKv && !hasWebhook) {
    // Not configured in this deployment — the client treats 501 gracefully.
    return json(
      { ok: false, message: 'Subscription delivery is not configured in this deployment.' },
      501
    );
  }

  // Best-effort per-IP rate limiting (requires KV). Caps abuse of the public
  // endpoint; eventually-consistent, so it is friction, not a hard guarantee.
  if (hasKv) {
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

  // Run the durable write and the optional webhook independently. Success is
  // gated on the DURABLE store (KV) when present; a webhook-only failure is
  // logged but does not fail the request.
  let durableOk = !hasKv; // if no KV, success rides on the webhook
  if (hasKv) {
    try {
      await env.SUBSCRIBERS.put(`sub:${email}`, JSON.stringify(record), {
        metadata: { state, ts: record.ts },
      });
      durableOk = true;
    } catch (e) {
      durableOk = false;
    }
  }
  if (hasWebhook) {
    const webhookOk = await postWebhook(env.ALERTS_WEBHOOK_URL, record);
    if (!hasKv) durableOk = webhookOk;
  }

  if (!durableOk) {
    return json({ ok: false, message: 'Could not save your subscription. Please try again shortly.' }, 502);
  }

  return json({
    ok: true,
    message: "You're on the list. We'll email you when activity climbs in your state.",
  });
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
