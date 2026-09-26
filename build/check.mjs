// ===========================================================================
// Post-build QA. Crawls dist/ and verifies:
//   * every internal href / src resolves to a real file (no dead links)
//   * every page has <title>, meta description, canonical, exactly one <h1>
//   * no obvious unresolved template placeholders
// Exits non-zero on failure so it can gate CI.  Usage: node build/check.mjs
// ===========================================================================

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const errors = [];
const warnings = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function assetExists(urlPath) {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (clean.endsWith('/')) return existsSync(join(dist, clean, 'index.html'));
  const direct = join(dist, clean);
  if (existsSync(direct)) return true;
  return existsSync(join(dist, clean, 'index.html'));
}

const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
if (!htmlFiles.length) errors.push('No HTML files found in dist/. Did the build run?');

for (const file of htmlFiles) {
  const rel = file.replace(dist, '');
  const html = readFileSync(file, 'utf8');
  // Ignore JSON-LD blocks when scanning for stray template markers / "undefined",
  // since valid JSON legitimately contains "}}" and other brace sequences.
  const htmlNoLd = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');

  // Required SEO tags.
  if (!/<title>[^<]{3,}<\/title>/.test(html)) errors.push(`${rel}: missing/empty <title>`);
  if (!/<meta name="description" content="[^"]{20,}"/.test(html)) errors.push(`${rel}: missing meta description`);
  if (!/<link rel="canonical"/.test(html)) errors.push(`${rel}: missing canonical`);
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s === 0) warnings.push(`${rel}: no <h1>`);
  if (h1s > 1) warnings.push(`${rel}: ${h1s} <h1> elements (expected 1)`);

  // Unresolved placeholders / stray "undefined".
  if (/\bundefined\b/.test(htmlNoLd.replace(/https?:\/\/[^"']*/g, ''))) {
    warnings.push(`${rel}: contains the literal "undefined"`);
  }
  if (/\{\{\s*[\w.]+\s*\}\}/.test(htmlNoLd)) errors.push(`${rel}: unresolved {{template}} markers`);

  // Internal link + asset integrity.
  const refs = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (ref.startsWith('//')) continue; // protocol-relative external
    if (!assetExists(ref)) errors.push(`${rel}: dead internal link → ${ref}`);
  }
}

// Required top-level artifacts.
for (const req of ['sitemap.xml', 'robots.txt', 'manifest.webmanifest', '_headers', '404.html', 'data/snapshot.json']) {
  if (!existsSync(join(dist, req))) errors.push(`missing required artifact: ${req}`);
}

// --- No placeholder copy may ever reach a visitor ---------------------- //
// The season-kit module shipped 204 visible "[COPY NEEDED: …]" strings across
// 51 state pages, rendered rather than hidden. partials.seasonKitModule() now
// refuses to render until its copy is filled, but that is one component's
// discipline; this is the backstop that covers every template.
//
// Scanned surfaces are the two a visitor or a crawler can actually read: the
// visible text with tags stripped, and the values of human-facing attributes.
// Raw HTML is deliberately NOT scanned — `placeholder="you@example.com"` is a
// legitimate attribute appearing 64 times, and a guard that cries wolf on it
// would be switched off within a week.
{
  const PLACEHOLDER_TOKENS = [
    { name: 'COPY NEEDED', re: /\[?\s*COPY\s+NEEDED/i },
    { name: 'TODO', re: /\bTODO\b/ },
    { name: 'FIXME', re: /\bFIXME\b/i },
    { name: 'Lorem', re: /\bLOREM\b/i },
    { name: 'TBD', re: /\bTBD\b/ },
    { name: 'XXX', re: /\bXXX\b/ },
  ];
  // Attributes a person or a crawler consumes as prose.
  const PROSE_ATTRS = /\b(?:alt|title|aria-label|placeholder|content)\s*=\s*"([^"]*)"/gi;

  const decode = (t) =>
    t
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');

  let scanned = 0;
  for (const file of htmlFiles) {
    const rel = file.replace(dist, '');
    const html = readFileSync(file, 'utf8');
    scanned += 1;

    // Visible text: drop script/style wholesale, then all tags (which also
    // drops every attribute), then decode entities.
    const visible = decode(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ');

    const attrValues = [...html.matchAll(PROSE_ATTRS)].map((m) => decode(m[1]));

    for (const { name, re } of PLACEHOLDER_TOKENS) {
      const hitText = visible.match(re);
      if (hitText) {
        const at = visible.indexOf(hitText[0]);
        errors.push(
          `${rel}: placeholder "${name}" is visible to readers → "${visible.slice(Math.max(0, at - 30), at + 60).trim()}"`
        );
      }
      const hitAttr = attrValues.find((v) => re.test(v));
      if (hitAttr) errors.push(`${rel}: placeholder "${name}" in a reader-facing attribute → "${hitAttr.slice(0, 90)}"`);
    }
  }
  console.log(`Placeholders: ${scanned} page(s) scanned for ${PLACEHOLDER_TOKENS.map((t) => t.name).join(', ')}.`);
}

// --- CSP integrity: the inline script must be allowlisted on EVERY page --- //
// The theme-boot script is permitted by its SHA-256 alone. If that script ever
// changes by a byte and the policy is not regenerated, the browser silently
// blocks it: the theme toggle dies and the stylesheet is never promoted from
// media="print", leaving an unstyled page. Nothing else in the build catches
// that, so it is asserted here against the ACTUAL emitted bytes of every page.
{
  const headersText = existsSync(join(dist, '_headers')) ? readFileSync(join(dist, '_headers'), 'utf8') : '';
  const cspLine = (headersText.match(/^\s*Content-Security-Policy:\s*(.+)$/m) || [])[1] || '';
  const scriptSrc = (cspLine.match(/script-src([^;]*)/) || [])[1] || '';
  const allowed = new Set((scriptSrc.match(/'sha256-[A-Za-z0-9+/=]+'/g) || []).map((h) => h.slice(1, -1)));

  if (!cspLine) {
    errors.push('_headers: no Content-Security-Policy found');
  } else if (!allowed.size) {
    errors.push('_headers: CSP script-src carries no sha256- hash for the inline boot script');
  }

  let inlineTotal = 0;
  for (const file of htmlFiles) {
    const rel = file.replace(dist, '');
    const html = readFileSync(file, 'utf8');
    // Inline <script> blocks, excluding JSON-LD and anything with a src=.
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
      const attrs = m[1] || '';
      if (/type\s*=\s*"application\/ld\+json"/.test(attrs)) continue;
      inlineTotal += 1;
      const digest = `sha256-${createHash('sha256').update(m[2]).digest('base64')}`;
      if (!allowed.has(digest)) {
        errors.push(
          `${rel}: inline <script> is not allowlisted by the CSP (${digest} absent from script-src). ` +
            `The policy and the emitted script have drifted apart.`
        );
      }
    }
    // Inline event handlers would need 'unsafe-inline'/'unsafe-hashes', which
    // this policy does not grant, so they would be dead code in production.
    const handler = html.match(/<[^>]+\son[a-z]+\s*=\s*"/i);
    if (handler) errors.push(`${rel}: inline event handler would be blocked by the CSP → ${handler[0].slice(0, 60)}`);
  }
  if (!errors.length && !inlineTotal) warnings.push('no inline <script> found in any page — is the theme boot script still emitted?');
  console.log(`CSP: ${inlineTotal} inline script(s) across ${htmlFiles.length} pages checked against ${allowed.size} allowlisted hash(es).`);
}

// --- GA4: in-page, consent-gated, and allowed by the CSP ------------------ //
// Every page must carry the per-site measurement ID on the analytics.js tag,
// early enough that the fleet's edge ga4-inject Worker (which only scans the
// first 5,000 characters for a G- ID) sees it and does not inject an ungated
// second copy. No page may hard-code the gtag.js loader: analytics.js inserts
// it only after consent. And the policy must allow the GA4 and Cloudflare Web
// Analytics origins, or the tags are silently refused.
{
  const GA4_ID = 'G-65H1FJWYLR';
  const tag = `<script type="module" src="/assets/js/analytics.js" data-ga4-id="${GA4_ID}"></script>`;
  if (!existsSync(join(dist, 'assets', 'js', 'analytics.js'))) errors.push('missing /assets/js/analytics.js (GA4 bootstrap)');
  for (const file of htmlFiles) {
    const rel = file.replace(dist, '');
    const html = readFileSync(file, 'utf8');
    const at = html.indexOf(tag);
    if (at === -1) errors.push(`${rel}: GA4 analytics.js tag with ${GA4_ID} is missing`);
    else if (at + tag.length > 5000) errors.push(`${rel}: GA4 tag ends at char ${at + tag.length}; the ga4-inject Worker only scans the first 5000`);
    if (html.split(tag).length - 1 > 1) errors.push(`${rel}: GA4 analytics.js tag emitted more than once`);
    if (/googletagmanager\.com\/gtag\/js/.test(html)) errors.push(`${rel}: hard-coded gtag.js loader bypasses the consent gate`);
  }
  const headersText = existsSync(join(dist, '_headers')) ? readFileSync(join(dist, '_headers'), 'utf8') : '';
  const csp = (headersText.match(/^\s*Content-Security-Policy:\s*(.+)$/m) || [])[1] || '';
  const directive = (name) => ((csp.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`)) || [])[1] || '').trim().split(/\s+/);
  const required = {
    'script-src': ['https://www.googletagmanager.com', 'https://static.cloudflareinsights.com'],
    'connect-src': ["'self'", 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://cloudflareinsights.com'],
    'img-src': ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
  };
  for (const [name, hosts] of Object.entries(required)) {
    const have = directive(name);
    for (const h of hosts) if (!have.includes(h)) errors.push(`_headers: CSP ${name} is missing ${h}`);
  }
  if (/'unsafe-inline'|'unsafe-eval'/.test(directive('script-src').join(' '))) {
    errors.push("_headers: CSP script-src must not allow 'unsafe-inline' or 'unsafe-eval'");
  }
  console.log(`GA4: ${htmlFiles.length} page(s) checked for the consent-gated ${GA4_ID} tag and CSP origins.`);
}

// --- Cache-Control rules must not overlap -------------------------------- //
// Cloudflare joins duplicate header values with a comma, and a splat matches
// greedily across "/", so two matching rules give one file a spliced
// Cache-Control. Every emitted asset must match exactly one rule.
{
  const headersText = existsSync(join(dist, '_headers')) ? readFileSync(join(dist, '_headers'), 'utf8') : '';
  const rules = [];
  let current = null;
  for (const line of headersText.split('\n')) {
    if (/^\S/.test(line) && line.trim()) {
      current = { pattern: line.trim(), cache: false };
      rules.push(current);
    } else if (current && /^\s+Cache-Control:/i.test(line)) {
      current.cache = true;
    }
  }
  const cacheRules = rules.filter((r) => r.cache);
  // A splat matches any characters (including "/"); a :placeholder matches any
  // run of characters except "/".
  const toRegExp = (pattern) => {
    let out = '';
    for (const part of pattern.split(/(\*|:[A-Za-z]\w*)/)) {
      if (part === '*') out += '.*';
      else if (/^:[A-Za-z]\w*$/.test(part)) out += '[^/]+';
      else out += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${out}$`);
  };
  const compiled = cacheRules.map((r) => ({ ...r, re: toRegExp(r.pattern) }));

  const served = [];
  const walkAll = (dir, prefix = '') => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkAll(p, `${prefix}/${name}`);
      else served.push(`${prefix}/${name}`);
    }
  };
  walkAll(dist);

  let overlaps = 0;
  for (const f of served) {
    if (f === '/_headers' || f === '/_redirects') continue;
    // Directory URLs are what Cloudflare actually serves for index.html.
    const url = f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f;
    const hits = compiled.filter((r) => r.re.test(url));
    if (hits.length > 1) {
      overlaps += 1;
      errors.push(
        `_headers: ${url} matches ${hits.length} Cache-Control rules (${hits.map((h) => h.pattern).join(', ')}); ` +
          `Cloudflare would join them into one spliced value`
      );
    }
  }
  const unmatched = served
    .filter((f) => f !== '/_headers' && f !== '/_redirects') // parsed by Pages, never served
    .map((f) => (f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f))
    .filter((url) => !compiled.some((r) => r.re.test(url)));
  if (unmatched.length) {
    warnings.push(`_headers: ${unmatched.length} file(s) match no Cache-Control rule, e.g. ${unmatched.slice(0, 5).join(', ')}`);
  }
  console.log(
    `Cache rules: ${cacheRules.length} pattern(s), ${served.length} emitted file(s), ` +
      `${overlaps === 0 ? 'no overlaps' : `${overlaps} OVERLAP(S)`}.`
  );
}

console.log(`Checked ${htmlFiles.length} HTML pages.`);
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length) {
  console.log(`\n✗ ${errors.length} error(s):`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log('\n✓ QA passed: links, assets, and SEO tags are intact.');
