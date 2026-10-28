// "Search all of TMDB": the live fallback behind the index search for films
// that are not in the catalogue (which holds the most-voted ~106k). One TMDB
// search, trimmed to what the index shows. Never throws: any failure is an
// error status and the caller says so.

export type SearchFilm = {
  id: number
  title: string
  originalTitle: string
  originalLanguage: string
  year: string
  rating: number | null
  votes: number
  popularity: number
  genres: string[]
  posterPath: string
  backdropPath: string | null
  overview: string
}

type TmdbResult = {
  id?: number
  title?: string
  original_title?: string
  original_language?: string
  release_date?: string
  vote_average?: number
  vote_count?: number
  popularity?: number
  genre_ids?: number[]
  poster_path?: string | null
  backdrop_path?: string | null
  overview?: string
}

// TMDB's fixed movie genre ids.
const GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
}

const MAX_RESULTS = 20

const posterFile = (path: string | null | undefined) =>
  typeof path === 'string' && /^\/[\w-]{5,}\.jpg$/.test(path)
    ? path.slice(1, -4)
    : null

// Films with a poster and a title, as the index shows them. The poster and
// backdrop are kept as file names without the slash or ".jpg", like the
// catalogue's rows.
export const parseSearch = (
  body: { results?: TmdbResult[] } | null | undefined,
): SearchFilm[] => {
  const films: SearchFilm[] = []
  for (const raw of body?.results ?? []) {
    const poster = posterFile(raw.poster_path)
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    if (!poster || !title || typeof raw.id !== 'number') continue
    const votes = Math.max(0, Math.round(raw.vote_count ?? 0))
    const rating =
      votes > 0 && typeof raw.vote_average === 'number' && raw.vote_average > 0
        ? Math.round(raw.vote_average * 10) / 10
        : null
    films.push({
      id: raw.id,
      title,
      originalTitle: (raw.original_title ?? '').trim(),
      originalLanguage: (raw.original_language ?? '').trim(),
      year: /^\d{4}/.exec(raw.release_date ?? '')?.[0] ?? '',
      rating,
      votes,
      popularity: Math.round((raw.popularity ?? 0) * 10) / 10,
      genres: (raw.genre_ids ?? [])
        .map((id) => GENRES[id])
        .filter((name): name is string => Boolean(name)),
      posterPath: poster,
      backdropPath: posterFile(raw.backdrop_path),
      overview: (raw.overview ?? '').trim(),
    })
    if (films.length >= MAX_RESULTS) break
  }
  return films
}

export const cleanQuery = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)

type Load = (path: string) => Promise<unknown>

// GET /api/search?q=<text>: at least three characters. Replies are shared for
// an hour, since a title's search results change slowly.
export const handleSearch = async (
  request: Request,
  load: Load,
): Promise<Response> => {
  const query = cleanQuery(new URL(request.url).searchParams.get('q'))
  if (query.length < 3)
    return new Response(null, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    })
  try {
    const body = (await load(
      `search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`,
    )) as { results?: TmdbResult[] } | null
    if (!body)
      return new Response(null, {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      })
    return new Response(JSON.stringify({ films: parseSearch(body) }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch {
    return new Response(null, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
