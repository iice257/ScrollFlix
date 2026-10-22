// On-device poster cache. Fetched TMDB posters are kept in Cache Storage so a
// second visit starts populated instead of from scratch. Only public poster
// URLs are stored. Every access is wrapped: private mode, a full quota or a
// missing API simply means "no cache" and the caller falls back to the network.

export const POSTER_CACHE_NAME = 'scrollflix-posters-v1'
const INDEX_KEY = 'scrollflix-poster-index-v1'
const STARTER_KEY = 'scrollflix-poster-starter-v1'
const POSTER_HOST_PREFIX = 'https://image.tmdb.org/t/p/'

// Caps. A w154 poster is roughly 8 KB, so the byte cap is the looser of the two
// in practice; both are hard limits.
export const POSTER_CACHE_MAX_ENTRIES = 1200
export const POSTER_CACHE_MAX_BYTES = 32 * 1024 * 1024
// Evicting stops this far under the cap, so a full cache is trimmed in one
// batch instead of on every new poster.
const EVICT_TO_SHARE = 0.9
// Skip persisting when the browser reports less room than this.
const MIN_FREE_BYTES = 64 * 1024 * 1024

// The starter set kept on every visit: the first alphabetical films (what the
// index shows first) and some random ones (what the globe may show first).
export const STARTER_ALPHA_COUNT = 80
export const STARTER_RANDOM_COUNT = 40
// Blob URLs of the starter set kept ready for instant use. Fixed, small.
const WARM_URL_LIMIT = 320

export type PosterIndexEntry = { key: string; size: number; pinned: boolean }

export const isCacheablePosterUrl = (url: string) =>
  url.startsWith(POSTER_HOST_PREFIX)

// Which keys to drop, oldest first, so the cache ends up under both caps.
// Pinned entries (the starter set) are never dropped. Does nothing until a cap
// is exceeded, then trims to EVICT_TO_SHARE of it.
export const planEviction = (
  entries: PosterIndexEntry[],
  maxEntries = POSTER_CACHE_MAX_ENTRIES,
  maxBytes = POSTER_CACHE_MAX_BYTES,
): string[] => {
  let count = entries.length
  let bytes = entries.reduce((sum, entry) => sum + entry.size, 0)
  if (count <= maxEntries && bytes <= maxBytes) return []
  const targetCount = Math.floor(maxEntries * EVICT_TO_SHARE)
  const targetBytes = Math.floor(maxBytes * EVICT_TO_SHARE)
  const drop: string[] = []
  for (const entry of entries) {
    if (count <= targetCount && bytes <= targetBytes) break
    if (entry.pinned) continue
    drop.push(entry.key)
    count -= 1
    bytes -= entry.size
  }
  return drop
}

// Recency order lives in a Map (insertion order = oldest first).
export class PosterIndex {
  private readonly entries = new Map<string, PosterIndexEntry>()

  get size() {
    return this.entries.size
  }

  has(key: string) {
    return this.entries.has(key)
  }

  // Marks a hit as most recently used.
  touch(key: string) {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    this.entries.set(key, entry)
  }

  add(key: string, size: number, pinned = false) {
    const previous = this.entries.get(key)
    this.entries.delete(key)
    this.entries.set(key, {
      key,
      size,
      pinned: pinned || Boolean(previous?.pinned),
    })
  }

  pin(key: string) {
    const entry = this.entries.get(key)
    if (entry) entry.pinned = true
  }

  remove(key: string) {
    this.entries.delete(key)
  }

  list() {
    return [...this.entries.values()]
  }

  toJSON(): [string, number, 0 | 1][] {
    return this.list().map((entry) => [
      entry.key,
      entry.size,
      entry.pinned ? 1 : 0,
    ])
  }

  static fromJSON(raw: unknown) {
    const index = new PosterIndex()
    if (!Array.isArray(raw)) return index
    for (const row of raw) {
      if (
        Array.isArray(row) &&
        typeof row[0] === 'string' &&
        typeof row[1] === 'number'
      ) {
        index.add(row[0], row[1], row[2] === 1)
      }
    }
    return index
  }
}

// Picks `count` ids at random from `pool`, keeping any in `keep` that are
// still in the pool, so a device's random set stays the same visit to visit.
export const chooseRandomIds = (
  pool: string[],
  count: number,
  keep: string[],
  random: () => number = Math.random,
) => {
  const available = new Set(pool)
  const chosen = keep.filter((id) => available.has(id)).slice(0, count)
  const taken = new Set(chosen)
  const rest = pool.filter((id) => !taken.has(id))
  while (chosen.length < count && rest.length) {
    const at = Math.floor(random() * rest.length)
    chosen.push(rest[at])
    rest[at] = rest[rest.length - 1]
    rest.pop()
  }
  return chosen
}

let cachePromise: Promise<Cache | null> | null = null
const openCache = () => {
  cachePromise ??= (async () => {
    try {
      if (typeof caches === 'undefined') return null
      return await caches.open(POSTER_CACHE_NAME)
    } catch {
      return null
    }
  })()
  return cachePromise
}

let index: PosterIndex | null = null
const getIndex = () => {
  if (index) return index
  try {
    const raw = window.localStorage.getItem(INDEX_KEY)
    index = PosterIndex.fromJSON(raw ? JSON.parse(raw) : null)
  } catch {
    index = new PosterIndex()
  }
  return index
}

