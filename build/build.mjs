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
import { site, disclaimers } from './lib/site.mjs';
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

function bundleCss() {
  const order = ['tokens.css', 'base.css', 'components.css', 'main.css'];
  const css = order.map((f) => readFileSync(join(srcStyles, f), 'utf8')).join('\n');
  const min = minifyCss(css);
  // Content-hash the filename so the immutable cache header is always safe.
  const hash = createHash('sha256').update(min).digest('hex').slice(0, 10);
  const name = `styles.${hash}.css`;
  const out = join(dist, 'assets', name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `/* FluTrack — bundled stylesheet */\n${min}`);
  site.assets = { ...(site.assets || {}), css: name };
}

function copyScripts() {
  const outDir = join(dist, 'assets', 'js');
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(srcScripts)) {
    if (f.endsWith('.js')) cpSync(join(srcScripts, f), join(outDir, f));
  }
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
  return `# ${site.name} security contact
Contact: mailto:${site.publisher.email}
Expires: ${site.season.endsISO}T00:00:00Z
Preferred-Languages: en
Canonical: ${site.origin}/.well-known/security.txt
`;
}

function humansTxt() {
  return `/* TEAM */
  Site: ${site.name}
  Contact: ${site.publisher.email}

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

/assets/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/assets/styles.*.css
  Cache-Control: public, max-age=31536000, immutable

/data/*
  Cache-Control: public, max-age=3600
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
  writeAssets();
  log('assets, styles and scripts written');

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
