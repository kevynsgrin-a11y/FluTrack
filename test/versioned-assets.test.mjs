import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { contentHash, scriptHref, writeVersionedScripts } from '../build/lib/versioned-assets.mjs';
import { layout } from '../build/lib/layout.mjs';
import { site } from '../build/lib/site.mjs';

test('a changed dependency gets a new module tree despite a cached entry and lazy import', async () => {
  const root = mkdtempSync(join(tmpdir(), 'flutrack-assets-'));
  try {
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    const source = join(root, 'source');
    const assets = join(root, 'assets');
    mkdirSync(source);
    const modelSpecifier = './model.js';
    writeFileSync(join(source, 'app.js'), `export { reading } from ${JSON.stringify(modelSpecifier)}; export const lazy = () => import('./extra.js');`);
    writeFileSync(join(source, 'model.js'), 'export const reading = "old wording";');
    writeFileSync(join(source, 'extra.js'), 'export const reading = "old lazy wording";');
    writeFileSync(join(source, 'sw.js'), 'const version = "__BUILD__";');
    const first = writeVersionedScripts(source, assets);
    const old = await import(pathToFileURL(join(assets, first.path, 'app.js')));
    assert.equal(old.reading, 'old wording');
    assert.equal((await old.lazy()).reading, 'old lazy wording');
    writeFileSync(join(source, 'model.js'), 'export const reading = "corrected wording";');
    writeFileSync(join(source, 'extra.js'), 'export const reading = "corrected lazy wording";');
    const next = writeVersionedScripts(source, assets);
    assert.notEqual(next.path, first.path);
    const current = await import(pathToFileURL(join(assets, next.path, 'app.js')));
    assert.equal(current.reading, 'corrected wording');
    assert.equal((await current.lazy()).reading, 'corrected lazy wording');
    assert.equal(old.reading, 'old wording'); // Old cached URL cannot affect the new graph.
    assert.equal(writeVersionedScripts(source, assets).path, next.path);
    writeFileSync(join(source, 'sw.js'), 'const version = "__BUILD__"; // worker update');
    assert.notEqual(writeVersionedScripts(source, assets).version, next.version);
    assert.equal(readFileSync(join(assets, 'js', 'app.js'), 'utf8'), readFileSync(join(source, 'app.js'), 'utf8'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('layout uses the same version for every entry and the content-addressed share image', () => {
  const previous = site.assets;
  try {
    site.assets = { js: 'js/012345abcdef', ogImage: '/assets/og-default.abcdef012345.png' };
    const html = layout({ path: '/', body: '<h1>Reading</h1>', scripts: ['/assets/js/app.js', '/assets/js/report-boot.js'] });
    const entries = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(entries.length >= 5);
    assert.ok(entries.every((src) => src.startsWith('/assets/js/012345abcdef/')));
    assert.match(html, /og:image" content="https:\/\/flufollower.com\/assets\/og-default.abcdef012345.png/);
    assert.match(html, /twitter:image" content="https:\/\/flufollower.com\/assets\/og-default.abcdef012345.png/);
  } finally {
    site.assets = previous;
  }
});

test('binary content changes the asset address and external script URLs remain intact', () => {
  assert.notEqual(contentHash(Buffer.from('old PNG')), contentHash(Buffer.from('neutral PNG')));
  assert.equal(scriptHref('https://example.com/app.js', { js: 'js/012345abcdef' }), 'https://example.com/app.js');
  assert.equal(scriptHref('/assets/js/app.js'), '/assets/js/app.js');
});
