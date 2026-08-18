// ===========================================================================
// Cloudflare Pages Function — POST /api/csp-report
//
// First-party collector for Content-Security-Policy violation reports. The
// `_headers` CSP names it twice, because the two report transports are not
// interchangeable:
//   * `report-uri /api/csp-report`  — deprecated, but still the only form
//                                     Safari sends. Content-Type is
//                                     application/csp-report.
//   * `report-to csp-endpoint`      — the current Reporting API, declared by
//                                     the Reporting-Endpoints response header.
//                                     Content-Type is application/reports+json.
//
// A `report-to` directive pointing at nothing is worse than no reporting at
// all: the policy claims an oversight mechanism that silently discards every
// violation. This endpoint is deliberately small — it validates, bounds, and
// logs a compact summary to the Workers log stream. It stores nothing, sets no
// cookie, and returns no body, so there is no personal-data response here to
// mis-scope with CORS. No Access-Control-Allow-Origin header is emitted at all,
// and credentials are never accepted cross-origin: reports are same-origin by
// construction.
// ===========================================================================

// Reports are unauthenticated and attacker-reachable, so the body is bounded
// before it is ever parsed.
const MAX_BODY_BYTES = 64 * 1024;

const ACCEPTED_TYPES = /^application\/(csp-report|reports\+json|json)\b/;

// Browser extensions inject scripts and styles into every page and generate a
// constant stream of violations that say nothing about this site's policy.
const NOISE_SCHEMES =
  /^(chrome|moz|safari-web|safari|webkit|ms-browser)-extension:|^about:|^data:text\/html/i;

const NO_STORE = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function onRequestPost({ request }) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!ACCEPTED_TYPES.test(type)) {
    return new Response(null, { status: 415, headers: NO_STORE });
  }

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) {
    return new Response(null, { status: 413, headers: NO_STORE });
  }

  let raw;
  try {
    raw = await request.text();
  } catch (e) {
    return new Response(null, { status: 400, headers: NO_STORE });
  }
  // Content-Length is a claim, not a guarantee — check the body we actually got.
  if (raw.length > MAX_BODY_BYTES) {
    return new Response(null, { status: 413, headers: NO_STORE });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return new Response(null, { status: 400, headers: NO_STORE });
  }

  for (const report of normalize(parsed)) {
    if (NOISE_SCHEMES.test(report.blockedUri)) continue;
    // One compact line per real violation. Deliberately no IP, no user-agent
    // and no cookies — a violation report is a policy signal, not a visitor
    // record, and this endpoint should not become one.
    console.warn(
      `[csp] ${report.effectiveDirective} blocked ${report.blockedUri} on ${report.documentUri}` +
        (report.sample ? ` — sample: ${report.sample}` : '')
    );
  }

  // 204: the browser wants an acknowledgement, not a payload.
  return new Response(null, { status: 204, headers: NO_STORE });
}

/**
 * Flatten either transport into one shape.
 * `report-uri` posts a single `{"csp-report": {...}}`; the Reporting API posts
 * an array of `{ type, body }` envelopes that may also carry non-CSP reports.
 */
function normalize(payload) {
  const out = [];
  const push = (body) => {
    if (!body || typeof body !== 'object') return;
    out.push({
      effectiveDirective: clamp(
        body['effective-directive'] ||
          body.effectiveDirective ||
          body['violated-directive'] ||
          'unknown',
        64
      ),
      blockedUri: clamp(body['blocked-uri'] || body.blockedURL || 'unknown', 256),
      documentUri: clamp(body['document-uri'] || body.documentURL || 'unknown', 256),
      sample: clamp(body['script-sample'] || body.sample || '', 128),
    });
  };

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (entry && entry.type === 'csp-violation') push(entry.body);
    }
  } else if (payload && payload['csp-report']) {
    push(payload['csp-report']);
  }
  return out;
}

/** Bound and strip control characters from an attacker-supplied string. */
function clamp(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .slice(0, max);
}
