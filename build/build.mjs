// ===========================================================================
// FluTrack static build. Emits a fully static, Cloudflare-Pages-ready site to
// dist/. Pure Node, no third-party dependencies.
//
//   dist/
//     index.html                     home
//     states/index.html              all-states directory
//     state/<slug>/index.html        51 programmatic state reports
//     <content pages>/index.html     auto-discovered from build/pages/content
//     assets/styles.css              bundled CSS
//     assets/js/*.js                 client ES modules (copied)
//     assets/*                       icons, og image, etc.
//     data/snapshot.json             bundled sample data
//     sitemap.xml, robots.txt, manifest.webmanifest, _headers, _redirects, 404
// ===========================================================================

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { createHash } from 'node:crypto';
import { site, disclaimers, hasPublisherEmail } from './lib/site.mjs';
import { states } from './lib/states.mjs';
import { layout, BOOT_SCRIPT } from './lib/layout.mjs';
import { computeModel } from '../src/scripts/model.js';
import { nationalSignals } from '../src/scripts/aggregate.js';
import { threatCard, pathogenTiles, stateChip, signalRows } from '../src/scripts/render.js';
import * as seo from './lib/seo.mjs';
import * as partials from './lib/partials.mjs';
import { generateSnapshot } from './lib/snapshot.mjs';
import { assetFiles, manifest, icoFromPng } from './lib/assets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = resolve(root, 'dist');
const srcScripts = resolve(root, 'src/scripts');
const srcStyles = resolve(root, 'src/styles');

function log(msg) {
  console.log(`  ${msg}`);
}

// --- Snapshot ------------------------------------------------------------- //
function loadSnapshot() {
  const p = resolve(root, 'src/data/snapshot.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  log('snapshot.json missing — generating');
  const snap = generateSnapshot();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(snap, null, 2));
  return snap;
}

// --- Context -------------------------------------------------------------- //
function buildContext(snapshot) {
  const models = new Map();
  for (const st of states) {
    const signals = snapshot.states[st.abbr];
    models.set(st.abbr, { model: computeModel(signals), signals });
  }
  const natSignals = nationalSignals(states.map((s) => snapshot.states[s.abbr]));
  const national = {
    state: { name: 'United States', abbr: 'US', slug: '' },
    model: computeModel(natSignals),
    signals: natSignals,
  };
  return {
    site,
    disclaimers,
    states,
    snapshot,
    weekEnding: snapshot.weekEnding,
    provenance: { live: false },
    models,
    national,
    render: { threatCard, pathogenTiles, stateChip, signalRows },
    seo,
    partials,
  };
}

// --- Writers -------------------------------------------------------------- //
function writePage(page) {
  const html = layout(page);
  let outPath;
  if (page.path === '/') outPath = join(dist, 'index.html');
  else if (page.path.endsWith('.html')) outPath = join(dist, page.path);
  else outPath = join(dist, page.path, 'index.html');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  return page.path;
}

// Conservative, safe CSS minifier: strips comments, collapses whitespace, and
// tightens only around { } ; — it never touches ':' or ',' so property values,
// selectors, and the data-URI in .select stay intact.
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

/**
 * Derive the `prefers-color-scheme: dark` block from the single
 * `:root[data-theme='dark']` rule and substitute it for the generation marker.
 *
 * Both contexts must carry an identical set of custom properties. Maintaining
 * them as two hand-written copies had already gone wrong once — the media copy
 * was missing four tokens, which is invisible until you view the site on a dark
 * OS without ever having clicked the theme toggle.
 */
