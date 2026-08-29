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
import { decodePng, paintedBounds, flatTrailingRows, brightBounds } from './lib/png.mjs';
import { processors } from './lib/site.mjs';

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

  // Scoped DELIBERATELY to the assets build/lib/rasterize.mjs generates. These
  // guards encode properties of that pipeline (full-bleed background, exact
  // canvas, opaque where required) which are NOT true of images in general — a
  // logo with transparent margins or a diagram would fail them for no reason,
  // and a guard that blocks legitimate work gets deleted rather than fixed.
  const GENERATED = {
    'favicon-32.png': { w: 32, h: 32 },
    'apple-touch-icon.png': { w: 180, h: 180 },
    'icon-192.png': { w: 192, h: 192 },
    'icon-512.png': { w: 512, h: 512 },
    'icon-maskable-512.png': { w: 512, h: 512, opaque: true },
    'og-default.png': { w: 1200, h: 630, opaque: true, maxBytes: 300 * 1024 },
  };

  const decoded = new Map();
  for (const [name, spec] of Object.entries(GENERATED)) {
    const path = join(assetsDir, name);
    if (!existsSync(path)) {
      errors.push(`assets/${name}: missing — the rasterizer output was not copied into dist`);
      continue;
    }
    const bytes = readFileSync(path);
    let img;
    try {
      img = decodePng(bytes);
    } catch (err) {
      // Never let a decode failure escape: an uncaught throw here would abort
      // the whole script and swallow every error accumulated so far.
      errors.push(`assets/${name}: not a decodable PNG — ${err.message}`);
      continue;
    }
    decoded.set(name, img);

    if (img.width !== spec.w || img.height !== spec.h) {
      errors.push(
        `assets/${name}: expected a ${spec.w}×${spec.h} canvas, got ${img.width}×${img.height}`
      );
    }
    if (spec.maxBytes && bytes.length > spec.maxBytes) {
      errors.push(
        `assets/${name}: ${(bytes.length / 1024).toFixed(0)} KB exceeds the ${(
          spec.maxBytes / 1024
        ).toFixed(0)} KB link-preview ceiling`
      );
    }

    // Truncation. Two complementary measures, because neither alone covers
    // both encodings: alpha-based for images that have alpha, flat-row-based
    // for opaque ones (where every pixel decodes a=255 and the alpha measure
    // is structurally incapable of firing).
    const b = paintedBounds(img.rgba, img.width, img.height);
    if (b.blankBottomRows > 0) {
      errors.push(
        `assets/${name}: ${b.blankBottomRows} transparent row(s) at the bottom of a ${img.width}×${img.height} canvas — truncated raster`
      );
    }
    const flat = flatTrailingRows(img.rgba, img.width, img.height);
    if (flat > 8) {
      errors.push(
        `assets/${name}: ${flat} uniform row(s) at the bottom — the artwork does not reach the canvas edge (truncated raster)`
      );
    }
    if (b.count === 0) {
      errors.push(`assets/${name}: no pixels are painted at all — blank asset`);
    }

    if (spec.opaque) {
      let transparent = 0;
      for (let p = 0; p < img.width * img.height; p += 1) {
        if (img.rgba[p * 4 + 3] !== 255) transparent += 1;
      }
      if (transparent > 0) {
        errors.push(
          `assets/${name}: ${transparent} non-opaque pixel(s) — this asset must be full-bleed opaque`
        );
      }
    }
  }

  // A maskable icon that is a copy of the standard icon is not maskable.
  const std = join(assetsDir, 'icon-512.png');
  const mask = join(assetsDir, 'icon-maskable-512.png');
  if (existsSync(std) && existsSync(mask) && readFileSync(std).equals(readFileSync(mask))) {
    errors.push(
      'assets/icon-maskable-512.png is byte-identical to icon-512.png — no maskable variant was generated'
    );
  }

  // Measure the property that actually matters for a maskable icon, rather
  // than inferring it from the file differing: Android guarantees only a
  // centred circle of 40% radius is visible, so the artwork must fit inside it.
  const mi = decoded.get('icon-maskable-512.png');
  if (mi) {
    const g = brightBounds(mi.rgba, mi.width, mi.height);
    if (!g) {
      errors.push('assets/icon-maskable-512.png: no glyph found — the icon looks empty');
    } else {
      const safe = 0.4 * mi.width;
      if (g.maxRadius > safe) {
        errors.push(
          `assets/icon-maskable-512.png: glyph reaches ${g.maxRadius.toFixed(1)}px from centre, outside Android's ${safe.toFixed(1)}px maskable safe radius — the OS mask will crop it`
        );
      }
    }
  }

  // The share card's brand mark sits at translate(72,58) at 84x84. Both OG
  // rendering defects this pipeline had (an unscoped svg{} rule inflating the
  // nested mark to full canvas, and a duplicate gradient id filling it with the
  // pale page background) leave that box empty of brand-dark pixels while
  // changing neither file size nor row coverage — so nothing else here sees
  // them. Assert the mark is actually present and dark.
  const og = decoded.get('og-default.png');
  if (og) {
    let dark = 0;
    for (let y = 58; y < 142; y += 1) {
      for (let x = 72; x < 156; x += 1) {
        const p = (y * og.width + x) * 4;
        const lum = 0.299 * og.rgba[p] + 0.587 * og.rgba[p + 1] + 0.114 * og.rgba[p + 2];
        if (lum < 140) dark += 1;
      }
    }
    const frac = dark / (84 * 84);
    if (frac < 0.35) {
      errors.push(
        `assets/og-default.png: the brand mark at (72,58)–(156,142) is only ${(frac * 100).toFixed(
          1
        )}% brand-dark — the nested mark is missing or filled with the page gradient`
      );
    }

    // The cartogram must not encode severity. It once coloured each state by a
    // hash of its own abbreviation, under a real-looking legend — fabricated
    // per-state health data on the site's most-distributed asset, seen stripped
    // of every disclaimer. The site has no real per-state data at build time,
    // so the tiles carry a uniform brand tint and claim only coverage. Any
    // severity-ramp colour appearing in the map area means that regressed.
    const SEVERITY = [
      [28, 107, 65],
      [70, 112, 25],
      [121, 94, 0],
      [160, 74, 0],
      [155, 28, 28],
    ];
    let severityPixels = 0;
    for (let y = 0; y < og.height; y += 1) {
      for (let x = 660; x < og.width; x += 1) {
        const p = (y * og.width + x) * 4;
        for (const [r, g, b] of SEVERITY) {
          const d = Math.abs(og.rgba[p] - r) + Math.abs(og.rgba[p + 1] - g) + Math.abs(og.rgba[p + 2] - b);
          if (d <= 12) {
            severityPixels += 1;
            break;
          }
        }
      }
    }
    if (severityPixels > 200) {
      errors.push(
        `assets/og-default.png: ${severityPixels} severity-ramp pixel(s) in the map area — the share card appears to encode per-state severity, which would be fabricated data`
      );
    }
  }
}

