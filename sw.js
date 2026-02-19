const CACHE_NAME = "hmsi-pwa-v-" + Date.now();

const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png", // PASTIKAN file ini ADA di root
  "/icon-512.png", // PASTIKAN file ini ADA
  "https://cdn.tailwindcss.com",
  "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap",
  // gambar welcome juga bisa dicache jika mau offline
  "https://i.pinimg.com/736x/04/8a/ee/048aee7f51293031376ea318a00ddd3f.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Caching core assets...");
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error("[SW] Install gagal:", err))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log("[SW] Hapus cache lama:", cache);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Jangan cache response dari Google Apps Script (dynamic)
        if (event.request.url.includes("script.google.com")) {
          return response;
        }
        const resClone = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => {
        return caches
          .match(event.request)
          .then(
            (res) =>
              res ||
              new Response("Offline - Konten tidak tersedia", { status: 503 })
          );
      })
  );
});
