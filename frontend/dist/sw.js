// Network-first service worker for Family Wealth Manager.
// Always tries the network first so freshly deployed JS/CSS is served;
// falls back to cache only when offline. API calls are never cached.

const CACHE = 'wealth-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.json', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only handle GET navigations / static assets. Never touch the API or non-GET.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache a copy of successful same-origin responses for offline fallback
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
        }
        return response
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/index.html'))
      )
  )
})
