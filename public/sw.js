/* HireStepX Service Worker — offline shell + asset caching */

// Bump this string on intentional SW changes to force clients to swap in the new version
// (Vercel doesn't substitute __BUILD_TS__, so we version manually.)
const SW_VERSION = "v3-2026-04-23";
const CACHE_NAME = `hirestepx-${SW_VERSION}`;

self.addEventListener("install", (event) => {
  // Precache nothing — we don't want to serve stale HTML whose cached
  // Content-Security-Policy headers omit newly-added hosts.
  event.waitUntil(caches.open(CACHE_NAME));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ─── Push Notification Click Handler ─── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/calendar";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

/* ─── Fetch Handling ─────────────────────────────────────────────
 * Strategy:
 *   - Never intercept non-GET, /api/, or cross-origin requests. Cross-origin
 *     SDKs (GrowthBook, analytics, etc.) are governed by CSP connect-src and
 *     an SW refetch only obscures CSP errors as "Failed to fetch" rejections.
 *   - Never intercept navigation/HTML: Content-Security-Policy lives on the
 *     document response headers, and caching HTML means stale CSP until the
 *     cache is explicitly cleared. Always go to network.
 *   - Cache static same-origin assets (JS/CSS/fonts/images) with a simple
 *     cache-first strategy. These are content-hashed by Next.js so staleness
 *     is a non-issue.
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only handle same-origin requests. Cross-origin goes straight through so
  // the browser's CSP + the target server's CORS win/lose cleanly.
  if (url.origin !== self.location.origin) return;

  // Don't touch API routes or navigation documents.
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" || request.destination === "document") return;

  // Only cache static asset extensions.
  const isAsset = /\.(?:js|mjs|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname);
  if (!isAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => { /* quota */ });
        }
        return response;
      }).catch(() => cached || Response.error());
    }),
  );
});
