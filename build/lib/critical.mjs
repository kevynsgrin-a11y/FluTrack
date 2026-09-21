// ===========================================================================
// Critical CSS extraction.
//
// The header and the hero readout must paint without waiting for the hashed
// stylesheet, so the build lifts the rules they need into an inline <style>
// and loads the full sheet asynchronously.
//
// The selector allowlist below was derived empirically: every element whose
// box intersects the first 1.35 viewports was collected from the built pages
// at 360/390/768/1440 across all six templates. Keeping it here (rather than
// hand-maintaining a copy of the rules) means the critical CSS is always cut
// from the same source as the full sheet and cannot drift out of sync.
// ===========================================================================

/** Classes that appear above the fold on at least one template. */
const CRITICAL_CLASSES = new Set([
  // shell
  'skip-link', 'site-header', 'site-header__inner', 'brand', 'brand__mark', 'brand__name',
  'primary-nav', 'header-actions', 'theme-control', 'icon-btn', 'nav-toggle',
  'container', 'container--narrow', 'container--wide',
  // home hero + readout
  'hero', 'hero__bg', 'hero__grid', 'hero__lead', 'hero__label', 'hero__question',
  'hero__lede', 'hero__cta', 'hero__map', 'home-readout',
  'threat', 'threat__head', 'threat__label', 'threat__body', 'threat__readout',
  'threat__level', 'threat__meta', 'threat__gauge', 'threat__meter', 'threat__pip',
  'gauge', 'gauge__hub', 'gauge__needle', 'gauge__score', 'gauge__threshold',
  'gauge__threshold-label', 'gauge__track', 'gauge__unit',
  'meter', 'meter__scale', 'meter__seg',
  'level-token', 'level-token__index', 'level-token__swatch', 'level-token__word',
  'trend', 'trend--flat', 'trend--up', 'trend--down', 'trend__shape',
  'badge', 'badge--live', 'badge--cached', 'badge__dot',
  'prov', 'prov__live', 'prov__live--sample', 'prov__src', 'prov__tags',
  'picker', 'select', 'btn', 'btn--primary', 'btn--secondary', 'btn--ghost', 'btn--block',
  // interior page mastheads that occupy the fold
  'page-header', 'page-header__bg', 'state-masthead', 'breadcrumbs', 'status-strip', 'status-strip__state', 'status-strip__level',
  'section', 'section--tight', 'section-head', 'section-rule',
  // the desktop fold reaches these on the home template
  'trend-note', 'callout', 'callout--warn', 'callout__title', 'ad-slot', 'ad-slot__label',
  // shared primitives the above all lean on
  'cluster', 'between', 'stack', 'visually-hidden', 'muted', 'text-secondary', 'icon', 'lede',
]);

/** Bare element / pseudo selectors that are always structural. */
const CRITICAL_BARE = /^(\*|:root|html|body|main|header|nav|a|p|h1|h2|h3|h4|ul|ol|li|svg|button|select|input|label|img|form|article|section|aside|span|strong|b|em|dl|dt|dd|::selection|:focus-visible|:focus|:target)\b/;

/**
 * Split a stylesheet into top-level nodes. Handles nested at-rule blocks,
 * strings and comments; sufficient for this hand-written CSS (no @import).
 * @param {string} css
 * @returns {Array<{type:'rule'|'at', prelude:string, body:string, raw:string}>}
 */
function splitNodes(css) {
  const nodes = [];
  let i = 0, start = 0, depth = 0, prelude = '';
  let inStr = null, inComment = false;
  while (i < css.length) {
    const c = css[i], next = css[i + 1];
    if (inComment) { if (c === '*' && next === '/') { inComment = false; i += 2; continue; } i += 1; continue; }
    if (inStr) { if (c === '\\') { i += 2; continue; } if (c === inStr) inStr = null; i += 1; continue; }
    if (c === '/' && next === '*') { inComment = true; i += 2; continue; }
    if (c === '"' || c === "'") { inStr = c; i += 1; continue; }
    if (c === '{') {
      if (depth === 0) prelude = css.slice(start, i).trim();
      depth += 1; i += 1; continue;
    }
    if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        const raw = css.slice(start, i + 1);
        const bodyStart = raw.indexOf('{');
        nodes.push({
          type: prelude.startsWith('@') ? 'at' : 'rule',
          prelude,
          body: raw.slice(bodyStart + 1, -1),
          raw,
        });
        start = i + 1;
      }
      i += 1; continue;
    }
    if (c === ';' && depth === 0) {
      // A statement at-rule such as @charset — keep it verbatim.
      const raw = css.slice(start, i + 1).trim();
      if (raw) nodes.push({ type: 'statement', prelude: raw, body: '', raw });
      start = i + 1; i += 1; continue;
    }
    i += 1;
  }
  return nodes;
}

/** Does one selector target something that paints above the fold? */
function selectorIsCritical(sel) {
  const s = sel.trim();
  if (!s) return false;
  for (const cls of s.match(/\.[A-Za-z0-9_-]+/g) || []) {
    if (CRITICAL_CLASSES.has(cls.slice(1))) return true;
  }
  // Selectors with no class at all are structural (element, :root, attribute).
  if (!/\./.test(s) && CRITICAL_BARE.test(s)) return true;
  if (/^\[data-theme/.test(s) || /^:root/.test(s)) return true;
  return false;
}

/**
 * Any rule that DEFINES a custom property is critical regardless of its
 * selector: an above-the-fold rule may consume it, and a `var()` that resolves
 * to nothing invalidates the whole declaration. `[data-sev='N']` is the live
 * example — it supplies --sev, which .threat's 5px border-top is drawn with,
 * so omitting it silently collapsed the border and shifted the card by 5px.
 */
function definesCustomProperty(body) {
  return /(^|[;{\s])--[A-Za-z0-9_-]+\s*:/.test(body);
}

function ruleIsCritical(prelude, body) {
  if (definesCustomProperty(body)) return true;
  return prelude.split(',').some(selectorIsCritical);
}

/**
 * Cut the critical subset out of a stylesheet.
 * @param {string} css raw (unminified) concatenated CSS
 * @param {{all?: boolean}} opts `all` keeps every node (used for the token and
 *   base layers, which define custom properties and the reset that everything
 *   above the fold resolves against).
 */
export function extractCritical(css, opts = {}) {
  const out = [];
  for (const node of splitNodes(css)) {
    if (node.type === 'statement') { out.push(node.raw); continue; }
    if (node.type === 'at') {
      const name = node.prelude.split(/[\s(]/)[0];
      // @font-face must be inline: the fonts are preloaded, and a face that
      // only arrives with the async sheet leaves the preload unused.
      if (name === '@font-face' || opts.all) { out.push(node.raw); continue; }
      if (name === '@media' || name === '@supports' || name === '@layer') {
        const inner = extractCritical(node.body, opts);
        if (inner.trim()) out.push(`${node.prelude}{${inner}}`);
        continue;
      }
      if (name === '@keyframes' || name.endsWith('keyframes')) continue;
      continue;
    }
    if (opts.all || ruleIsCritical(node.prelude, node.body)) out.push(node.raw);
  }
  return out.join('\n');
}