function emitDarkMediaBlock(css) {
  const MARKER = '/* @generated-dark-media-block */';
  if (!css.includes(MARKER)) {
    throw new Error('tokens.css is missing the dark-media-block marker');
  }
  const m = css.match(/:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error("Could not find the :root[data-theme='dark'] rule in tokens.css");

  // Re-indent the captured declarations one level deeper for the nested rule.
  const body = m[1]
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join('\n');

  const block = `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {${body}\n  }\n}`;
  return css.replace(MARKER, block);
}

function bundleCss() {
  const order = ['tokens.css', 'base.css', 'components.css', 'main.css'];
  const css = order
    .map((f) => {
      const raw = readFileSync(join(srcStyles, f), 'utf8');
      return f === 'tokens.css' ? emitDarkMediaBlock(raw) : raw;
    })
    .join('\n');
  const min = minifyCss(css);
  // Content-hash the filename so the immutable cache header is always safe.
  const hash = createHash('sha256').update(min).digest('hex').slice(0, 10);
  const name = `styles.${hash}.css`;
  const out = join(dist, 'assets', name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `/* FluTrack — bundled stylesheet */\n${min}`);
  site.assets = { ...(site.assets || {}), css: name };
}

// Modules the browser loads directly (via <script type="module">). The rest of
// src/scripts is either imported transitively or build-time only.
const BROWSER_ENTRIES = ['ui.js', 'alerts.js', 'app.js', 'states-filter.js'];

// Imported only by the Node build (SSR), never by a browser module graph.
// Copying them shipped dead bytes to the CDN.
const BUILD_ONLY = new Set(['icons.js', 'map-render.js', 'us-tilegrid.js']);

function copyScripts() {
  const outDir = join(dist, 'assets', 'js');
  mkdirSync(outDir, { recursive: true });
  const emitted = [];
  for (const f of readdirSync(srcScripts)) {
    if (f === 'sw.js') continue; // service worker is emitted at the root scope
    if (BUILD_ONLY.has(f)) continue;
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(join(srcScripts, f), 'utf8');
    writeFileSync(join(outDir, f), stripJsComments(src));
    emitted.push(`/assets/js/${f}`);
  }
  site.assets = { ...(site.assets || {}), js: emitted };
}

// Conservative comment stripper: removes block and line comments while leaving
// string and template literals intact. The CSS already gets a minify pass; the
// JS shipped with full JSDoc, which was ~33% of its gzipped weight.
function stripJsComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let quote = null; // "'", '"', '`'
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '/' && next === '/') {
      // Not a comment if this '/' opens a regex literal — check the previous
      // meaningful char. Line comments always follow whitespace or a statement
      // end in this codebase, so the simple guard is sufficient.
      const prev = out.replace(/\s+$/, '').slice(-1);
      if (!['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '~', '%'].includes(prev)) {
        const end = src.indexOf('\n', i);
        i = end === -1 ? n : end;
        continue;
      }
    }
    out += c;
    i += 1;
  }
  // Collapse the blank lines the comment removal leaves behind.
  return out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
}

// Emit the service worker at the site root (root scope). The cache key is
// derived from EVERY emitted asset, not just the stylesheet — keying it on the
// CSS hash alone meant a JS-only deploy never rotated the cache, so users stayed
// one deploy behind on scripts indefinitely.
function writeServiceWorker() {
  const h = createHash('sha256').update(site.assets?.css || '');
  // Hash the actual script contents so any JS change rotates the cache, not
  // just a change to the (unhashed) filenames.
  for (const f of readdirSync(srcScripts).sort()) {
    if (f.endsWith('.js')) h.update(readFileSync(join(srcScripts, f)));
  }
  const fingerprint = h.digest('hex').slice(0, 12);
  // Precache the stylesheet and the scripts the browser actually loads, so the
  // offline shell renders styled and interactive.
  const precache = [`/assets/${site.assets.css}`, ...BROWSER_ENTRIES.map((f) => `/assets/js/${f}`)];
  const sw = readFileSync(join(srcScripts, 'sw.js'), 'utf8')
    .replace('__BUILD__', fingerprint)
    .replace('__ASSETS__', JSON.stringify(precache));
  writeFileSync(join(dist, 'sw.js'), sw);
}

function writeAssets() {
  const outDir = join(dist, 'assets');
  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(assetFiles(site))) {
    writeFileSync(join(outDir, name), content);
  }
  // Copy committed binary assets (PNG icons, OG card) from src/assets.
  const srcAssets = resolve(root, 'src/assets');
  if (existsSync(srcAssets)) {
    for (const f of readdirSync(srcAssets)) {
      if (/\.(png|ico|webp|jpg|jpeg)$/i.test(f)) cpSync(join(srcAssets, f), join(outDir, f));
    }
  }
  // Copy the bundled snapshot into the served tree, minified (the source copy
  // stays pretty-printed for readable diffs).
  const dataOut = join(dist, 'data');
  mkdirSync(dataOut, { recursive: true });
  const snap = JSON.parse(readFileSync(resolve(root, 'src/data/snapshot.json'), 'utf8'));
  writeFileSync(join(dataOut, 'snapshot.json'), JSON.stringify(snap));
}

function writeRootFiles(sitemapEntries) {
  writeFileSync(join(dist, 'sitemap.xml'), seo.sitemapXml(sitemapEntries));
  writeFileSync(join(dist, 'robots.txt'), seo.robotsTxt());
  writeFileSync(join(dist, 'manifest.webmanifest'), manifest(site));
  writeFileSync(join(dist, '_headers'), headers());
  writeFileSync(join(dist, '_redirects'), redirects());

  // favicon.ico at the root for legacy clients / bots that request it directly.
  const png32 = resolve(root, 'src/assets/favicon-32.png');
  if (existsSync(png32)) writeFileSync(join(dist, 'favicon.ico'), icoFromPng(readFileSync(png32), 32));

  // RFC 9116 security contact + humans.txt (transparency / firm-grade polish).
  mkdirSync(join(dist, '.well-known'), { recursive: true });
  writeFileSync(join(dist, '.well-known', 'security.txt'), securityTxt());
  writeFileSync(join(dist, 'humans.txt'), humansTxt());
}

