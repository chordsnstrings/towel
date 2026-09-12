const shellPaths = new Set(SHELL);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  // Activate after the previous app windows close, so an update cannot
  // interrupt a checkout or replace the scanner halfway through a handover.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("move-towel-") && name !== CACHE_NAME)
          await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Member records, sessions, imports, and transactions always go to the server.
  // Never queue towel movements or cache an API response, including errors.
  if (
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/.netlify/")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.open(CACHE_NAME)).match("/index.html"),
      ),
    );
    return;
  }
  if (shellPaths.has(url.pathname)) {
    event.respondWith(
      (async () =>
        (await (await caches.open(CACHE_NAME)).match(url.pathname)) ||
        fetch(request))(),
    );
  }
});
