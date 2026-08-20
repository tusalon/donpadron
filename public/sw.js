const CACHE_NAME = "don-padron-v6";
const APP_ROOT = "/donpadron/";
const CORE_ASSETS = [
  APP_ROOT,
  `${APP_ROOT}manifest.webmanifest`,
  `${APP_ROOT}admin.webmanifest`,
  `${APP_ROOT}icon-192.png`,
];

// cache.addAll aborta entero si falla un solo archivo, y con eso el service
// worker no se instala y la app deja de ser instalable. Se cachea uno a uno
// para que un fallo de red puntual no tumbe la instalacion completa.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset))),
    ),
  );
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
      icon: `${APP_ROOT}icon-192.png`,
      badge: `${APP_ROOT}icon-192.png`,
      vibrate: [200, 100, 200],
      // Un pedido se queda en pantalla hasta que el negocio lo atiende.
      requireInteraction: true,
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

  // Los archivos de /assets/ llevan un hash del contenido en el nombre: si esta
  // en cache es el correcto, asi que se sirve sin esperar a la red.
  if (requestUrl.pathname.startsWith(`${APP_ROOT}assets/`)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

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
