const CACHE = 'salaah-v1';
const SHELL = [
  '/',
  '/index.html',
  '/support.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Code that changes on every deploy: network-first, cache only as an offline
// fallback, so a server-side fix is visible on the next load instead of being
// hidden behind this cache until CACHE's version string is bumped by hand.
const NETWORK_FIRST = ['/', '/index.html', '/support.js', '/manifest.json'];

self.addEventListener('fetch', e => {
  const path = new URL(e.request.url).pathname;
  // Audio files: network first (stream properly), cache fallback
  if (path.startsWith('/audio/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  if (NETWORK_FIRST.includes(path)) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Static assets (icons): cache first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
