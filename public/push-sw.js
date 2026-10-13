/* Avisos de caducidad: lo importa el service worker generado por vite-plugin-pwa. */
self.addEventListener('push', (event) => {
  let data = { title: 'Planificador', body: 'Tienes un aviso nuevo.', url: self.registration.scope }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    /* aviso sin datos: se muestra el texto genérico */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'pwa-192.png',
      badge: 'pwa-192.png',
      data: { url: data.url },
      tag: 'caducidad',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
