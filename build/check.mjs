// ===========================================================================
// Post-build QA. Crawls dist/ and verifies:
//   * every internal href / src resolves to a real file (no dead links)
//   * every page has <title>, meta description, canonical, exactly one <h1>
//   * no obvious unresolved template placeholders
// Exits non-zero on failure so it can gate CI.  Usage: node build/check.mjs
// ===========================================================================

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { decodePng, paintedBounds } from './lib/png.mjs';

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
  // noindex pages (404, offline) intentionally carry no canonical: the server
  // serves them under arbitrary URLs, so a self-referencing canonical would
  // point every missing path at /404.html.
  const noindex = /<meta name="robots" content="noindex/.test(html);
  if (!noindex && !/<link rel="canonical"/.test(html)) {
    errors.push(`${rel}: missing canonical`);
  }
  if (noindex && /<link rel="canonical"/.test(html)) {
    errors.push(`${rel}: noindex page must not declare a canonical`);
  }
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

// Every emitted script must still parse as an ES module. The build strips
// comments from the JS it copies, so a stripper bug would otherwise ship broken
// syntax that nothing else in the pipeline exercises.
{
  const jsDir = join(dist, 'assets', 'js');
  if (existsSync(jsDir)) {
    for (const f of readdirSync(jsDir)) {
      if (!f.endsWith('.js')) continue;
      // `node --check` resolves module vs script from the nearest package.json,
      // which declares "type": "module" — so this parses these files as ESM.
      const res = spawnSync(process.execPath, ['--check', join(jsDir, f)], { encoding: 'utf8' });
      if (res.status !== 0) {
        const detail = (res.stderr || '').split('\n').find((l) => /Error/.test(l)) || 'parse failed';
        errors.push(`assets/js/${f}: does not parse as an ES module — ${detail.trim()}`);
      }
    }
  }
}

// No RFC-2606 reserved-TLD address may appear anywhere in the output. Those
// domains never resolve, so publishing one gives a health site a contact route
// that silently fails — worse than showing no address at all.
{
  const RESERVED = /[\w.+-]+@[\w.-]+\.(example|invalid|test|localhost)\b/gi;
  const scan = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        scan(p);
      } else if (/\.(html|txt|json|xml|webmanifest|js|css)$/.test(e.name)) {
        const hits = readFileSync(p, 'utf8').match(RESERVED);
        if (hits) {
          errors.push(
            `${p.replace(dist, '')}: publishes a non-routable address (${[...new Set(hits)].join(', ')})`
          );
        }
      }
    }
  };
  scan(dist);
}

// --- Release gate: checks that block a deploy ---------------------------- //
// These encode invariants the site cannot ship without. Each one exists because
// the failure it catches is invisible in a passing build: a sponsored link that
// lost its disclosure still renders, a security directive that got dropped from
// the CSP still serves, an unlabelled icon button still looks fine.

// Every commercial link ships with its disclosure attached. The shared
// component in build/lib/partials.mjs emits the two together; separating them
// is the failure this catches.
{
  const DISCLOSURE = 'FluTrack may earn a commission if you buy through this link';
  const SPONSORED = /<a\b[^>]*\brel="[^"]*\bsponsored\b[^"]*"[^>]*>/g;
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    let m;
    while ((m = SPONSORED.exec(html)) !== null) {
      // The component puts the disclosure a few hundred characters ahead of the
      // anchor; anything further away is not "immediately before" the link.
      const preceding = html.slice(Math.max(0, m.index - 600), m.index);
      if (!preceding.includes(DISCLOSURE)) {
        errors.push(
          `${file.replace(dist, '')}: a rel="sponsored" link has no affiliate disclosure immediately before it`
        );
      }
    }
  }
}

// Every <meta name="theme-color"> must be media-scoped. An unscoped duplicate
// is what made the resolved colour depend on whether the browser takes the
// first or the last matching tag; the explicit user override is applied by
// rewriting the scoped tags, never by appending another one.
{
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    const tags = html.match(/<meta name="theme-color"[^>]*>/g) || [];
    const unscoped = tags.filter((t) => !/\bmedia=/.test(t));
    if (unscoped.length) {
      errors.push(
        `${file.replace(dist, '')}: ${unscoped.length} <meta name="theme-color"> tag(s) without a media attribute`
      );
    }
  }
}

