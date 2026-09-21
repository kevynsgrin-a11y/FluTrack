import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const mustExist = [
  'dist/assets/fonts/newsreader-latin.woff2',
  'dist/assets/fonts/public-sans-latin.woff2',
  'dist/assets/fonts/ibm-plex-mono-numerals.woff2',
  'dist/assets/js/map-keyboard.js',
  'dist/assets/js/sticky-status.js',
  'dist/assets/og/florida.svg',
];
for (const file of mustExist) if (!existsSync(file)) throw new Error(`Missing ${file}`);
const fontBytes = mustExist.slice(0, 3).map((file) => readFileSync(file).byteLength).reduce((a, b) => a + b, 0);
if (fontBytes > 120 * 1024) throw new Error(`Font payload ${fontBytes} exceeds 120 KB budget`);
const css = readFileSync(readdirSync('dist/assets').find((f) => /^styles\..+\.css$/.test(f)).replace(/^/, 'dist/assets/'), 'utf8');
for (const token of ['--brand-500', '--sev-0', '--sev-4', '--map-0', '--map-4', '--font-sans', '--font-mono', '--space-2xs', '--radius-xl', '--shadow-lg']) {
  if (!css.includes(token)) throw new Error(`Required CSS custom property missing: ${token}`);
}
const pages = ['index.html', 'state/florida/index.html', 'states/index.html', 'alerts/index.html', '404.html'];
for (const page of pages) {
  const html = readFileSync(join('dist', page), 'utf8');
  if (!/<h1[\s>]/.test(html)) throw new Error(`${page} has no h1`);
  if (!html.includes('data-theme-choice="system"') || !html.includes('data-theme-choice="light"') || !html.includes('data-theme-choice="dark"')) throw new Error(`${page} lacks explicit theme choices`);
  if (html.includes('role="presentation"') && html.includes('us-map__svg')) throw new Error(`${page} exposes interactive map as presentation`);
}
const home = readFileSync('dist/index.html', 'utf8');
for (const hook of ['data-region="threat-card"', 'data-week=', 'id="state-picker"', 'id="state-select"', 'id="geo-btn"', 'data-region="pathogen-tiles"', 'data-region="signal-rows"']) {
  if (!home.includes(hook)) throw new Error(`Home runtime hook missing: ${hook}`);
}
const florida = readFileSync('dist/state/florida/index.html', 'utf8');
for (const hook of ['data-state="FL"', 'data-sticky-status', 'data-region="glance-level"', 'data-region="glance-trend"', 'data-region="glance-week"']) {
  if (!florida.includes(hook)) throw new Error(`State runtime hook missing: ${hook}`);
}
if (!florida.includes('/assets/og/florida.svg')) throw new Error('Florida does not reference its state-specific OG card');
const ogFiles = readdirSync('dist/assets/og').filter((name) => name.endsWith('.svg'));
if (ogFiles.length !== 51) throw new Error(`Expected 51 state social cards, found ${ogFiles.length}`);
console.log(`Overhaul structure verified: ${pages.length} key pages; ${fontBytes} font bytes; ${ogFiles.length} state social cards.`);
