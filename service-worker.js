const CACHE_NAME = "attendo-cache-v60";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./css/styles.css",
  "./js/config.js",
  "./js/storage.js",
  "./js/auth.js",
  "./js/dashboard.js",
  "./js/workspace.js",
  "./js/reports.js",
  "./js/marks.js",
  "./js/certificates.js",
  "./js/qr-attendance.js",
  "./js/student-portal.js",
  "./js/notifications.js",
  "./js/app.js",
  "./jspdf.umd.min.js",
  "./jspdf.plugin.autotable.min.js",
  "./xlsx.full.min.js",
  "./qrcode.min.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategy for dynamic updates
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && event.request.method === "GET") {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});