// Security directives that must be present in _headers. Losing one is a silent
// downgrade — the site still serves, just less safely.
{
  const headersPath = join(dist, '_headers');
  if (existsSync(headersPath)) {
    const text = readFileSync(headersPath, 'utf8');
    const REQUIRED = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src-attr 'none'",
      "manifest-src 'self'",
      "worker-src 'self'",
      'upgrade-insecure-requests',
      'report-to csp-endpoint',
      'Cross-Origin-Opener-Policy: same-origin',
      'Cross-Origin-Resource-Policy: same-origin',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Strict-Transport-Security:',
      'Reporting-Endpoints:',
    ];
    for (const directive of REQUIRED) {
      if (!text.includes(directive)) errors.push(`_headers: missing required directive "${directive}"`);
    }
    // HSTS preload is deliberately absent until a full subdomain inventory
    // confirms HTTPS everywhere: preloading is effectively irreversible.
    if (/Strict-Transport-Security:[^\n]*preload/.test(text)) {
      errors.push('_headers: HSTS carries `preload` — remove it until a subdomain inventory is signed off');
    }
    // The CSP names the analytics beacon host the edge injects. Without it the
    // tag ships on every page and is blocked on every load, so the privacy
    // policy would describe analytics that never actually run.
    if (!text.includes('https://static.cloudflareinsights.com')) {
      errors.push('_headers: CSP does not allow the injected Cloudflare Web Analytics beacon host');
    }
  }
}

// Every interactive control needs an accessible name. An icon-only button with
// no aria-label is announced as just "button".
{
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    for (const [, attrs, inner] of buttons) {
      if (/\baria-label=|\baria-labelledby=|\btitle=/.test(attrs)) continue;
      // Text content with all markup removed — an <svg> alone is not a name.
      const text = inner.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
      if (!text) {
        errors.push(`${file.replace(dist, '')}: a <button> has no accessible name`);
      }
    }
  }
}

// No emitted asset may match more than one Cache-Control rule in _headers.
// Cloudflare applies every matching rule, so two matches means one file gets two
// conflicting max-age values and the effective policy is not determinate.
{
  const headersPath = join(dist, '_headers');
  if (existsSync(headersPath)) {
    const rules = [];
    let current = null;
    for (const line of readFileSync(headersPath, 'utf8').split('\n')) {
      if (/^\/\S/.test(line)) {
        current = { pattern: line.trim(), hasCacheControl: false };
        rules.push(current);
      } else if (current && /^\s+Cache-Control:/i.test(line)) {
        current.hasCacheControl = true;
      }
    }
    // Cloudflare splats match any characters, including '/'.
    const toRe = (p) =>
      new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    const cacheRules = rules.filter((r) => r.hasCacheControl && r.pattern !== '/*');

    const walkAssets = (dir, base) => {
      if (!existsSync(dir)) return [];
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walkAssets(join(dir, e.name), `${base}/${e.name}`) : [`${base}/${e.name}`]
      );
    };
    for (const file of walkAssets(join(dist, 'assets'), '/assets')) {
      const hits = cacheRules.filter((r) => toRe(r.pattern).test(file));
      if (hits.length > 1) {
        errors.push(
          `${file}: matches ${hits.length} Cache-Control rules (${hits.map((h) => h.pattern).join(', ')})`
        );
      }
      if (hits.length === 0) {
        warnings.push(`${file}: no Cache-Control rule in _headers`);
      }
    }
  }
}

// The two dark-theme contexts must declare an identical token set. The media
// block is generated from the attribute block at build time, so this is a guard
// against that generation being removed rather than against manual drift.
{
  const cssName = readdirSync(join(dist, 'assets')).find((f) => f.endsWith('.css'));
  if (cssName) {
    const css = readFileSync(join(dist, 'assets', cssName), 'utf8');
    const tokensIn = (re) => {
      const m = css.match(re);
      return m ? new Set([...m[1].matchAll(/(--[a-z0-9-]+):/g)].map((x) => x[1])) : null;
    };
    const attr = tokensIn(/:root\[data-theme='dark'\]\{(.*?)\}/);
    const media = tokensIn(
      /@media \(prefers-color-scheme: dark\)\{:root:not\(\[data-theme='light'\]\)\{(.*?)\}\}/
    );
    if (!attr || !media) {
      errors.push('dark-theme token blocks not found in the bundled stylesheet');
    } else {
      const missing = [...attr].filter((t) => !media.has(t));
      const extra = [...media].filter((t) => !attr.has(t));
      if (missing.length) errors.push(`dark tokens missing from the media block: ${missing.join(', ')}`);
      if (extra.length) errors.push(`dark tokens only in the media block: ${extra.join(', ')}`);
    }
  }
}

