import { describe, expect, it } from 'vitest'
import type { TestMovie } from './catalog-loader'
import {
  COLLECTION_FILTERS,
  filterMoviesByCollections,
  filterMoviesByCountry,
  getCountrySummaries,
} from './collections'

const film = (over: Partial<TestMovie>): TestMovie =>
  ({
    id: 'c1',
    rank: 1,
    title: 'T',
    genres: [],
    year: '2000',
    runtimeMinutes: 100,
    ratingValue: 7,
    voteCount: 1000,
    countries: 'France',
    ...over,
  }) as TestMovie

describe('collections', () => {
  const thisYear = 2026
  const ids = (movies: TestMovie[], selected: string[]) =>
    filterMoviesByCollections(movies, selected as never, thisYear).map(
      (movie) => movie.id,
    )

  it('keeps everything when nothing is selected', () => {
    const movies = [film({ id: 'a' }), film({ id: 'b' })]
    expect(filterMoviesByCollections(movies, [], thisYear)).toBe(movies)
  })

  it('finds hidden gems: well rated, few votes', () => {
    const movies = [
      film({ id: 'gem', ratingValue: 7.8, voteCount: 400 }),
      film({ id: 'famous', ratingValue: 8.5, voteCount: 90_000 }),
      film({ id: 'obscure', ratingValue: 9, voteCount: 12 }),
    ]
    expect(ids(movies, ['hiddenGems'])).toEqual(['gem'])
  })

  it('combines several collections with "or"', () => {
    const movies = [
      film({ id: 'old', year: '1955', ratingValue: 8 }),
      film({ id: 'new', year: '2026', ratingValue: 5 }),
      film({ id: 'neither', year: '2001', ratingValue: 5 }),
    ]
    expect(ids(movies, ['goldenAge', 'fresh'])).toEqual(['old', 'new'])
  })

  it('splits quick watches from epics by runtime', () => {
    const movies = [
      film({ id: 'short', runtimeMinutes: 88, ratingValue: 7.4 }),
      film({ id: 'long', runtimeMinutes: 170, ratingValue: 8 }),
      film({ id: 'unknown', runtimeMinutes: null, ratingValue: 8 }),
    ]
    expect(ids(movies, ['quickWatches'])).toEqual(['short'])
    expect(ids(movies, ['epics'])).toEqual(['long'])
  })

  it('has unique ids and labels', () => {
    expect(new Set(COLLECTION_FILTERS.map((f) => f.id)).size).toBe(
      COLLECTION_FILTERS.length,
    )
    expect(new Set(COLLECTION_FILTERS.map((f) => f.label)).size).toBe(
      COLLECTION_FILTERS.length,
    )
  })
})

describe('countries', () => {
  const movies = [
    film({ id: 'a', countries: 'France' }),
    film({ id: 'b', countries: 'France' }),
    film({ id: 'c', countries: 'Japan' }),
    film({ id: 'd', countries: 'Brazil' }),
    film({ id: 'e', countries: '' }),
  ]

  it('counts by country, most films first then by name', () => {
    expect(getCountrySummaries(movies)).toEqual([
      { country: 'France', count: 2 },
      { country: 'Brazil', count: 1 },
      { country: 'Japan', count: 1 },
    ])
  })

  it('filters to one country, or none', () => {
    expect(filterMoviesByCountry(movies, 'Japan').map((m) => m.id)).toEqual([
      'c',
    ])
    expect(filterMoviesByCountry(movies, null)).toBe(movies)
  })
})
