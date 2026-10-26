// Film facts for link previews. Never throws: any failure is a null, and the
// caller falls back to the generic card.

export type Film = {
  title: string
  year: string
  rating: number | null
  posterPath: string | null
  overview: string
}

type TmdbMovie = {
  title?: string
  release_date?: string
  vote_average?: number
  vote_count?: number
  poster_path?: string | null
  overview?: string
}

export const POSTER_BASE = 'https://image.tmdb.org/t/p/w500'

export const parseFilm = (raw: TmdbMovie | null | undefined): Film | null => {
  if (!raw || typeof raw.title !== 'string' || !raw.title.trim()) return null
  const year = /^\d{4}/.exec(raw.release_date ?? '')?.[0] ?? ''
  const rating =
    typeof raw.vote_average === 'number' &&
    raw.vote_average > 0 &&
    (raw.vote_count ?? 0) >= 10
      ? Math.round(raw.vote_average * 10) / 10
      : null
  return {
    title: raw.title.trim(),
    year,
    rating,
    posterPath: raw.poster_path ?? null,
    overview: (raw.overview ?? '').trim(),
  }
}

export const get = async (path: string): Promise<unknown> => {
  const token = process.env.TMDB_API_READ_TOKEN
  if (!token) return null
  const res = await fetch(`https://api.themoviedb.org/3/${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(2500),
  })
  return res.ok ? res.json() : null
}

export const fetchFilm = async (tmdbId: string): Promise<Film | null> => {
  if (!/^\d{1,9}$/.test(tmdbId)) return null
  try {
    return parseFilm((await get(`movie/${tmdbId}`)) as TmdbMovie | null)
  } catch {
    return null
  }
}

// Poster paths for the home card's collage. Empty when TMDB is unreachable.
export const fetchPopularPosters = async (count: number): Promise<string[]> => {
  try {
    const body = (await get('movie/top_rated')) as {
      results?: TmdbMovie[]
    } | null
    return (body?.results ?? [])
      .map((m) => m.poster_path)
      .filter((p): p is string => typeof p === 'string')
      .slice(0, count)
  } catch {
    return []
  }
}
