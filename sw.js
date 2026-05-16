// travelmate Service Worker v1.5
const CACHE_NAME = 'travelmate-v5';

// Derive base path from SW location
// On GitHub Pages: /travelmate/sw.js → base = /travelmate/
// On custom domain: /sw.js → base = /
const SW_PATH = self.location.pathname; // e.g. /travelmate/sw.js
const BASE = SW_PATH.substring(0, SW_PATH.lastIndexOf('/') + 1); // e.g. /travelmate/

const ASSETS = [
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'logo.png'
];

// Install — cache files using correct paths, skip silently if missing
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        ASSETS.map(url =>
          fetch(url).then(res => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {
            // Silently skip — file may not exist (e.g. logo.png optional)
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate — remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - External (Firebase, CDN, fonts): always network, no caching
// - Local files: cache-first, fallback to network
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  const url = new URL(e.request.url);
  const isExternal = url.hostname !== self.location.hostname;

  if (isExternal) {
    // Let external requests go straight to network — never cache Firebase/EmailJS
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: serve index.html for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match(BASE + 'index.html');
        }
      });
    })
  );
});
