// ===========================================================================
// Shared, dependency-free utilities. Pure ES module — runs in Node (build) and
// the browser (client) unchanged.
// ===========================================================================

/** Escape a string for safe interpolation into HTML text/attributes. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format an ISO date (YYYY-MM-DD) as e.g. "Jul 11, 2026". */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Format a percentage value with one decimal, e.g. 2.3 -> "2.3%". */
export function formatPct(n, dp = 1) {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(dp)}%`;
}

/** Format a signed percent change, e.g. 14 -> "+14%", -8 -> "−8%". */
export function formatChange(n) {
  if (!Number.isFinite(n) || n === 0) return 'no change';
  const sign = n > 0 ? '+' : '−';
  return `${sign}${Math.abs(n)}%`;
}

/** Clamp helper (mirrors threat-index clamp for local use). */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Trend glyph for a direction. */
export function trendGlyph(direction) {
  return { up: '▲', down: '▼', flat: '▬' }[direction] || '▬';
}
