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

export const loadWatchOptions = async (
  movieId: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WatchOptions> => {
  const tmdbId = tmdbIdOfMovie(movieId)
  if (!tmdbId) throw new Error('not a catalogue film')
  const hit = cache.get(tmdbId)
  if (hit) return hit
  const query = new URLSearchParams({ id: tmdbId, title })
  if (knownRegion) query.set('region', knownRegion)
  const response = await fetchImpl(`/api/watch?${query}`)
  if (!response.ok) throw new Error(`watch ${response.status}`)
  const options = (await response.json()) as WatchOptions
  if (/^[A-Z]{2}$/.test(options.region)) knownRegion = options.region
  cache.set(tmdbId, options)
  return options
}

export const clearWatchCache = () => {
  cache.clear()
  knownRegion = null
}
