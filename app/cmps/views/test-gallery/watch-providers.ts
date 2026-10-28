// Where a film can be watched, from /api/watch (TMDB watch providers, which
// come from JustWatch). One request per film per visit; failures are not
// cached so reopening the sheet tries again.
//
// The first request lets the server pick the country from the visitor's IP;
// every later one names that country, so the CDN can share replies safely
// (a reply is only shared when its country is in the URL).

export type ProviderKind = 'stream' | 'free' | 'ads' | 'rent' | 'buy'

export type WatchProvider = {
  id: number
  name: string
  logoPath: string | null
  kind: ProviderKind
  url: string | null
}

export type WatchOptions = {
  region: string
  link: string | null
  providers: WatchProvider[]
}

export const KIND_LABELS: Record<ProviderKind, string> = {
  stream: 'Stream',
  free: 'Free',
  ads: 'Free with ads',
  rent: 'Rent',
  buy: 'Buy',
}

const KIND_ORDER: ProviderKind[] = ['stream', 'free', 'ads', 'rent', 'buy']

// Sections in the order a viewer cares about, with empty ones left out.
export const groupByKind = (providers: WatchProvider[]) =>
  KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    providers: providers.filter((provider) => provider.kind === kind),
  })).filter((group) => group.providers.length > 0)

export const tmdbIdOfMovie = (movieId: string) =>
  /^c(\d{1,9})$/.exec(movieId)?.[1] ?? null

export const providerLogoUrl = (logoPath: string) =>
  `https://image.tmdb.org/t/p/w92${logoPath}`

const cache = new Map<string, WatchOptions>()
let knownRegion: string | null = null

// Services with a confirmed listing in the visitor's country that can be
// watched on a subscription or for free, each with a link: what the card's
// Watch button shows as badges. Rent and buy are left to the sheet.
export const BADGE_KINDS: ReadonlySet<ProviderKind> = new Set([
  'stream',
  'free',
  'ads',
])
// One service under its many listings: "Paramount Plus Premium",
// "Paramount+ Amazon Channel" and "Paramount Plus Essential" are one badge.
export const providerBrand = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+(amazon|roku premium|apple tv) channel$/, '')
    .replace(/\s+(with ads|premium|essential|standard|basic)$/, '')
    .replace(/(\+|\s+plus)(\s.*)?$/, '')
    .trim()

// Every service confirmed for streaming or free, one per brand. Services are
// not exclusive: a film on Netflix and Prime Video lists both.
export const badgeBrandProviders = (options: WatchOptions) => {
  const brands = new Set<string>()
  return options.providers.filter((provider) => {
    if (
      !BADGE_KINDS.has(provider.kind) ||
      !provider.logoPath ||
      !(provider.url ?? options.link)
    )
      return false
    const brand = providerBrand(provider.name)
    if (brands.has(brand)) return false
    brands.add(brand)
    return true
  })
}

export const badgeProviders = (options: WatchOptions, limit = 3) =>
  badgeBrandProviders(options).slice(0, limit)

// The first few as badges, and how many more there are ("+N").
export const badgeSummary = (options: WatchOptions, limit = 3) => {
  const all = badgeBrandProviders(options)
  return { shown: all.slice(0, limit), more: Math.max(0, all.length - limit) }
}

// The options for a film if they have already been fetched this visit.
export const getCachedWatchOptions = (movieId: string) => {
  const tmdbId = tmdbIdOfMovie(movieId)
  return tmdbId ? (cache.get(tmdbId) ?? null) : null
}

const inFlight = new Map<string, Promise<WatchOptions>>()

export const loadWatchOptions = (
  movieId: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WatchOptions> => {
  const tmdbId = tmdbIdOfMovie(movieId)
  if (!tmdbId) return Promise.reject(new Error('not a catalogue film'))
  const hit = cache.get(tmdbId)
  if (hit) return Promise.resolve(hit)
  // A prefetch and the card asking for the same film share one request.
  const pending = inFlight.get(tmdbId)
  if (pending) return pending
  const query = new URLSearchParams({ id: tmdbId, title })
  if (knownRegion) query.set('region', knownRegion)
  const request = fetchImpl(`/api/watch?${query}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`watch ${response.status}`)
      const options = (await response.json()) as WatchOptions
      if (/^[A-Z]{2}$/.test(options.region)) knownRegion = options.region
      cache.set(tmdbId, options)
      return options
    })
    .finally(() => {
      inFlight.delete(tmdbId)
    })
  inFlight.set(tmdbId, request)
  return request
}

export const preloadLogo = (url: string) =>
  new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      image.decode().then(resolve, resolve)
    }
    image.onerror = reject
    image.src = url
  })

// Loads a film's watch listing and the logos of its badges ahead of its
// card, so the Watch button opens with them in place. Quiet by design: at
// most PREFETCH_CONCURRENCY films at once, nothing on data saver, and a
// failure is dropped (the card asks again when opened). The logos are a few
// dozen images shared by every film, so after the first films they are
// already cached and cost nothing.
const PREFETCH_CONCURRENCY = 2
const prefetchQueue: Array<() => Promise<unknown>> = []
const prefetched = new Set<string>()
let prefetchActive = 0

const saveDataOn = () =>
  typeof navigator !== 'undefined' &&
  (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    ?.saveData === true

const pumpPrefetch = () => {
  while (prefetchActive < PREFETCH_CONCURRENCY && prefetchQueue.length) {
    const job = prefetchQueue.shift()
    if (!job) return
    prefetchActive += 1
    job()
      .catch(() => {})
      .finally(() => {
        prefetchActive -= 1
        pumpPrefetch()
      })
  }
}

export const prefetchWatch = (movieId: string, title: string) => {
  if (saveDataOn() || !tmdbIdOfMovie(movieId) || prefetched.has(movieId)) return
  prefetched.add(movieId)
  prefetchQueue.push(() =>
    loadWatchOptions(movieId, title).then((options) =>
      Promise.all(
        badgeSummary(options).shown.map((provider) =>
          preloadLogo(providerLogoUrl(provider.logoPath ?? '')).catch(() => {}),
        ),
      ),
    ),
  )
  pumpPrefetch()
}

export const clearWatchCache = () => {
  cache.clear()
  inFlight.clear()
  prefetched.clear()
  prefetchQueue.length = 0
  knownRegion = null
}
