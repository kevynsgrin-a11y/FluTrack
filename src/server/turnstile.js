// ===========================================================================
// Cloudflare Turnstile server-side verification.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
// ===========================================================================

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 * Missing token or secret fails closed: an unconfigured deployment cannot be
 * used to submit reports without a challenge.
 */
export async function verifyTurnstile({ token, secret, ip, fetchImpl = fetch, timeoutMs = 5000 }) {
  if (!secret) return { ok: false, reason: 'not_configured' };
  if (!token || typeof token !== 'string' || token.length > 2048) return { ok: false, reason: 'missing_token' };
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return data && data.success === true ? { ok: true } : { ok: false, reason: 'rejected' };
  } catch (e) {
    return { ok: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
