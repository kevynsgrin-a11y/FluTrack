// ===========================================================================
// Static check for the JS/ESM source tree. FluTrack ships no TypeScript and
// no type-checker dependency, so "typecheck" here means the two checks that
// actually catch broken source without a compiler on the box:
//
//   1. SYNTAX — every .js/.mjs file parses (node --check), so a syntax error
//      can never be committed behind a green test run.
//   2. IMPORTS — every relative specifier resolves to a real file on disk, so
//      a renamed or deleted module is caught here rather than at page load.
//
// Deliberately dependency-free (see package.json devDependencies) and offline.
// Exits non-zero on failure so it can gate CI.  Usage: node build/typecheck.mjs
// ===========================================================================

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

// Source roots that ship or run: build tooling, browser scripts, Worker
// handlers, and the tests themselves. dist/ is generated output and node_modules
// is third-party, so both are excluded.
const ROOTS = ['build', 'src', 'functions', 'test'];
const SKIP = new Set(['node_modules', 'dist', '.git']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const files = ROOTS.filter((d) => existsSync(join(root, d))).flatMap((d) => walk(join(root, d)));

// --- 1. Syntax ------------------------------------------------------------ //

for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || '').trim().split('\n').slice(0, 3).join(' ');
    errors.push(`${relative(root, file)}: syntax error — ${detail}`);
  }
}

// --- 2. Imports ----------------------------------------------------------- //

// Static import specifiers — the trailing `from` clause and bare side-effect
// imports — that are relative, i.e. begin with a dot. Dynamic import() with a
// non-literal argument cannot be resolved statically, so it is skipped.
//
// Comments are stripped first: this file documents the pattern it searches for,
// and a doc comment quoting a sample specifier is not a real import. The match
// is single-line, which keeps comment stripping from pairing an unbalanced
// quote (e.g. the `//` in a URL) with a later line.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*)(['"])(\.[^\n'"]*)\1/g;

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function resolves(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js'), join(base, 'index.mjs')];
  return candidates.some((c) => existsSync(c) && statSync(c).isFile());
}

for (const file of files) {
  const source = stripComments(readFileSync(file, 'utf8'));
  for (const [, , specifier] of source.matchAll(SPECIFIER)) {
    // A bare `...` is prose standing in for a path, not an import.
    if (specifier === '...' || specifier === './...') continue;
    if (!resolves(file, specifier)) {
      errors.push(`${relative(root, file)}: unresolved import '${specifier}'`);
    }
  }
}

// --- Report --------------------------------------------------------------- //

if (errors.length) {
  for (const e of errors) console.error(`  ${e}`);
  console.error(`\ntypecheck failed: ${errors.length} problem(s) in ${files.length} file(s)`);
  process.exit(1);
}

console.log(`typecheck ok: ${files.length} file(s) parsed, imports resolved`);