// Emitted images must actually contain their artwork. Nothing in this build
// ever opened a PNG, which is how six truncated assets — including a favicon
// with a single painted row — shipped through a green `npm run verify`.
{
  const assetsDir = join(dist, 'assets');
  if (existsSync(assetsDir)) {
    const pngs = readdirSync(assetsDir).filter((f) => f.endsWith('.png'));
    if (!pngs.length) errors.push('dist/assets contains no PNGs — did the asset copy run?');
    for (const name of pngs) {
      const path = join(assetsDir, name);
      const bytes = readFileSync(path);
      let img;
      try {
        img = decodePng(bytes);
      } catch (err) {
        errors.push(`assets/${name}: not a decodable PNG — ${err.message}`);
        continue;
      }
      const b = paintedBounds(img.rgba, img.width, img.height);
      // Every source we rasterize paints a full-bleed background, so painted
      // content must reach the final row. A blank tail is the signature of the
      // headless-viewport truncation build/lib/rasterize.mjs compensates for.
      if (b.blankBottomRows > 0) {
        errors.push(
          `assets/${name}: ${b.blankBottomRows} blank row(s) at the bottom of a ${img.width}×${img.height} canvas — truncated raster`
        );
      }
      // A canvas that is almost entirely empty is a blank icon, not artwork.
      const coverage = b.count / (img.width * img.height);
      if (coverage < 0.25) {
        errors.push(
          `assets/${name}: only ${(coverage * 100).toFixed(1)}% of pixels are painted — looks blank`
        );
      }
    }

    // The share card must stay under the ~300 KB thumbnail ceiling some link
    // preview surfaces (WhatsApp among them) enforce; over it, the rich preview
    // silently does not render at all.
    const og = join(assetsDir, 'og-default.png');
    if (existsSync(og)) {
      const size = readFileSync(og).length;
      if (size > 300 * 1024) {
        errors.push(
          `assets/og-default.png: ${(size / 1024).toFixed(0)} KB exceeds the 300 KB link-preview ceiling`
        );
      }
    }

    // A maskable icon that is a copy of the standard icon is not maskable: it
    // keeps its rounded corners and its glyph outside Android's 40% safe
    // radius, so the OS mask crops the artwork.
    const std = join(assetsDir, 'icon-512.png');
    const mask = join(assetsDir, 'icon-maskable-512.png');
    if (existsSync(std) && existsSync(mask)) {
      if (readFileSync(std).equals(readFileSync(mask))) {
        errors.push(
          'assets/icon-maskable-512.png is byte-identical to icon-512.png — no maskable variant was generated'
        );
      }
      const mi = decodePng(readFileSync(mask));
      let transparent = 0;
      for (let p = 0; p < mi.width * mi.height; p += 1) {
        if (mi.rgba[p * 4 + 3] !== 255) transparent += 1;
      }
      if (transparent > 0) {
        errors.push(
          `assets/icon-maskable-512.png has ${transparent} non-opaque pixel(s) — a maskable icon must be full-bleed opaque`
        );
      }
    }
  }
}

// No page may enumerate the CDC source signals while omitting the Acute
// Respiratory Illness level. Copies of that list drifted across the site and 54
// of 69 pages ended up naming three signals while /methodology/ weighted four,
// so the site contradicted itself about its own inputs. build/lib/site.mjs owns
// the canonical phrasing; this is the backstop against a fresh hand-written copy.
{
  // Match a SOURCE LIST specifically: three signal names strung together by
  // pure list separators (", ", " and ", an optional "(NSSP)"-style tag). That
  // deliberately does not match prose reporting measured values — "4.3% of
  // emergency-department visits were for respiratory illness, wastewater
  // viral activity was moderate" has verbs between the terms, not separators.
  const TERM =
    '(?:emergency[- ]department visits|wastewater viral activity|(?:lab(?:oratory)? )?test positivity)';
  const SEP = '(?:\\s*\\([A-Z]+\\))?\\s*(?:,\\s*(?:and\\s+)?|and\\s+|&\\s*)';
  const ENUM = new RegExp(`${TERM}${SEP}${TERM}${SEP}${TERM}`, 'gi');
  const ARI = /acute[- ]respiratory[- ]illness|\bARI\b/i;

  for (const file of htmlFiles) {
    const text = readFileSync(file, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ');
    for (const m of text.matchAll(ENUM)) {
      const near = text.slice(Math.max(0, m.index - 110), m.index + m[0].length + 110);
      if (!ARI.test(near)) {
        errors.push(
          `${file.replace(dist, '')}: enumerates the CDC signals without the Acute Respiratory Illness level — "${m[0].slice(
            0,
            110
          )}…"`
        );
      }
    }
  }
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
