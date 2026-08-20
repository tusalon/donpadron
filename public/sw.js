const CACHE_NAME = "don-padron-v4";
const APP_ROOT = "/donpadron/";
const CORE_ASSETS = [
  APP_ROOT,
  `${APP_ROOT}manifest.webmanifest`,
  `${APP_ROOT}admin.webmanifest`,
  `${APP_ROOT}don-padron-icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  let data = { title: "Don Padrón", body: "Tienes una notificación nueva." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Ignora payloads que no sean JSON.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: `${APP_ROOT}don-padron-icon.png`,
      badge: `${APP_ROOT}don-padron-icon.png`,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const adminUrl = `${self.location.origin}${APP_ROOT}#/admin`;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(adminUrl));
      if (existing) return existing.focus();
      return self.clients.openWindow(adminUrl);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(APP_ROOT)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match(APP_ROOT))),
  );
});