function securityTxt() {
  // Expires ~1 year out from the season anchor (stable, avoids build-time Date).
  // Contact MUST be reachable — a security.txt pointing at a dead mailbox is
  // worse than none, so fall back to the contact page when no real mailbox is set.
  const contact = hasPublisherEmail()
    ? `mailto:${site.publisher.email}`
    : `${site.origin}/contact/`;
  return `# ${site.name} security contact
Contact: ${contact}
Expires: ${site.season.endsISO}T00:00:00Z
Preferred-Languages: en
Canonical: ${site.origin}/.well-known/security.txt
`;
}

function humansTxt() {
  return `/* TEAM */
  Site: ${site.name}
  Contact: ${hasPublisherEmail() ? site.publisher.email : `${site.origin}/contact/`}

/* SITE */
  An independent, plain-English respiratory illness tracker built on
  public-domain CDC surveillance data. Not affiliated with the CDC.
  Standards: HTML5, CSS3, ES modules, JSON-LD
  Components: Zero runtime dependencies. Static build. Cloudflare Pages.
`;
}

function headers() {
  // Content-Security-Policy tuned to exactly what FluTrack loads:
  //   * scripts are self-hosted ES modules; the single inline theme-boot script
  //     is allowlisted by its SHA-256 hash rather than 'unsafe-inline'.
  //   * style-src keeps 'unsafe-inline' because the templates use inline
  //     style="" attributes (no inline <style> blocks or remote styles).
  //   * connect-src permits the CDC Socrata API and the FCC geocoder used for
  //     "use my location".
  const bootHash = createHash('sha256').update(BOOT_SCRIPT).digest('base64');
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    `script-src 'self' 'sha256-${bootHash}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://data.cdc.gov https://geo.fcc.gov",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  Content-Security-Policy: ${csp}

/assets/js/*
  Cache-Control: public, max-age=300, stale-while-revalidate=86400

/assets/${site.assets.css}
  Cache-Control: public, max-age=31536000, immutable

/assets/*.png
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/assets/*.svg
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/data/*
  Cache-Control: public, max-age=3600

/sw.js
  Cache-Control: no-cache
`;
}

function redirects() {
  return `# Legacy / convenience redirects
/states  /states/  301
/state   /states/  301
`;
}

// --- Content-page discovery ---------------------------------------------- //
async function discoverContentPages(ctx) {
  const dir = resolve(here, 'pages/content');
  if (!existsSync(dir)) return [];
  const pages = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.mjs')) continue;
    const mod = await import(pathToFileURL(join(dir, file)).href);
    if (typeof mod.default !== 'function') {
      console.warn(`  ! ${file} has no default export — skipping`);
      continue;
    }
    const result = mod.default(ctx);
    for (const p of Array.isArray(result) ? result : [result]) pages.push(p);
  }
  return pages;
}

// --- Main ---------------------------------------------------------------- //
async function main() {
  console.log('FluTrack build');
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  const snapshot = loadSnapshot();
  const ctx = buildContext(snapshot);

  // Assets & code
  bundleCss();
  copyScripts();
  writeServiceWorker();
  writeAssets();
  log('assets, styles, scripts and service worker written');

  const written = [];
  const sitemap = [];

  // Home
  const { default: home } = await import('./pages/home.mjs');
  written.push(writePage(home(ctx)));
  sitemap.push({ path: '/', changefreq: 'daily', priority: 1.0, lastmod: snapshot.weekEnding });

  // Per-state pages
  const { statePage } = await import('./pages/state.mjs');
  for (const st of states) {
    written.push(writePage(statePage(ctx, st)));
    sitemap.push({ path: `/state/${st.slug}/`, changefreq: 'weekly', priority: 0.8, lastmod: snapshot.weekEnding });
  }
  log(`${states.length} state pages written`);

  // Auto-discovered content/legal pages
  const contentPages = await discoverContentPages(ctx);
  for (const page of contentPages) {
    written.push(writePage(page));
    if (!page.noindex) {
      sitemap.push({
        path: page.path,
        changefreq: page.changefreq || 'monthly',
        priority: page.priority ?? 0.5,
        lastmod: page.lastmod || (page.path === '/states/' ? snapshot.weekEnding : site.contentUpdated),
      });
    }
  }
  log(`${contentPages.length} content pages written`);

  writeRootFiles(sitemap);
  log('sitemap, robots, manifest, headers written');

  console.log(`\n✓ Built ${written.length} pages → dist/`);
}

main().catch((err) => {
  console.error('\n✗ Build failed:', err);
  process.exit(1);
});
