/**
 * ============================================================
 *  DEVICE HMSI - Service Worker v1.2.0
 *  Strategy:
 *   - HTML        → Network-First (selalu coba network dulu)
 *   - Assets/CSS  → Cache-First (cepat, dari cache)
 *   - API / GAS   → Network-Only (tidak di-cache, selalu fresh)
 *   - Offline     → Fallback ke offline.html
 * ============================================================
 */

const APP_VERSION = "v1.2.0";
const CACHE_STATIC = `hmsi-static-${APP_VERSION}`;
const CACHE_DYNAMIC = `hmsi-dynamic-${APP_VERSION}`;
const CACHE_OFFLINE = `hmsi-offline-${APP_VERSION}`;

/** Aset yang di-precache saat install */
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./offline.html",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./icons/icon-maskable-192x192.png",
  "./icons/icon-maskable-512x512.png"
];

/** URL yang tidak boleh di-cache (Google Apps Script, dll) */
const NEVER_CACHE_PATTERNS = [
  /script\.google\.com/,
  /googleapis\.com/,
  /chrome-extension:\/\//,
  /accounts\.google\.com/
];

/** URL yang selalu pakai network-first */
const NETWORK_FIRST_PATTERNS = [/\.html($|\?)/, /\/$/];

// ── Helper: apakah URL cocok pattern? ─────────────────────────
function matchesAny(url, patterns) {
  return patterns.some((p) => p.test(url));
}

// ── Helper: buat Response 'offline' ───────────────────────────
function offlineResponse(request) {
  const isNavigate = request.mode === "navigate";
  if (isNavigate) {
    return caches.match("./offline.html");
  }
  return new Response("Offline", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain" }
  });
}

// ═══════════════════════════════════════════════════════════════
//  INSTALL — Precache static assets
// ═══════════════════════════════════════════════════════════════
self.addEventListener("install", (event) => {
  console.log(`[SW ${APP_VERSION}] 📦 Installing...`);

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      try {
        await cache.addAll(STATIC_ASSETS);
        console.log(`[SW ${APP_VERSION}] ✅ Static assets cached.`);
      } catch (err) {
        console.error(`[SW ${APP_VERSION}] ❌ Precache failed:`, err);
        // Cache satu per satu agar tidak gagal total
        for (const url of STATIC_ASSETS) {
          try {
            await cache.add(url);
          } catch (e) {
            console.warn(`[SW ${APP_VERSION}] ⚠️ Skipped:`, url, e.message);
          }
        }
      }
      // Skip waiting → langsung aktif tanpa harus tunggu tab ditutup
      await self.skipWaiting();
      console.log(`[SW ${APP_VERSION}] ⚡ skipWaiting called.`);
    })()
  );
});

// ═══════════════════════════════════════════════════════════════
//  ACTIVATE — Bersihkan cache lama
// ═══════════════════════════════════════════════════════════════
self.addEventListener("activate", (event) => {
  console.log(`[SW ${APP_VERSION}] 🟢 Activating...`);

  const CURRENT_CACHES = [CACHE_STATIC, CACHE_DYNAMIC, CACHE_OFFLINE];

  event.waitUntil(
    (async () => {
      // Hapus semua cache versi lama
      const cacheNames = await caches.keys();
      const deleteOps = cacheNames
        .filter(
          (name) => !CURRENT_CACHES.includes(name) && name.startsWith("hmsi-")
        )
        .map((name) => {
          console.log(`[SW ${APP_VERSION}] 🗑️ Deleting old cache:`, name);
          return caches.delete(name);
        });
      await Promise.all(deleteOps);

      // Ambil alih semua client yang terbuka tanpa harus refresh
      await self.clients.claim();
      console.log(`[SW ${APP_VERSION}] ✅ Activated. Clients claimed.`);

      // Broadcast ke semua tab bahwa SW sudah update
      const allClients = await self.clients.matchAll({ type: "window" });
      allClients.forEach((client) => {
        client.postMessage({
          type: "SW_ACTIVATED",
          version: APP_VERSION
        });
      });
    })()
  );
});

// ═══════════════════════════════════════════════════════════════
//  FETCH — Request Interceptor
// ═══════════════════════════════════════════════════════════════
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // Abaikan non-GET dan non-http(s)
  if (request.method !== "GET") return;
  if (!url.startsWith("http")) return;

  // 1️⃣ NEVER CACHE — Google Apps Script & external APIs
  if (matchesAny(url, NEVER_CACHE_PATTERNS)) {
    event.respondWith(fetch(request).catch(() => offlineResponse(request)));
    return;
  }

  // 2️⃣ NETWORK-FIRST — HTML pages (agar selalu update)
  if (matchesAny(url, NETWORK_FIRST_PATTERNS)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 3️⃣ CACHE-FIRST — Assets (JS, CSS, Images, Fonts)
  event.respondWith(cacheFirst(request));
});

// ── Strategy: Network-First ────────────────────────────────────
async function networkFirst(request) {
  const cache = await caches.open(CACHE_DYNAMIC);
  try {
    const networkResponse = await fetch(request);
    // Clone karena response hanya bisa dibaca sekali
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.log(`[SW] 📴 Network failed, checking cache for:`, request.url);
    const cached = await cache.match(request);
    if (cached) return cached;
    const staticCached = await caches.match(request);
    if (staticCached) return staticCached;
    return offlineResponse(request);
  }
}

// ── Strategy: Cache-First ──────────────────────────────────────
async function cacheFirst(request) {
  const staticCached = await caches.match(request);
  if (staticCached) {
    // Perbarui cache di background (stale-while-revalidate)
    refreshCache(request);
    return staticCached;
  }

  const cache = await caches.open(CACHE_DYNAMIC);
  const dynamicCached = await cache.match(request);
  if (dynamicCached) {
    refreshCache(request);
    return dynamicCached;
  }

  // Tidak ada di cache, fetch dari network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.log(`[SW] 📴 Offline and no cache for:`, request.url);
    return offlineResponse(request);
  }
}

// ── Background revalidation (Stale-While-Revalidate) ──────────
async function refreshCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_DYNAMIC);
      await cache.put(request, response);
    }
  } catch (_) {
    // Gagal update, tidak apa-apa (sudah ada di cache)
  }
}

// ═══════════════════════════════════════════════════════════════
//  MESSAGE — Komunikasi dengan main thread
// ═══════════════════════════════════════════════════════════════
self.addEventListener("message", (event) => {
  const { data } = event;
  console.log(`[SW ${APP_VERSION}] 📨 Message received:`, data);

  if (data && data.type === "SKIP_WAITING") {
    console.log(`[SW ${APP_VERSION}] ⚡ Force activating via skipWaiting...`);
    self.skipWaiting();
  }

  if (data && data.type === "CLEAR_CACHE") {
    caches.keys().then((names) => {
      Promise.all(names.map((name) => caches.delete(name))).then(() => {
        console.log(`[SW ${APP_VERSION}] 🗑️ All caches cleared.`);
        if (event.source) {
          event.source.postMessage({ type: "CACHE_CLEARED" });
        }
      });
    });
  }

  if (data && data.type === "GET_VERSION") {
    if (event.source) {
      event.source.postMessage({ type: "SW_VERSION", version: APP_VERSION });
    }
  }
});
