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
  // Always somewhere that helps and never a third party's listing: the
  // service's own search for the film, else a Google search limited to the
  // service's site, else a Google search for the film and the service.
  // Null only when the film has no title to search for.
  url: string | null
}

export type WatchReply = {
  region: string
  // TMDB's watch page for this film and country (its listings come from
  // JustWatch); always safe to open.
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
// per-film deep link without a partner agreement (or a paid catalogue API).
const q = (title: string) => encodeURIComponent(title)

// Amazon's store for a country; Prime Video's own site serves everywhere.
const AMAZON_STORES: Record<string, string> = {
  US: 'www.amazon.com',
  GB: 'www.amazon.co.uk',
  DE: 'www.amazon.de',
  AT: 'www.amazon.de',
  FR: 'www.amazon.fr',
  IT: 'www.amazon.it',
  ES: 'www.amazon.es',
  NL: 'www.amazon.nl',
  CA: 'www.amazon.ca',
  JP: 'www.amazon.co.jp',
  IN: 'www.amazon.in',
  AU: 'www.amazon.com.au',
  BR: 'www.amazon.com.br',
  MX: 'www.amazon.com.mx',
}
const primeVideoSearch = (t: string) =>
  `https://www.primevideo.com/search/?phrase=${q(t)}`

type SearchUrl = (title: string, region: string) => string
const SEARCH: Partial<Record<number, SearchUrl>> = {
  8: (t) => `https://www.netflix.com/search?q=${q(t)}`,
  // Prime Video (and its ad tier): its own site, in every country.
  9: primeVideoSearch,
  119: primeVideoSearch,
  2100: primeVideoSearch,
  // Amazon Video (rent or buy): the country's Amazon store, where one exists.
  10: (t, region) =>
    AMAZON_STORES[region]
      ? `https://${AMAZON_STORES[region]}/s?k=${q(t)}&i=instant-video`
      : primeVideoSearch(t),
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
  190: (t) => `https://www.curiositystream.com/search?q=${q(t)}`,
  258: (t) => `https://www.criterionchannel.com/search?q=${q(t)}`,
  11: (t) => `https://mubi.com/en/search?query=${q(t)}`,
  283: (t) => `https://www.crunchyroll.com/search?q=${q(t)}`,
  99: (t) => `https://www.shudder.com/search?q=${q(t)}`,
  1796: (t) => `https://www.netflix.com/search?q=${q(t)}`,
}

export const providerUrl = (
  id: number,
  title: string,
  region = 'US',
): string | null => {
  const make = SEARCH[id]
  return make && title ? make(title, region) : null
}

const googleSearch = (query: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(query)}`

// The same services by name, for the many listings TMDB gives that are one
// service under another id ("HBO Max Amazon Channel", "Paramount Plus
// Essential"). The first pattern that matches the lower-case name wins.
const BRAND_SEARCH: [RegExp, SearchUrl][] = [
  [/netflix/, (t) => `https://www.netflix.com/search?q=${q(t)}`],
  [/prime video|amazon video/, primeVideoSearch],
  [/disney/, (t) => `https://www.disneyplus.com/search?q=${q(t)}`],
  [/hbo max|^max\b/, (t) => `https://play.max.com/search?q=${q(t)}`],
  [/hulu/, (t) => `https://www.hulu.com/search?q=${q(t)}`],
  [/apple tv/, (t) => `https://tv.apple.com/search?term=${q(t)}`],
  [/peacock/, (t) => `https://www.peacocktv.com/search?q=${q(t)}`],
  [/paramount/, (t) => `https://www.paramountplus.com/search/?q=${q(t)}`],
  [/tubi/, (t) => `https://tubitv.com/search/${q(t)}`],
  [/pluto/, (t) => `https://pluto.tv/search/details?query=${q(t)}`],
  [/plex/, (t) => `https://watch.plex.tv/search?q=${q(t)}`],
  [
    /youtube/,
    (t) =>
      `https://www.youtube.com/results?search_query=${q(`${t} full movie`)}`,
  ],
  [
    /google play/,
    (t) => `https://play.google.com/store/search?q=${q(t)}&c=movies`,
  ],
  [/crunchyroll/, (t) => `https://www.crunchyroll.com/search?q=${q(t)}`],
  [/shudder/, (t) => `https://www.shudder.com/search?q=${q(t)}`],
  [/mubi/, (t) => `https://mubi.com/en/search?query=${q(t)}`],
  [/criterion/, (t) => `https://www.criterionchannel.com/search?q=${q(t)}`],
  [/bbc iplayer/, (t) => `https://www.bbc.co.uk/iplayer/search?q=${q(t)}`],
]

