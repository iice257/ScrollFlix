import { type TestMovie, toTitleKey } from './catalog-loader'

// Films found by "Search all of TMDB": live results from /api/search for
// films the catalogue does not hold. They become ordinary TestMovies (the
// index row and the film card use them as they are), flagged `external`.

export type TmdbFilm = {
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

const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p'
export const MIN_TMDB_QUERY = 3

export const toExternalMovie = (film: TmdbFilm, rank: number): TestMovie => ({
  id: `c${film.id}`,
  rank,
  title: film.title,
  titleKey: toTitleKey(film.title),
  tagline: '',
  overview: film.overview,
  genres: film.genres,
  year: film.year || '----',
  runtime: '',
  runtimeMinutes: null,
  rating: film.rating ? film.rating.toFixed(1) : '',
  ratingValue: film.rating,
  voteCount: film.votes,
  popularity: film.popularity,
  weightedRating: null,
  countries: '',
  posterUrl: `${TMDB_IMAGE_URL}/w154/${film.posterPath}.jpg`,
  posterDetailUrl: `${TMDB_IMAGE_URL}/w342/${film.posterPath}.jpg`,
  posterListUrl: `${TMDB_IMAGE_URL}/w92/${film.posterPath}.jpg`,
  posterPath: film.posterPath,
  backdropPath: film.backdropPath,
  originalTitle:
    film.originalTitle && film.originalTitle !== film.title
      ? film.originalTitle
      : undefined,
  originalLanguage: film.originalLanguage || undefined,
  external: true,
})

// The query's films that the catalogue does not already hold.
export const searchTmdb = async (
  query: string,
  knownIds: ReadonlySet<string>,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<TestMovie[]> => {
  const response = await fetchImpl(
    `/api/search?${new URLSearchParams({ q: query.trim() })}`,
    { signal },
  )
  if (!response.ok) throw new Error(`search ${response.status}`)
  const body = (await response.json()) as { films?: TmdbFilm[] }
  return (body.films ?? [])
    .filter((film) => !knownIds.has(`c${film.id}`))
    .map((film, index) => toExternalMovie(film, 1_000_000 + index))
}
