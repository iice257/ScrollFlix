// Smart lists and countries for the Filters page. Everything here is derived
// from fields the catalogue already carries (year, rating, votes, runtime and
// primary country), so it needs no new data. Pure and framework-free.
import type { TestMovie } from './catalog-loader'

export type CollectionId =
  | 'blockbusters'
  | 'crowdPleasers'
  | 'hiddenGems'
  | 'cultClassics'
  | 'modernClassics'
  | 'goldenAge'
  | 'fresh'
  | 'quickWatches'
  | 'epics'

export type CollectionFilter = {
  id: CollectionId
  label: string
  // What the chip's tooltip says it means.
  hint: string
  test: (movie: TestMovie, thisYear: number) => boolean
}

const year = (movie: TestMovie) => Number.parseInt(movie.year, 10)
const rating = (movie: TestMovie) => movie.ratingValue ?? 0
const votes = (movie: TestMovie) => movie.voteCount ?? 0
const runtime = (movie: TestMovie) => movie.runtimeMinutes ?? 0

export const COLLECTION_FILTERS: CollectionFilter[] = [
  {
    id: 'blockbusters',
    label: 'Blockbusters',
    hint: 'Seen by hundreds of thousands',
    test: (movie) => votes(movie) >= 10_000,
  },
  {
    id: 'crowdPleasers',
    label: 'Crowd-pleasers',
    hint: 'Well known and rated 7 or higher',
    test: (movie) => votes(movie) >= 5_000 && rating(movie) >= 7,
  },
  {
    id: 'hiddenGems',
    label: 'Hidden gems',
    hint: 'Rated 7.2 or higher, but few people have found them',
    test: (movie) =>
      rating(movie) >= 7.2 && votes(movie) >= 150 && votes(movie) <= 2_500,
  },
  {
    id: 'cultClassics',
    label: 'Cult classics',
    hint: 'Older films a loyal audience still rates 7 or higher',
    test: (movie) =>
      year(movie) <= 2005 &&
      rating(movie) >= 7 &&
      votes(movie) >= 500 &&
      votes(movie) <= 6_000,
  },
  {
    id: 'modernClassics',
    label: 'Modern classics',
    hint: '1990 to 2015, rated 7.5 or higher by a big audience',
    test: (movie) =>
      year(movie) >= 1990 &&
      year(movie) <= 2015 &&
      rating(movie) >= 7.5 &&
      votes(movie) >= 3_000,
  },
  {
    id: 'goldenAge',
    label: 'Golden age',
    hint: 'Before 1970 and rated 7 or higher',
    test: (movie) =>
      Number.isFinite(year(movie)) && year(movie) < 1970 && rating(movie) >= 7,
  },
  {
    id: 'fresh',
    label: 'Fresh',
    hint: 'Released this year or last',
    test: (movie, thisYear) => year(movie) >= thisYear - 1,
  },
  {
    id: 'quickWatches',
    label: 'Quick watches',
    hint: 'Under 95 minutes and rated 7 or higher',
    test: (movie) =>
      runtime(movie) > 0 && runtime(movie) <= 95 && rating(movie) >= 7,
  },
  {
    id: 'epics',
    label: 'Epics',
    hint: 'Over 2 hours 30 and rated 7.5 or higher',
    test: (movie) => runtime(movie) >= 150 && rating(movie) >= 7.5,
  },
]

// Selected collections combine with "or", like the moods: a film in any of
// them stays.
export const filterMoviesByCollections = (
  movies: TestMovie[],
  selected: readonly CollectionId[],
  thisYear = new Date().getFullYear(),
) => {
  if (!selected.length) return movies
  const tests = COLLECTION_FILTERS.filter((filter) =>
    selected.includes(filter.id),
  )
  return movies.filter((movie) =>
    tests.some((filter) => filter.test(movie, thisYear)),
  )
}

export const filterMoviesByCountry = (
  movies: TestMovie[],
  country: string | null,
) => (country ? movies.filter((movie) => movie.countries === country) : movies)

export type CountrySummary = { country: string; count: number }

// Countries by how many films they have, then by name, so the order is stable.
export const getCountrySummaries = (movies: TestMovie[]): CountrySummary[] => {
  const counts = new Map<string, number>()
  for (const movie of movies) {
    if (!movie.countries) continue
    counts.set(movie.countries, (counts.get(movie.countries) ?? 0) + 1)
  }
  return [...counts]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
}