let persistTimer = 0
const schedulePersist = () => {
  if (persistTimer) return
  persistTimer = window.setTimeout(() => {
    persistTimer = 0
    try {
      window.localStorage.setItem(INDEX_KEY, JSON.stringify(getIndex()))
    } catch {
      // Storage may be full or blocked; the cache still works this session.
    }
  }, 2000)
}

let roomPromise: Promise<boolean> | null = null
// Whether the browser has space to spare; checked once per page.
const hasRoom = () => {
  roomPromise ??= (async () => {
    try {
      const estimate = await navigator.storage?.estimate?.()
      if (!estimate?.quota) return true
      return estimate.quota - (estimate.usage ?? 0) > MIN_FREE_BYTES
    } catch {
      return true
    }
  })()
  return roomPromise
}

const trim = async (cache: Cache) => {
  const dropped = planEviction(getIndex().list())
  for (const key of dropped) {
    getIndex().remove(key)
    try {
      await cache.delete(key)
    } catch {
      // Already gone.
    }
  }
  if (dropped.length) schedulePersist()
}

const remember = async (
  cache: Cache,
  url: string,
  response: Response,
  blobSize: number,
  pinned: boolean,
) => {
  try {
    if (!(await hasRoom())) return
    await cache.put(url, response)
    getIndex().add(url, blobSize, pinned)
    schedulePersist()
    await trim(cache)
  } catch {
    // Quota errors are harmless: the poster just isn't kept.
  }
}

export type PosterBlobOptions = {
  // Keep this poster through eviction (the starter set).
  pin?: boolean
  signal?: AbortSignal
}

// A poster's bytes: the device cache first, then the network (kept for next
// time). Returns null when neither works; callers then load the URL directly.
export const loadPosterBlob = async (
  url: string,
  { pin = false, signal }: PosterBlobOptions = {},
): Promise<Blob | null> => {
  if (!isCacheablePosterUrl(url)) return null
  const cache = await openCache()
  try {
    if (cache) {
      const hit = await cache.match(url)
      if (hit) {
        const blob = await hit.blob()
        if (blob.size > 0) {
          const entries = getIndex()
          if (entries.has(url)) {
            entries.touch(url)
            if (pin) entries.pin(url)
          } else {
            entries.add(url, blob.size, pin)
          }
          schedulePersist()
          return blob
        }
      }
    }
  } catch {
    // Fall through to the network.
  }
  // CORS is requested explicitly. A copy cached from a plain (no-cors) request
  // has no CORS headers and fails here, so a second attempt bypasses the HTTP
  // cache instead of leaving that poster blank.
  for (const mode of ['default', 'reload'] as const) {
    try {
      const response = await fetch(url, { mode: 'cors', cache: mode, signal })
      if (!response.ok) continue
      const blob = await response.clone().blob()
      if (!blob.size) continue
      if (cache) void remember(cache, url, response, blob.size, pin)
      return blob
    } catch {
      if (signal?.aborted) return null
    }
  }
  return null
}

// Blob URLs of the starter set, ready to use without touching the network.
const warmUrls = new Map<string, string>()
export const getWarmPosterUrl = (url: string) => warmUrls.get(url)

const idle = (run: () => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 })
  } else {
    window.setTimeout(run, 400)
  }
}

// Fetches (or reads from the device cache) the given posters a few at a time,
// pins them and keeps a blob URL for each. Runs when the browser is idle.
export const warmPosters = (urls: string[], onDone?: () => void) => {
  const queue = urls.filter(
    (url) => isCacheablePosterUrl(url) && !warmUrls.has(url),
  )
  if (!queue.length) {
    onDone?.()
    return
  }
  let cursor = 0
  let running = 0
  const pump = () => {
    while (running < 3 && cursor < queue.length) {
      const url = queue[cursor]
      cursor += 1
      running += 1
      void loadPosterBlob(url, { pin: true })
        .then((blob) => {
          if (blob && warmUrls.size < WARM_URL_LIMIT) {
            warmUrls.set(url, URL.createObjectURL(blob))
          }
        })
        .finally(() => {
          running -= 1
          if (cursor < queue.length) idle(pump)
          else if (running === 0) onDone?.()
        })
    }
  }
  idle(pump)
}

type StarterState = { random: string[] }
const readStarter = (): StarterState => {
  try {
    const raw = window.localStorage.getItem(STARTER_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && Array.isArray(parsed.random)) {
      return {
        random: parsed.random.filter((id: unknown) => typeof id === 'string'),
      }
    }
  } catch {
    // Treated as a first visit.
  }
  return { random: [] }
}

export type StarterFilm = { id: string; thumbUrl: string; listUrl: string }

// Keeps a small starter set on the device: the first films of the alphabetical
// index (list thumbnails) and a random set chosen once per device (globe and
// list thumbnails). `alphabetical` must already be in index order.
export const seedStarterSet = (
  alphabetical: StarterFilm[],
  pool: StarterFilm[],
) => {
  if (!alphabetical.length) return
  const starter = readStarter()
  const randomIds = chooseRandomIds(
    pool.map((film) => film.id),
    STARTER_RANDOM_COUNT,
    starter.random,
  )
  try {
    window.localStorage.setItem(
      STARTER_KEY,
      JSON.stringify({ random: randomIds } satisfies StarterState),
    )
  } catch {
    // Chosen again next visit.
  }
  const byId = new Map(pool.map((film) => [film.id, film]))
  const urls = alphabetical
    .slice(0, STARTER_ALPHA_COUNT)
    .map((film) => film.listUrl)
  for (const id of randomIds) {
    const film = byId.get(id)
    if (film) urls.push(film.thumbUrl, film.listUrl)
  }
  warmPosters(urls)
}
