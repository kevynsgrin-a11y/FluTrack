/* FluTrack service worker (classic). Conservative by design for a data site:
   pages and data are network-FIRST (freshness wins; cache is only the offline
   fallback), while static assets are stale-while-revalidate. Cross-origin
   requests (e.g. the CDC API) are never intercepted. */

var VERSION = '__BUILD__';
var CACHE = 'flutrack-' + VERSION;
var OFFLINE_URL = '/offline.html';
var PRECACHE = ['/', OFFLINE_URL, '/manifest.webmanifest'];

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
          var copy = res.clone();
          caches.open(CACHE).then(function (c) {
            c.put(req, copy);
          });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || (isDoc ? caches.match(OFFLINE_URL) : Response.error());
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
          var copy = res.clone();
          caches.open(CACHE).then(function (c) {
            c.put(req, copy);
          });
          return res;
        })
        .catch(function () {
          return hit;
        });
      return hit || fetched;
    })
  );
});