// Services whose own search address is not one to guess: a Google search
// limited to the service's site lands on the film's page there.
const SERVICE_SITES: [RegExp, string][] = [
  [/kanopy/, 'kanopy.com'],
  [/hoopla/, 'hoopladigital.com'],
  [/starz/, 'starz.com'],
  [/amc\+|amc plus/, 'amcplus.com'],
  [/britbox/, 'britbox.com'],
  [/itvx|itv hub/, 'itv.com'],
  [/channel 4/, 'channel4.com'],
  [/^stan\b/, 'stan.com.au'],
  [/binge/, 'binge.com.au'],
  [/crave/, 'crave.ca'],
  [/sky go|sky store/, 'sky.com'],
  [/now tv|^now$/, 'nowtv.com'],
  [/canal\+|canal plus/, 'canalplus.com'],
  [/viaplay/, 'viaplay.com'],
  [/rakuten/, 'rakuten.tv'],
  [/zee5/, 'zee5.com'],
  [/hotstar/, 'hotstar.com'],
  [/sony ?liv/, 'sonyliv.com'],
  [/jio ?cinema/, 'jiocinema.com'],
  [/mx player/, 'mxplayer.in'],
  [/fandango at home|vudu/, 'fandangoathome.com'],
  [/microsoft store/, 'microsoft.com'],
  [/curiosity/, 'curiositystream.com'],
  [/hbo/, 'max.com'],
]

// Where a provider's row goes. Never TMDB: the service's own search, else a
// Google search on the service's site, else a Google search for the two.
export const serviceLink = (
  provider: { id: number; name: string },
  title: string,
  region: string,
): string | null => {
  if (!title) return null
  const byId = providerUrl(provider.id, title, region)
  if (byId) return byId
  const name = provider.name.toLowerCase()
  for (const [pattern, make] of BRAND_SEARCH)
    if (pattern.test(name)) return make(title, region)
  for (const [pattern, site] of SERVICE_SITES)
    if (pattern.test(name)) return googleSearch(`${title} site:${site}`)
  return googleSearch(`${title} ${provider.name}`)
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
        url: serviceLink(
          { id: raw.provider_id, name: raw.provider_name },
          title,
          region,
        ),
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
// from the query, else Vercel's geolocation header, else the US.
//
// Shared caches key a reply by its URL only, so a reply may be shared (for a
// day: availability changes slowly) only when the country is in the URL. A
// reply whose country came from the visitor's IP stays private to them: a
// shared copy once served one visitor's country (say Nigeria) to everyone
// asking for that film. The client asks once without a country, then puts
// the one it got back into every later request.
export const handleWatch = async (
  request: Request,
  load: Load,
): Promise<Response> => {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? ''
  if (!/^\d{1,9}$/.test(id)) return empty(400)
  const asked = url.searchParams.get('region')
  const region = normalizeRegion(
    asked ?? request.headers.get('x-vercel-ip-country'),
  )
  const title = (url.searchParams.get('title') ?? '').slice(0, 200)
  try {
    const body = (await load(
      `movie/${id}/watch/providers`,
    )) as TmdbWatchBody | null
    if (!body) return empty(502)
    return json(
      parseWatch(body, region, title),
      asked
        ? 'public, s-maxage=86400, stale-while-revalidate=604800'
        : 'private, max-age=3600',
    )
  } catch {
    return empty(502)
  }
}
