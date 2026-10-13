// Service worker for Family Wealth Manager (PWA install + offline shell).
//
// - Hashed build files (/assets/*-<hash>.js|css…) never change: cache-first, so repeat
//   visits load instantly. The cache is trimmed so old deploys' files don't pile up.
// - Pages (navigations): network-first; offline falls back to the cached app shell.
// - The API and anything that isn't a same-origin GET is left alone.
// Bump VERSION to drop every cache on the next visit.

const VERSION = 'v2'
const SHELL_CACHE = `wealth-shell-${VERSION}`
const ASSET_CACHE = `wealth-assets-${VERSION}`
const MAX_ASSETS = 150
const SHELL = ['/', '/manifest.json', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(cache) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key)
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    trim(cache)
  }
  return response
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request)
    if (response.ok) (await caches.open(SHELL_CACHE)).put('/', response.clone())
    return response
  } catch {
    return (await caches.match('/')) ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
  }
})
