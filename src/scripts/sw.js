/* FluTrack service worker (classic). Conservative by design for a data site:
   pages and data are network-FIRST (freshness wins; cache is only the offline
   fallback), while static assets are stale-while-revalidate. Cross-origin
   requests (e.g. the CDC API) are never intercepted. */

var VERSION = '__BUILD__';
var CACHE = 'flutrack-' + VERSION;
var OFFLINE_URL = '/offline.html';
// Includes the hashed stylesheet and the browser entry scripts (injected by the
// build). Precaching only the HTML meant the offline shell painted unstyled:
// the SW registers on window.load, i.e. after the CSS/JS have already been
// fetched without interception, so nothing else was ever in the cache.
var PRECACHE = ['/', OFFLINE_URL, '/manifest.webmanifest'].concat(__ASSETS__);

/** Only cache real, complete, same-origin responses. Storing a 404/500 body
 *  poisons the offline fallback until the cache is rotated. */
function cacheable(res) {
  return res && res.ok && res.status === 200 && res.type !== 'opaque';
}

function putInCache(req, res) {
  if (!cacheable(res)) return;
  var copy = res.clone();
  caches.open(CACHE).then(function (c) {
    c.put(req, copy);
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE).catch(function () {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  var isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;
  var isData = url.pathname.indexOf('/data/') === 0;

  if (isDoc || isData) {
    // Network-first: try the network, fall back to cache, then offline page.
    event.respondWith(
      fetch(req)
        .then(function (res) {
          putInCache(req, res);
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            if (hit) return hit;
            if (isDoc) {
              return caches.match(OFFLINE_URL).then(function (off) {
                return off || Response.error();
              });
            }
            return Response.error();
          });
        })
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then(function (hit) {
      var fetched = fetch(req)
        .then(function (res) {
          putInCache(req, res);
          return res;
        })
        .catch(function () {
          // Resolving to `undefined` here surfaced as a hard network error
          // rather than a graceful miss.
          return hit || Response.error();
        });
      return hit || fetched;
    })
  );
});
