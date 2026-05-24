// travelmate Service Worker v2.0 — auto-update via version.json
const CACHE_NAME = 'travelmate-v2';

const SW_PATH   = self.location.pathname;
const BASE      = SW_PATH.substring(0, SW_PATH.lastIndexOf('/') + 1);

const ASSETS = [
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'logo.png',
  BASE + 'version.json',
];

// ── INSTALL: cache all assets ──────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        ASSETS.map(url =>
          fetch(url, { cache: 'no-store' }).then(res => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// ── ACTIVATE: compare version.json, clear old cache if changed ────────────
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 1. Remove any old-named caches
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));

    // 2. Fetch latest version.json from network (bypass cache)
    try {
      const networkRes  = await fetch(BASE + 'version.json', { cache: 'no-store' });
      if (!networkRes.ok) return;
      const networkVer  = await networkRes.clone().json();

      const cache       = await caches.open(CACHE_NAME);
      const cachedRes   = await cache.match(BASE + 'version.json');
      const cachedVer   = cachedRes ? await cachedRes.json() : null;

      if (cachedVer && cachedVer.version === networkVer.version) {
        // Same version — nothing to do
        return;
      }

      // Different version → nuke the entire cache and re-cache fresh assets
      await caches.delete(CACHE_NAME);
      const fresh = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        ASSETS.map(url =>
          fetch(url, { cache: 'no-store' }).then(res => {
            if (res.ok) return fresh.put(url, res);
          }).catch(() => {})
        )
      );

      // Tell all open tabs there's a new version
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client =>
        client.postMessage({ type: 'UPDATE_AVAILABLE', version: networkVer.version, buildTime: networkVer.buildTime })
      );
    } catch (_) {
      // Offline or fetch failed — skip silently
    }

    self.clients.claim();
  })());
});

// ── FETCH: cache-first for local, network-only for external ────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  const url        = new URL(e.request.url);
  const isExternal = url.hostname !== self.location.hostname;

  // Always bypass cache for version.json so we can detect updates on next SW activate
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request)));
    return;
  }

  if (isExternal) {
    // Firebase, CDN, fonts — straight to network, never cache
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
        if (e.request.mode === 'navigate') {
          return caches.match(BASE + 'index.html');
        }
      });
    })
  );
});
