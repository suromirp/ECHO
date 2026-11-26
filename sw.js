// ECHO service worker: lets the installed app open without a network.
// Network first, so a new version on GitHub Pages is used as soon as it
// is reachable; the cached copy is only the fallback. Only ECHO's own
// files pass through here; messages are never fetched or stored.
const CACHE = 'echo-v1';
const FILES = ['./', './index.html', './manifest.webmanifest',
  './icons/echo-192.png', './icons/echo-512.png', './icons/echo-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
    .then(hit => hit || Response.error())));
});
