/**
 * PyroScope 33 — Service Worker
 *
 * ⚠️ AVERTISSEMENT LÉGAL (§6) :
 * Les notifications push via ce service worker sont informatives uniquement.
 * **Ne jamais utilisé comme canal d'alerte de sécurité.**
 * En cas d'incendie : 18 / 112.
 *
 * Cache strategy: Cache-First for static assets, Network-First for API data.
 * Offline fallback: displays "donnée indisponible" banner instead of stale data.
 */

const CACHE_NAME = "pyroscope33-v1";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/auth",
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
];

// ── Install: pre-cache static assets ────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ── Fetch: cache-first for static, network-first for API ────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: network-first with fallback to stale cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Map tiles: cache-first (tiles change daily, not per-visit)
  if (url.pathname.includes("/tiles/")) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/) ||
    url.pathname.startsWith("/assets/")
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // HTML pages: network-first
  if (url.pathname.match(/\.html$/) || url.pathname === "/") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response(
      JSON.stringify({ status: "offline", error: "donnée indisponible" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) {
      // Return stale data but mark it as degraded
      const cloned = cached.clone();
      const headers = new Headers(cloned.headers);
      headers.set("X-PyroScope-Data-Age", "stale");
      headers.set("X-PyroScope-Offline", "true");
      return new Response(cloned.body, {
        status: cloned.status,
        statusText: cloned.statusText,
        headers,
      });
    }
    return new Response(
      JSON.stringify({ status: "offline", error: "donnée indisponible" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}

// ── Push notifications (informatives uniquement) ────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    // Never show alerts for crisis-level events — that would be safety-critical
    if (data.crisis) {
      console.warn("[SW] Crisis notifications blocked: use official channels (18/112).");
      return;
    }

    const options = {
      title: data.title || "PyroScope 33",
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "pyroscope-notification",
      data: { url: data.url || "/dashboard", timestamp: Date.now() },
      vibrate: [200, 100, 200],
      requireInteraction: false, // Never demand interaction for non-safety alerts
      silent: false,
    };

    event.waitUntil(self.registration.showNotification(options.title, options));
  } catch (err) {
    console.error("[SW] Push parse error:", err);
  }
});

// ── Notification click: open dashboard ──────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window or open new one
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
