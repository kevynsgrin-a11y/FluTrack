// ===========================================================================
// One-time PNG rasterizer. Drives the system Chromium (no npm dependency) to
// bake the SVG icon + Open Graph sources into committed PNGs under src/assets/.
// Re-run manually only when the icon design changes:  node build/lib/rasterize.mjs
// ===========================================================================

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { iconSvg, ogSvg } from './assets.mjs';
import { site } from './site.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outDir = resolve(root, 'src/assets');
const tmp = resolve(root, '.raster-tmp');

function findChrome() {
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) throw new Error('Chromium not found');
  const dir = readdirSync(base).find((d) => d.startsWith('chromium-') && !d.includes('headless'));
  const candidate = join(base, dir, 'chrome-linux', 'chrome');
  if (!existsSync(candidate)) throw new Error(`Chrome binary not at ${candidate}`);
  return candidate;
}

function htmlFor(svg, w, h) {
  const sized = svg.replace(/<svg /, `<svg preserveAspectRatio="xMidYMid meet" `);
  return `<!doctype html><meta charset="utf-8">
<style>*{margin:0;padding:0}html,body{width:${w}px;height:${h}px;overflow:hidden;background:transparent}
svg{display:block;width:${w}px;height:${h}px}</style>${sized}`;
}

function render(chrome, svg, w, h, outName) {
  mkdirSync(tmp, { recursive: true });
  const htmlPath = join(tmp, `${outName}.html`);
  writeFileSync(htmlPath, htmlFor(svg, w, h));
  const out = join(outDir, outName);
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${w},${h}`,
      `--screenshot=${out}`,
      `file://${htmlPath}`,
    ],
    { stdio: 'pipe' }
  );
  console.log(`  rendered ${outName} (${w}×${h})`);
}

function main() {
  const chrome = findChrome();
  mkdirSync(outDir, { recursive: true });
  const icon = iconSvg({ size: 512 });
  render(chrome, icon, 32, 32, 'favicon-32.png');
  render(chrome, icon, 180, 180, 'apple-touch-icon.png');
  render(chrome, icon, 192, 192, 'icon-192.png');
  render(chrome, icon, 512, 512, 'icon-512.png');
  render(chrome, icon, 512, 512, 'icon-maskable-512.png');
  render(chrome, ogSvg(site), 1200, 630, 'og-default.png');
  rmSync(tmp, { recursive: true, force: true });
  console.log('✓ Rasterized icons + OG card → src/assets/');
}

main();
