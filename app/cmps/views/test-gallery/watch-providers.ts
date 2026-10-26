// Where a film can be watched, from /api/watch (TMDB watch providers, which
// come from JustWatch). One request per film per visit; failures are not
// cached so reopening the sheet tries again.

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
  const response = await fetchImpl(`/api/watch?${query}`)
  if (!response.ok) throw new Error(`watch ${response.status}`)
  const options = (await response.json()) as WatchOptions
  cache.set(tmdbId, options)
  return options
}

export const clearWatchCache = () => cache.clear()
