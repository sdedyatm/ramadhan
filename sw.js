/**
 * HMSI Service Worker
 * Fitur: Auto-update cache, Offline Support, & Icon Caching
 */

const CACHE_NAME = "hmsi-cache-v3";

// Daftar aset lokal yang wajib ada untuk mode offline
const PRE_CACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png", // Ikon di folder root
  "/icon-512.png", // Ikon di folder root
  "https://cdn.tailwindcss.com"
];

// Install Event: Mengambil aset dasar
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRE_CACHE_ASSETS);
      })
      .then(() => {
        return self.skipWaiting(); // Memaksa SW baru aktif segera
      })
  );
});

// Activate Event: Membersihkan cache lama jika ada
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
    ])
  );
});

/**
 * Fungsi Utama: Stale-While-Revalidate
 * Fungsi ini memungkinkan aplikasi mengambil data dari cache (instan),
 * tapi tetap melakukan fetch ke jaringan untuk memperbarui cache di latar belakang
 * jika ada perubahan file tanpa perlu ganti versi CACHE_NAME.
 */
self.addEventListener("fetch", (event) => {
  // Abaikan request selain GET (seperti POST untuk formulir)
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchedResponse = fetch(event.request)
          .then((networkResponse) => {
            // Update cache dengan salinan terbaru dari jaringan
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            // Jika jaringan mati total, biarkan tetap menggunakan cache yang ada
          });

        // Berikan respon dari cache jika ada, jika tidak tunggu dari jaringan
        return cachedResponse || fetchedResponse;
      });
    })
  );
});