// No page may enumerate the CDC source signals while omitting the Acute
// Respiratory Illness level. Copies of that list drifted across the site and 54
// of 69 pages ended up naming three signals while /methodology/ weighted four,
// so the site contradicted itself about its own inputs. build/lib/site.mjs owns
// the canonical phrasing; this is the backstop against a fresh hand-written copy.
{
  // Match a SOURCE LIST: three signal names strung together by list separators.
  // This deliberately does NOT match prose reporting measured values —
  // "4.3% of emergency-department visits were for respiratory illness,
  // wastewater viral activity was moderate" has verbs between the terms.
  //
  // The term alternation is deliberately wider than the phrasings that were
  // fixed. An earlier version required the literal word "test" before
  // "positivity", which meant the live home-page copy ("lab positivity") sailed
  // straight through: the guard had been fitted to the strings that were
  // removed rather than to the invariant.
  const TERM =
    '(?:(?:emergency[- ]department|ED|ER)\\s+visits' +
    '|wastewater(?:\\s+viral)?\\s+(?:activity|concentrations?)' +
    '|(?:lab(?:oratory)?\\s+)?(?:test\\s+)?positivity)';
  // Separators only: commas, "and", ampersands, dashes, bullets, semicolons,
  // and "(NSSP)"-style tags. Markup between list items becomes whitespace after
  // tag-stripping, so allow that too — a hand-written <ul> is at least as
  // likely as prose.
  const SEP = '(?:\\s*\\([A-Z]+\\))?\\s*(?:[,;]|and|&|—|–|\\||•)+\\s*(?:and\\s+)?';
  const ENUM = new RegExp(`${TERM}${SEP}${TERM}${SEP}${TERM}`, 'gi');
  const ARI = /acute[- ]respiratory[- ]illness|\bARI\b|activity (?:level|label)/i;
  // render.js legitimately emits "This reading is based on 3 of the four CDC
  // signals — ..." when a state genuinely did not report one. That sentence is
  // TRUE and must not fail the build; it is self-labelling, so key on the
  // label rather than trying to infer intent.
  const PARTIAL = /\b(?:all four|\d+ of the four)\s+CDC signals\b/i;

  for (const file of htmlFiles) {
    const text = readFileSync(file, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ');
    // Sentence scope, not a character window: a ±110-char window both let a
    // stray "ARI" elsewhere on the page mask a genuinely wrong list, and failed
    // a correct one whose qualifier sat just outside the window.
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (ARI.test(sentence) || PARTIAL.test(sentence)) continue;
      const m = sentence.match(ENUM);
      if (m) {
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

// /privacy/ and /vendors/ both tell the reader the two documents "cannot drift
// apart" because they are generated from the same register. That was published
// while /privacy/ hardcoded its vendor list in prose and only /vendors/ read the
// register — a verifiability guarantee the site did not actually have. Both must
// name every processor, or the claim has to come down.
{
  const pages = [join(dist, 'privacy', 'index.html'), join(dist, 'vendors', 'index.html')];
  for (const page of pages) {
    if (!existsSync(page)) {
      errors.push(`${page.replace(dist, '')}: missing — cannot verify the processor register claim`);
      continue;
    }
    const text = readFileSync(page, 'utf8')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');
    for (const p of processors) {
      if (!text.includes(p.vendor)) {
        errors.push(
          `${page.replace(dist, '')}: does not name the processor "${p.vendor}", but the page claims the register and the policy cannot disagree`
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
