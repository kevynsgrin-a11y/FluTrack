// ===========================================================================
// In-memory stand-ins for the Cloudflare bindings the Functions and the
// ingest Worker use, so their real code runs unchanged under node:test.
//
//   d1()      D1 on node:sqlite (Node >= 22), with migrations/0001_init.sql
//             applied — real SQL, real constraints
//   kv()      Workers KV (get/put/delete/list, expirationTtl recorded)
//   assets()  env.ASSETS serving the bundled snapshot, the ZIP shards and a
//             build.json, like the built site would
// ===========================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shardCrosswalk } from '../../src/server/zip-lookup.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// node:sqlite is still flagged experimental; keep its one warning out of test output.
const { emitWarning } = process;
process.emitWarning = (w, ...rest) => (String(w).includes('SQLite') ? undefined : emitWarning.call(process, w, ...rest));
const { DatabaseSync } = await import('node:sqlite');

export const MIGRATION = readFileSync(resolve(root, 'migrations/0001_init.sql'), 'utf8');

export function d1({ migrate = true } = {}) {
  const db = new DatabaseSync(':memory:');
  if (migrate) db.exec(MIGRATION);
  const statement = (sql, params = []) => ({
    sql,
    params,
    bind: (...args) => statement(sql, args),
    async first(col) {
      const row = db.prepare(sql).get(...params);
      if (!row) return null;
      return col ? row[col] : { ...row };
    },
    async all() {
      return { success: true, results: db.prepare(sql).all(...params).map((r) => ({ ...r })), meta: {} };
    },
    async run() {
      const r = db.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    raw: db,
    prepare: (sql) => statement(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) {
      db.exec(sql);
    },
    /** Test convenience: synchronous query. */
    q: (sql, ...params) => db.prepare(sql).all(...params).map((r) => ({ ...r })),
  };
}

export function kv() {
  const store = new Map();
  const ttl = new Map();
  return {
    store,
    ttl,
    ops: 0,
    async get(key, type) {
      this.ops += 1;
      if (!store.has(key)) return null;
      const v = store.get(key);
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key, value, opts = {}) {
      this.ops += 1;
      store.set(key, String(value));
      if (opts.expirationTtl) ttl.set(key, opts.expirationTtl);
    },
    async delete(key) {
      this.ops += 1;
      store.delete(key);
    },
    async list({ prefix = '' } = {}) {
      this.ops += 1;
      return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
    },
  };
}

export function assets({ snapshot } = {}) {
  const shards = shardCrosswalk(readFileSync(resolve(root, 'src/data/zip-county.csv'), 'utf8'));
  const snap = snapshot || JSON.parse(readFileSync(resolve(root, 'src/data/snapshot.json'), 'utf8'));
  return {
    async fetch(req) {
      const { pathname } = new URL(typeof req === 'string' ? req : req.url);
      if (pathname === '/data/snapshot.json') return Response.json(snap);
      if (pathname === '/assets/build.json') return Response.json({ css: 'styles.test.css' });
      const m = pathname.match(/^\/data\/zip3\/(\d{3})\.json$/);
      if (m && shards[m[1]]) return Response.json(shards[m[1]]);
      return new Response('not found', { status: 404 });
    },
  };
}

/** A fetch stub answering from recorded CDC fixtures by dataset id in the URL. */
export function cdcFetch(overrides = {}) {
  const fx = (id) => JSON.parse(readFileSync(resolve(root, `test/fixtures/cdc/${id}.json`), 'utf8'));
  const calls = [];
  const impl = async (url) => {
    const u = String(url);
    calls.push(u);
    for (const [id, body] of Object.entries(overrides)) {
      if (u.includes(id)) return typeof body === 'function' ? body(u) : Response.json(body);
    }
    for (const id of ['vutn-jzwm', 'f3zz-zga5', 'vdzy-6i9v', 'ua7e-t2fy', 'mpgq-jmmr', 'atcp-73re', 'ymmh-divb']) {
      if (u.includes(id)) return Response.json(fx(id));
    }
    if (u.includes('api.delphi.cmu.edu')) return Response.json(fx('delphi-fluview'));
    return new Response('[]', { status: 404 });
  };
  impl.calls = calls;
  return impl;
}

export const fixture = (id) => JSON.parse(readFileSync(resolve(root, `test/fixtures/cdc/${id}.json`), 'utf8'));
