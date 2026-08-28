// ===========================================================================
// One-time PNG rasterizer. Drives the system Chromium (no npm dependency) to
// bake the SVG icon + Open Graph sources into committed PNGs under src/assets/.
// Re-run manually only when the icon design changes:  node build/lib/rasterize.mjs
//
// Two defects used to make every file this script emitted wrong, and both were
// invisible because nothing in the build ever opened a PNG:
//
//  1. `--window-size` sets the OUTER window. Headless Chromium reserves a fixed
//     strip of window chrome from that budget (87 CSS px on the Chromium this
//     was measured against), so the page viewport was `h - 87` while the
//     screenshot was still written at the full `w x h`. Every icon lost its
//     bottom rows; favicon-32 degenerated to a single painted row — a blank tab
//     icon — because Chromium also clamps the window to a 500x88 minimum.
//     Fixed by measuring the reservation at runtime (never hardcoding it),
//     rendering that much taller, and cropping back to the exact canvas.
//  2. A bare `svg{}` type selector also matched the nested <svg> that the OG
//     card inlines for its brand mark, resizing it from 84x84 to the full
//     1200x630 and painting a giant ghost shield across the headline. Fixed by
//     scoping the rule to the document's own root SVG.
//
// build/check.mjs now asserts on the emitted pixels, so a regression in either
// fails the build instead of shipping.
// ===========================================================================

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { iconSvg, ogSvg } from './assets.mjs';
import { site } from './site.mjs';
import { decodePng, encodePng, encodePngIndexed, cropTop, paintedBounds } from './png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outDir = resolve(root, 'src/assets');
const tmp = resolve(root, '.raster-tmp');

const BASE_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
];

function findChrome() {
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) throw new Error('Chromium not found');
  const dir = readdirSync(base).find((d) => d.startsWith('chromium-') && !d.includes('headless'));
  const candidate = join(base, dir, 'chrome-linux', 'chrome');
  if (!existsSync(candidate)) throw new Error(`Chrome binary not at ${candidate}`);
  return candidate;
}

/**
 * Measure how many CSS pixels of the requested window height headless Chromium
 * keeps for itself. Measured, never assumed: the value is a browser-build
 * detail, so a hardcoded constant silently rots on the next Chromium bump and
 * quietly truncates every asset again.
 */
function calibrateChromeHeight(chrome) {
  mkdirSync(tmp, { recursive: true });
  const probe = 600;
  const htmlPath = join(tmp, 'calibrate.html');
  writeFileSync(
    htmlPath,
    `<!doctype html><meta charset="utf-8"><body>` +
      `<script>document.body.setAttribute('data-inner-height', String(window.innerHeight))</script>`
  );
  const dom = execFileSync(
    chrome,
    [...BASE_FLAGS, `--window-size=600,${probe}`, '--dump-dom', `file://${htmlPath}`],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const m = dom.match(/data-inner-height="(\d+)"/);
  if (!m) throw new Error('viewport calibration failed: probe did not report innerHeight');
  const reserved = probe - Number(m[1]);
  if (!Number.isFinite(reserved) || reserved < 0 || reserved > 400) {
    throw new Error(`viewport calibration produced an implausible reservation: ${reserved}px`);
  }
  return reserved;
}

function htmlFor(svg, w, h) {
  const sized = svg.replace(/<svg /, `<svg preserveAspectRatio="xMidYMid meet" `);
  // `body > svg` — NOT a bare `svg`. The OG card inlines a nested <svg> for its
  // brand mark, and CSS width/height are geometry properties that beat the
  // element's own width/height attributes, so an unscoped rule blew the 84px
  // mark up to the full canvas.
  return `<!doctype html><meta charset="utf-8">
<style>*{margin:0;padding:0}html,body{width:${w}px;height:${h}px;overflow:hidden;background:transparent}
body>svg{display:block;width:${w}px;height:${h}px}</style>${sized}`;
}

/**
 * @param opaque drop the alpha channel. Required for surfaces that flatten it:
 *               an Android maskable icon must be edge-to-edge opaque, and the
 *               OG card is never composited over a page, so its alpha is pure
 *               weight (and was hiding the truncation band).
 */
function render(chrome, svg, w, h, outName, { opaque = false, indexed = false } = {}) {
  mkdirSync(tmp, { recursive: true });
  const htmlPath = join(tmp, `${outName}.html`);
  writeFileSync(htmlPath, htmlFor(svg, w, h));
  const rawPath = join(tmp, `${outName}.raw.png`);
  execFileSync(
    chrome,
    [
      ...BASE_FLAGS,
      '--default-background-color=00000000',
      `--window-size=${w},${h + CHROME_H}`,
      `--screenshot=${rawPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: 'pipe' }
  );

  const img = decodePng(readFileSync(rawPath));
  if (img.width !== w) {
    throw new Error(`${outName}: expected ${w}px wide capture, got ${img.width}px`);
  }
  if (img.height < h) {
    throw new Error(`${outName}: capture is ${img.height}px tall, need at least ${h}px`);
  }
  const rgba = cropTop(img.rgba, w, h);

  // Every source here paints a full-bleed background rect, so a correctly
  // captured render reaches the last row. Any blank tail means the viewport was
  // still short — fail now rather than commit another truncated asset.
  const bounds = paintedBounds(rgba, w, h);
  if (bounds.blankBottomRows > 0) {
    throw new Error(
      `${outName}: ${bounds.blankBottomRows} blank row(s) at the bottom — capture is still truncated`
    );
  }

  let png = encodePng(rgba, w, h, { alpha: !opaque });
  let mode = opaque ? 'opaque' : 'rgba';
  if (indexed) {
    // Flat vector art indexes far smaller than truecolour. Keep whichever
    // actually wins rather than assuming.
    const alt = encodePngIndexed(rgba, w, h, 256);
    if (alt.length < png.length) {
      png = alt;
      mode = 'indexed';
    }
  }
  writeFileSync(join(outDir, outName), png);
  console.log(
    `  rendered ${outName} (${w}×${h}, ${mode}, ${(png.length / 1024).toFixed(1)} KB)`
  );
}

let CHROME_H = 0;

function main() {
  const chrome = findChrome();
  mkdirSync(outDir, { recursive: true });
  CHROME_H = calibrateChromeHeight(chrome);
  console.log(`  headless viewport reservation measured at ${CHROME_H}px`);

  const icon = iconSvg({ size: 512 });
  render(chrome, icon, 32, 32, 'favicon-32.png');
  render(chrome, icon, 180, 180, 'apple-touch-icon.png');
  render(chrome, icon, 192, 192, 'icon-192.png');
  render(chrome, icon, 512, 512, 'icon-512.png');
  // A real maskable variant, not a copy of the standard icon: full-bleed and
  // opaque, with the glyph inside Android's 40% safe radius.
  render(chrome, iconSvg({ size: 512, maskable: true }), 512, 512, 'icon-maskable-512.png', {
    opaque: true,
  });
  // Indexed: the card must stay under the ~300 KB link-preview thumbnail
  // ceiling that WhatsApp and some other share surfaces enforce, or it silently
  // degrades to no rich preview at all.
  render(chrome, ogSvg(site), 1200, 630, 'og-default.png', { opaque: true, indexed: true });

  rmSync(tmp, { recursive: true, force: true });
  console.log('✓ Rasterized icons + OG card → src/assets/');
}

main();
