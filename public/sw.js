// Service worker for web push notifications.
// Plain JS, not bundled by Next.js -- served as a static file at /sw.js.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Family Health Tracker", body: "", url: "/" };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      // Fall back to plain text if the payload isn't JSON.
      payload.body = event.data.text();
    }
  }

  const title = payload.title || "Family Health Tracker";
  const options = {
    body: payload.body || "",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname === url && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
