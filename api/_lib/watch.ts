// Where a film can be watched legally, per country. The data is TMDB's watch
// providers, which TMDB gets from JustWatch (attribution is a condition of
// using it, so the reply carries it). Never throws: any failure is a null and
// the caller answers with an empty list.

export type ProviderKind = 'stream' | 'free' | 'ads' | 'rent' | 'buy'

export type Provider = {
  id: number
  name: string
  logoPath: string | null
  kind: ProviderKind
  // Straight to the service's own search for the film when we know how,
  // otherwise null and the client falls back to `link`.
  url: string | null
}

export type WatchReply = {
  region: string
  // The JustWatch page for this film and country; always safe to open.
  link: string | null
  providers: Provider[]
}

type TmdbProvider = {
  provider_id?: number
  provider_name?: string
  logo_path?: string | null
  display_priority?: number
}

type TmdbRegion = {
  link?: string
  flatrate?: TmdbProvider[]
  free?: TmdbProvider[]
  ads?: TmdbProvider[]
  rent?: TmdbProvider[]
  buy?: TmdbProvider[]
}

export type TmdbWatchBody = { results?: Record<string, TmdbRegion> }

const KINDS: [keyof TmdbRegion, ProviderKind][] = [
  ['flatrate', 'stream'],
  ['free', 'free'],
  ['ads', 'ads'],
  ['rent', 'rent'],
  ['buy', 'buy'],
]

// Search URLs for the services people use most, keyed by TMDB provider id.
// A search is the best a public link can do: no service publishes a stable
// per-film deep link without a partner agreement.
const q = (title: string) => encodeURIComponent(title)
const SEARCH: Record<number, (title: string) => string> = {
  8: (t) => `https://www.netflix.com/search?q=${q(t)}`,
  9: (t) => `https://www.amazon.com/s?k=${q(t)}&i=instant-video`,
  119: (t) => `https://www.amazon.com/s?k=${q(t)}&i=instant-video`,
  337: (t) => `https://www.disneyplus.com/search?q=${q(t)}`,
  384: (t) => `https://play.max.com/search?q=${q(t)}`,
  1899: (t) => `https://play.max.com/search?q=${q(t)}`,
  15: (t) => `https://www.hulu.com/search?q=${q(t)}`,
  350: (t) => `https://tv.apple.com/search?term=${q(t)}`,
  2: (t) => `https://tv.apple.com/search?term=${q(t)}`,
  386: (t) => `https://www.peacocktv.com/search?q=${q(t)}`,
  531: (t) => `https://www.paramountplus.com/search/?q=${q(t)}`,
  73: (t) => `https://tubitv.com/search/${q(t)}`,
  300: (t) => `https://pluto.tv/search/details?query=${q(t)}`,
  538: (t) => `https://watch.plex.tv/search?q=${q(t)}`,
  192: (t) =>
    `https://www.youtube.com/results?search_query=${q(`${t} full movie`)}`,
  3: (t) => `https://play.google.com/store/search?q=${q(t)}&c=movies`,
  10: (t) => `https://www.amazon.com/s?k=${q(t)}&i=instant-video`,
  190: (t) => `https://www.curiositystream.com/search?q=${q(t)}`,
  258: (t) => `https://www.criterionchannel.com/search?q=${q(t)}`,
  11: (t) => `https://mubi.com/en/search?query=${q(t)}`,
  283: (t) => `https://www.crunchyroll.com/search?q=${q(t)}`,
  99: (t) => `https://www.shudder.com/search?q=${q(t)}`,
  1796: (t) => `https://www.netflix.com/search?q=${q(t)}`,
}

export const providerUrl = (id: number, title: string): string | null => {
  const make = SEARCH[id]
  return make && title ? make(title) : null
}

const isHttps = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('https://')

// Turns TMDB's body into one flat, ordered list for a country. A service that
// appears under several kinds (stream and rent) is listed once, at its best
// kind, since "stream" beats "rent" beats "buy" for the viewer.
export const parseWatch = (
  body: TmdbWatchBody | null | undefined,
  region: string,
  title: string,
): WatchReply => {
  const entry = body?.results?.[region]
  if (!entry) return { region, link: null, providers: [] }
  const seen = new Set<number>()
  const providers: Provider[] = []
  for (const [key, kind] of KINDS) {
    const list = entry[key]
    if (!Array.isArray(list)) continue
    const ordered = [...list].sort(
      (a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999),
    )
    for (const raw of ordered) {
      if (typeof raw.provider_id !== 'number' || !raw.provider_name) continue
      if (seen.has(raw.provider_id)) continue
      seen.add(raw.provider_id)
      providers.push({
        id: raw.provider_id,
        name: raw.provider_name,
        logoPath: raw.logo_path ?? null,
        kind,
        url: providerUrl(raw.provider_id, title),
      })
    }
  }
  return { region, link: isHttps(entry.link) ? entry.link : null, providers }
}

export const normalizeRegion = (value: string | null | undefined): string => {
  const code = (value ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : 'US'
}

const json = (body: WatchReply, cacheControl: string) =>
  new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
    },
  })

const empty = (status: number) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })

type Load = (path: string) => Promise<unknown>

// GET /api/watch?id=<tmdbId>&title=<title>[&region=GB]. The country comes
// from the query, else Vercel's geolocation header, else the US. Availability
// changes slowly, so shared caches keep it for a day.
export const handleWatch = async (
  request: Request,
  load: Load,
): Promise<Response> => {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? ''
  if (!/^\d{1,9}$/.test(id)) return empty(400)
  const region = normalizeRegion(
    url.searchParams.get('region') ??
      request.headers.get('x-vercel-ip-country'),
  )
  const title = (url.searchParams.get('title') ?? '').slice(0, 200)
  try {
    const body = (await load(
      `movie/${id}/watch/providers`,
    )) as TmdbWatchBody | null
    if (!body) return empty(502)
    return json(
      parseWatch(body, region, title),
      'public, s-maxage=86400, stale-while-revalidate=604800',
    )
  } catch {
    return empty(502)
  }
}
