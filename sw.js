/**
 * HMSI Service Worker - Auto Update Version
 */
const CACHE_NAME = "hmsi-pwa-v-" + Date.now();

const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "https://cdn.tailwindcss.com",
  "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap"
  "https://script.google.com/macros/s/AKfycbwund0gPq9RHMugPQcVPcRG-xUaBZ6-m95-CQCfF_qKjF4f_nzcGFcfw_Omji_CBLhw/exec"
  "https://script.google.com/macros/s/AKfycbwTmLdlKnUOINitKwTUUWwTzMOai4-Uk2ZqvZMV86_O98DgNXT8tFih4HFoKXCoJJDrow/exec"
  "https://script.google.com/macros/s/AKfycbyPGjbGPzM_T6RxrG4FvKogMA1btoKMtgFXo_kpVDomY39D0InB3n7htYx_Nx7p5QXW/exec"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) return caches.delete(cache);
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
        const resClone = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
