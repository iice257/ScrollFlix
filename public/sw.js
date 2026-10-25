// ScrollFlix service worker. Keeps poster images and catalogue files so a
// repeat visit (or a flaky connection) does not refetch them. Anything else
// goes straight to the network. Kill switch: see app/sw-register.ts.
const TMDB_CACHE = 'tmdb-img-v1'
const CATALOG_CACHE = 'catalog-v2'
const CURRENT_CACHES = [TMDB_CACHE, CATALOG_CACHE]
const TMDB_MAX_ENTRIES = 4000
const TMDB_TRIM = 400
const MANIFEST_TIMEOUT_MS = 3000

const classify = (href, origin) => {
  let url
  try {
    url = new URL(href, origin)
  } catch {
    return 'other'
  }
  if (url.hostname === 'image.tmdb.org') return 'tmdb-image'
  if (url.origin === origin && url.pathname.startsWith('/json/catalog/')) {
    return url.pathname === '/json/catalog/manifest.json'
      ? 'catalog-manifest'
      : 'catalog-hashed'
  }
  return 'other'
}

const strategyFor = (kind) =>
  kind === 'tmdb-image' || kind === 'catalog-hashed'
    ? 'cache-first'
    : kind === 'catalog-manifest'
      ? 'network-first'
      : 'passthrough'

const trim = async (cache) => {
  const keys = await cache.keys()
  if (keys.length <= TMDB_MAX_ENTRIES) return
  await Promise.all(keys.slice(0, TMDB_TRIM).map((key) => cache.delete(key)))
}

const cacheFirst = async (request, cacheName, limit) => {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  // Only real, readable responses: an opaque (no-cors) one cannot be reused
  // by the WebGL loader, and an error must never be pinned.
  if (response.ok && response.type !== 'opaque') {
    await cache.put(request, response.clone())
    if (limit) void trim(cache)
  }
  return response
}

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName)
  let failed = null
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), MANIFEST_TIMEOUT_MS),
      ),
    ])
    if (response.ok) {
      await cache.put(request, response.clone())
      return response
    }
    // An error page must not shadow a good cached manifest.
    failed = response
  } catch (error) {
    const hit = await cache.match(request)
    if (hit) return hit
    throw error
  }
  const hit = await cache.match(request)
  return hit ?? failed
}

// Reachable by tests that evaluate this file with a stub `self`.
if (typeof self !== 'undefined')
  self.__swRoutes = { classify, strategyFor, cacheFirst, networkFirst, trim }

if (typeof self !== 'undefined' && self.addEventListener) {
  self.addEventListener('install', () => {
    self.skipWaiting()
  })

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys()
        await Promise.all(
          names
            .filter((name) => !CURRENT_CACHES.includes(name))
            .map((name) => caches.delete(name)),
        )
        await self.clients.claim()
      })(),
    )
  })

  self.addEventListener('fetch', (event) => {
    const { request } = event
    if (request.method !== 'GET') return
    const kind = classify(request.url, self.location.origin)
    const strategy = strategyFor(kind)
    if (strategy === 'passthrough') return
    if (strategy === 'network-first') {
      event.respondWith(networkFirst(request, CATALOG_CACHE))
      return
    }
    event.respondWith(
      kind === 'tmdb-image'
        ? cacheFirst(request, TMDB_CACHE, true)
        : cacheFirst(request, CATALOG_CACHE, false),
    )
  })
}
