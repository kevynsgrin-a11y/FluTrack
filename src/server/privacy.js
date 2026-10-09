// ===========================================================================
// Pseudonymous request identity, rate limits and burst detection.
//
// ip_hash = sha256(CF-Connecting-IP + daily salt). The salt is random, lives
// in KV under salt:<YYYY-MM-DD>, and is deleted by the ingest Worker's daily
// cron once its day is over. With the salt gone, yesterday's hashes cannot be
// recomputed from an IP, and the same IP hashes differently every day. The raw
// IP is never stored or logged.
// ===========================================================================

export const SALT_TTL_SECONDS = 2 * 24 * 3600; // backstop; the cron deletes old salts sooner
export const LIMIT_PER_HOUR = 3;
export const LIMIT_PER_DAY = 5;
export const BURST_FACTOR = 3;
export const BURST_FLOOR = 6; // an hour needs at least this many reports before it can be a burst
export const ASN_DAILY_LIMIT = 60; // reports per network per day before new ones are quarantined

const enc = new TextEncoder();

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** UTC calendar day, YYYY-MM-DD. */
export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** ISO-8601 week label, e.g. "2026-W41". */
export function isoWeek(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The salt for `day`, created on first use. */
export async function dailySalt(kv, day) {
  const key = `salt:${day}`;
  const existing = await kv.get(key);
  if (existing) return existing;
  const salt = randomHex(32);
  await kv.put(key, salt, { expirationTtl: SALT_TTL_SECONDS });
  // Read back so two concurrent first-requests converge on whichever write won.
  return (await kv.get(key)) || salt;
}

export async function ipHash(kv, ip, now = new Date()) {
  const salt = await dailySalt(kv, utcDay(now));
  return sha256Hex(`${ip || 'unknown'}|${salt}`);
}

/**
 * Per-hash limits: LIMIT_PER_HOUR per clock hour and LIMIT_PER_DAY per day.
 * Counts are recorded only for accepted attempts. KV is eventually consistent,
 * so this is friction against abuse, not an exact quota.
 * @returns {Promise<{ ok: boolean, retryAfter?: number }>}
 */
export async function checkRateLimit(kv, hash, now = new Date()) {
  const hourKey = `rl:h:${hash}:${now.toISOString().slice(0, 13)}`;
  const dayKey = `rl:d:${hash}:${utcDay(now)}`;
  const [h, d] = await Promise.all([kv.get(hourKey), kv.get(dayKey)]);
  const hour = parseInt(h || '0', 10);
  const day = parseInt(d || '0', 10);
  if (day >= LIMIT_PER_DAY) return { ok: false, retryAfter: 3600 * 6 };
  if (hour >= LIMIT_PER_HOUR) return { ok: false, retryAfter: 3600 - now.getUTCMinutes() * 60 };
  await Promise.all([
    kv.put(hourKey, String(hour + 1), { expirationTtl: 3700 }),
    kv.put(dayKey, String(day + 1), { expirationTtl: 90_000 }),
  ]);
  return { ok: true };
}

/**
 * Burst / cluster check at write time. Counts this report against its county's
 * clock hour and its network (ASN) day in KV — counters only, nothing about the
 * reporter. Returns true when the new report should be quarantined:
 *   * the county's reports this hour exceed BURST_FACTOR × its trailing daily
 *     mean (with a floor, so a quiet county's second report is not a "burst"), or
 *   * one network has sent more than ASN_DAILY_LIMIT reports today.
 */
export async function burstCheck(kv, { countyFips, asn, trailingDailyMean = 0 }, now = new Date()) {
  let quarantine = false;
  const hourStamp = now.toISOString().slice(0, 13);
  if (countyFips) {
    const key = `burst:${countyFips}:${hourStamp}`;
    const count = parseInt((await kv.get(key)) || '0', 10) + 1;
    await kv.put(key, String(count), { expirationTtl: 7200 });
    const threshold = Math.max(BURST_FLOOR, BURST_FACTOR * trailingDailyMean);
    if (count > threshold) quarantine = true;
  }
  if (asn) {
    const key = `asn:${asn}:${utcDay(now)}`;
    const count = parseInt((await kv.get(key)) || '0', 10) + 1;
    await kv.put(key, String(count), { expirationTtl: 90_000 });
    if (count > ASN_DAILY_LIMIT) quarantine = true;
  }
  return quarantine;
}
