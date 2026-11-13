const CACHE_NAME = "ai-versus-offline-v2";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("ai-versus-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, {ignoreSearch: true});
    const sameOrigin = url.origin === self.location.origin;
    const isImage = request.destination === "image";
    const isFontOrIcon = /fonts.googleapis.com|fonts.gstatic.com|unpkg.com/.test(url.hostname);

    if (request.mode === "navigate") {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) await cache.put("./index.html", fresh.clone());
        return fresh;
      } catch {
        return cached || await cache.match("./index.html");
      }
    }

    // Images are cached after their first successful online load.
    // This includes cross-origin Unsplash images, which the previous worker missed.
    if (cached && (sameOrigin || isImage || isFontOrIcon)) return cached;

    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === "opaque") && (sameOrigin || isImage || isFontOrIcon)) {
        await cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      if (cached) return cached;
      if (isImage) return new Response("", {status: 504, statusText: "Offline image not cached yet"});
      throw new Error("Offline resource not cached yet.");
    }
  })());
});
