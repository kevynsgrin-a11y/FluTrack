import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function contentHash(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/** One content-addressed directory keeps relative and lazy imports together. */
export function writeVersionedScripts(sourceDir, assetsDir) {
  const files = readdirSync(sourceDir).filter((name) => name.endsWith('.js')).sort();
  const sources = files.map((name) => [name, readFileSync(join(sourceDir, name))]);
  const hash = createHash('sha256');
  for (const [name, source] of sources) hash.update(name).update('\0').update(source).update('\0');
  const version = hash.digest('hex').slice(0, 12);
  const path = `js/${version}`;
  mkdirSync(join(assetsDir, path), { recursive: true });
  for (const [name, source] of sources) {
    if (name === 'sw.js') continue; // Root-scoped worker; its source affects the version.
    writeFileSync(join(assetsDir, path, name), source);
    // Keep legacy URLs available for older pages and bookmarks.
    writeFileSync(join(assetsDir, 'js', name), source);
  }
  return { path, version };
}

export function scriptHref(src, assets = {}) {
  return assets.js && src.startsWith('/assets/js/')
    ? `/assets/${assets.js}/${src.slice('/assets/js/'.length)}`
    : src;
}
