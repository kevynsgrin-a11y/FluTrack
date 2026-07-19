// ===========================================================================
// Minimal static file server for local preview of dist/. Also emulates the
// /api/subscribe Pages Function (returns 501) so the signup form can be
// exercised end-to-end without Cloudflare. Dependency-free.
//   node build/serve.mjs [port]
// ===========================================================================

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname, normalize } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'dist');
const port = Number(process.argv[2]) || 8788;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

async function tryFiles(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidates = [];
  if (clean.endsWith('/')) candidates.push(join(dist, clean, 'index.html'));
  else {
    candidates.push(join(dist, clean));
    candidates.push(join(dist, clean, 'index.html'));
  }
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isFile()) return c;
    } catch (e) {
      /* keep trying */
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  // Emulate the subscribe endpoint locally.
  if (req.url.split('?')[0] === '/api/subscribe' && req.method === 'POST') {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, message: 'Local preview: subscription endpoint not configured.' }));
    return;
  }

  const file = await tryFiles(req.url);
  if (!file) {
    const notFound = join(dist, '404.html');
    try {
      const body = await readFile(notFound);
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      res.end(body);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end('500');
  }
});

server.listen(port, () => {
  console.log(`FluTrack preview → http://localhost:${port}`);
});
