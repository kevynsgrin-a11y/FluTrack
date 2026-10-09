// ===========================================================================
// Small HTTP helpers shared by the Pages Functions.
// ===========================================================================

/** 15 minutes at the browser and the edge, matching the API contract. */
export const AREA_CACHE = 'public, max-age=900';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

/** True when a submission came from a native form post that expects a page back. */
export function wantsHtml(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return false;
  return (
    request.headers.get('sec-fetch-dest') === 'document' ||
    (request.headers.get('accept') || '').includes('text/html')
  );
}

/**
 * Same-origin guard for state-changing POSTs. A cross-origin <form> can drive
 * an endpoint without JS (urlencoded bodies are CORS "simple requests").
 */
export function isCrossOrigin(request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch (e) {
    return true;
  }
}

/** Read a JSON or form-encoded body into a plain object. Repeated keys become arrays. */
export async function readBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await request.json()) || {};
  const form = await request.formData();
  const out = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== 'string') continue; // no file uploads, ever
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

/**
 * Feature flag: FEATURE_REPORT=false switches the report feature off (the
 * build hides the widget; the endpoints answer 503). Anything else = on.
 */
export function reportEnabled(env) {
  return String(env?.FEATURE_REPORT ?? 'true').toLowerCase() !== 'false';
}
