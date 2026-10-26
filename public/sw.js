/* NSUT Nest PWA service worker.
   Deliberately does not cache pages, API responses, IMS credentials, CAPTCHA
   sessions, attendance, or student data. Only versioned static assets are cached. */
const CACHE_NAME = "nsut-nest-static-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([OFFLINE_URL, "/icons/nsutnest-192.png", "/icons/nsutnest-512.png"]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("nsut-nest-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/data/") || url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest") return;

  // Never cache navigations: they can contain account-specific or live data.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }));
    return;
  }

  // Cache only Next.js build assets and explicitly local icon assets.
  const isStaticAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
  if (!isStaticAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});
