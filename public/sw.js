/*
 * NSUT Nest service worker.
 *
 * Caches only public, non-personal data:
 *   - build assets, icons, logo and images (cache-first)
 *   - the IMS notice board JSON and the public date sheet (stale-while-revalidate)
 *   - visited page documents, so /notices and its deep links still open offline
 *
 * It never caches /api/ims/* (login, attendance, profile) or the live view
 * counter. Attendance, profile and read state are already kept deliberately in
 * localStorage by the app, not here.
 */
const VERSION = "nsut-nest-v2";
const STATIC_CACHE = `${VERSION}-static`;
const DATA_CACHE = `${VERSION}-data`;
const PAGE_CACHE = `${VERSION}-pages`;
const MAX_PAGES = 20;
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/nsutnest-192.png",
  "/icons/nsutnest-512.png",
  "/nsutnest-logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, DATA_CACHE, PAGE_CACHE]);
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("nsut-nest-") && !keep.has(key))
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      const keys = await cache.keys();
      if (keys.length > MAX_PAGES) await Promise.all(keys.slice(0, keys.length - MAX_PAGES).map((key) => cache.delete(key)));
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match("/offline.html");
    return offline || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest") return;

  // Personalized or live endpoints stay network-only.
  if (url.pathname.startsWith("/api/ims/") || url.pathname === "/api/live-views") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (url.pathname === "/api/notices" || url.pathname === "/data/datesheet.json") {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/nsutnest-logo.png" ||
    url.pathname === "/campus-map.png";
  if (isStaticAsset) event.respondWith(cacheFirst(request));
});
