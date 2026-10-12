/* ============================================================================
 * Rasta — service worker
 * Cache-first for the app shell, so routes and planning work with no network.
 * Only registers when served over http(s); opening index.html from disk works
 * regardless and simply skips this file.
 * ==========================================================================*/

/* Bump this whenever the app shell changes. `activate` deletes every cache
 * whose name does not match, which is what evicts a bad build from clients that
 * already installed it. Increment this when the shell changes so clients
 * refresh their cached copy. */
var CACHE = 'rasta-v4';

var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data/transit-data.js',
  './data/rasta.js',
  './manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // addAll rejects the whole install if any single file 404s, so add
      // individually and tolerate misses.
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(url).catch(function () { /* optional asset */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        // Refresh in the background so the next launch gets any update.
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res); });
        }).catch(function () { /* offline: keep the cached copy */ });
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // Navigation requests fall back to the shell when offline.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
