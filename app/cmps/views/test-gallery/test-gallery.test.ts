import { describe, expect, it } from 'vitest'
import {
  applySortDirection,
  applySortToggle,
  filterMoviesByDecisionFilters,
  filterMoviesByGenres,
  filterMoviesByTitleSearch,
  formatMovieMeta,
  getGalleryWindow,
  getGenreOverlap,
  groupMoviesAlphabetically,
  groupMoviesByRating,
  groupMoviesByYear,
  resolveMoviePosterUrls,
  sortMoviesByRules,
  sortMoviesForList,
} from './test-gallery'

const CHINESE_COMEDY_TITLE = '分手大师'

const movie = (
  id: string,
  title: string,
  year: string,
  genres: string[],
  rank: number,
) => ({
  countries: 'US',
  genres,
  id,
  overview: '',
  posterUrl: `/media/single/${rank}.jpg`,
  rank,
  rating: '7.0',
  ratingValue: 7,
  runtime: '100m',
  runtimeMinutes: 100,
  tagline: '',
  title,
  year,
})

describe('test gallery filtering helpers', () => {
  const movies = [
    movie('1', 'A Quiet Place', '2018', ['Horror', 'Thriller'], 1),
    movie('2', 'Before Sunrise', '1995', ['Romance', 'Drama'], 2),
    movie('3', 'Only Lovers Left Alive', '2013', ['Horror', 'Romance'], 3),
    movie('4', 'Zodiac', '2007', ['Crime', 'Drama'], 4),
    movie('5', CHINESE_COMEDY_TITLE, '2014', ['Romance', 'Comedy'], 5),
    movie('6', '[Rec]', '2007', ['Horror'], 6),
  ]

  it('uses OR matching for stacked genre filters', () => {
    expect(filterMoviesByGenres(movies, ['Horror', 'Romance'])).toHaveLength(5)
  })

  it('filters movie titles case-insensitively for index search', () => {
    expect(
      filterMoviesByTitleSearch(movies, 'quiet').map((item) => item.title),
    ).toEqual(['A Quiet Place'])
    expect(filterMoviesByTitleSearch(movies, 'LOVE')).toHaveLength(1)
    expect(filterMoviesByTitleSearch(movies, '   ')).toHaveLength(movies.length)
  })

  it('filters movies by deterministic mood and runtime groups', () => {
    expect(
      filterMoviesByDecisionFilters(movies, ['funny'], null).movies.map(
        (item) => item.title,
      ),
    ).toEqual([CHINESE_COMEDY_TITLE])

    expect(
      filterMoviesByDecisionFilters(
        [
          { ...movies[0], runtimeMinutes: 48 },
          { ...movies[1], runtimeMinutes: 122 },
          { ...movies[2], runtimeMinutes: 151 },
        ],
        [],
        'movie30to60',
      ).movies.map((item) => item.title),
    ).toEqual(['A Quiet Place'])
  })

  it('broadens sparse decision filter results without duplicating movies', () => {
    const result = filterMoviesByDecisionFilters(
      movies,
      ['funny'],
      'movie30to60',
    )

    expect(result.broadened).toBe(true)
    expect(result.strictCount).toBe(0)
    expect(result.movies.map((item) => item.title)).toEqual([
      CHINESE_COMEDY_TITLE,
    ])
  })

  it('ranks movies with the strongest overlap first in the gallery window', () => {
    expect(
      getGalleryWindow(movies, ['Horror', 'Romance'], 3).map(
        (item) => item.title,
      )[0],
    ).toBe('Only Lovers Left Alive')
    expect(getGenreOverlap(movies[2], ['Horror', 'Romance'])).toBe(2)
  })

  it('keeps higher-ranked movies first when genre overlap is equal', () => {
    expect(getGalleryWindow(movies, [], 3).map((item) => item.rank)).toEqual([
      1, 2, 3,
    ])
  })

  it('only admits verified local poster assets', () => {
    expect(resolveMoviePosterUrls('123', 216, new Set(['123']))).toEqual({
      posterUrl: '/media/posters/123.jpg',
    })
    expect(resolveMoviePosterUrls('', 0, new Set(['123']))).toEqual({
      posterUrl: '/media/single/0.jpg',
    })
    expect(resolveMoviePosterUrls('', 216, new Set(['123']))).toEqual({
      posterUrl: '',
    })
    expect(resolveMoviePosterUrls('123', 216, new Set())).toEqual({
      posterUrl: '',
    })
  })

  it('sorts list mode chronologically or alphabetically', () => {
    expect(
      sortMoviesForList(movies, 'year').map((item) => item.title),
    ).toContain(CHINESE_COMEDY_TITLE)
    expect(sortMoviesForList(movies, 'year')[0].title).toBe('Before Sunrise')
    expect(sortMoviesForList(movies, 'alpha')[0].title).toBe('A Quiet Place')
    expect(
      sortMoviesForList(movies, 'alpha').map((item) => item.title),
    ).not.toContain(CHINESE_COMEDY_TITLE)
    expect(
      sortMoviesForList(movies, 'alpha').map((item) => item.title),
    ).not.toContain('[Rec]')
  })

  it('groups list mode by year or title initial', () => {
    expect(Object.keys(groupMoviesByYear(movies))).toContain('2018')
    expect(Object.keys(groupMoviesAlphabetically(movies))).toContain('B')
  })

  it('sorts and groups list mode by rating, unrated last', () => {
    const rated = [
      { ...movies[0], rating: '6.4', ratingValue: 6.4 },
      { ...movies[1], rating: '8.9', ratingValue: 8.9 },
      { ...movies[2], rating: '-', ratingValue: null },
      { ...movies[3], rating: '8.1', ratingValue: 8.1 },
    ]

    expect(
      sortMoviesForList(rated, 'rating').map((item) => item.title),
    ).toEqual([
      'Before Sunrise',
      'Zodiac',
      'A Quiet Place',
      'Only Lovers Left Alive',
    ])
    expect(groupMoviesByRating(rated)).toEqual({
      '8+': [rated[1], rated[3]],
      '6+': [rated[0]],
      Unrated: [rated[2]],
    })
  })

  it('sorts by stacked rules and ignores rules without a direction', () => {
    const pool = [
      { ...movies[0], year: '2007', rating: '7.5', ratingValue: 7.5 },
      { ...movies[1], year: '2007', rating: '8.1', ratingValue: 8.1 },
      { ...movies[2], year: '1995', rating: '6.0', ratingValue: 6 },
      { ...movies[3], year: '2007', rating: '7.5', ratingValue: 7.5 },
    ]
    const titles = (rules: Parameters<typeof sortMoviesByRules>[1]) =>
      sortMoviesByRules(pool, rules).map((item) => item.title)

    // Newest first, then highest rated, then title.
    expect(
      titles([
        { key: 'year', direction: 'desc' },
        { key: 'rating', direction: 'desc' },
      ]),
    ).toEqual([
      'Before Sunrise',
      'A Quiet Place',
      'Zodiac',
      'Only Lovers Left Alive',
    ])
    // A pending rule (no direction yet) has no effect.
    expect(
      titles([
        { key: 'year', direction: 'desc' },
        { key: 'rating', direction: null },
      ]),
    ).toEqual([
      'A Quiet Place',
      'Before Sunrise',
      'Zodiac',
      'Only Lovers Left Alive',
    ])
  })

  it('manages the sort rule stack like the sort panel', () => {
    const start = [{ key: 'year', direction: 'asc' }] as const
    // Ticking a key appends it as pending; a direction click sets it.
    const withRating = applySortToggle([...start], 'rating')
    expect(withRating).toEqual([
      { key: 'year', direction: 'asc' },
      { key: 'rating', direction: null },
    ])
    expect(applySortDirection(withRating, 'rating', 'desc')[1]).toEqual({
      key: 'rating',
      direction: 'desc',
    })
    // One click on an unselected key adds it with that direction.
    expect(applySortDirection([...start], 'alpha', 'asc')).toHaveLength(2)
    // The last remaining rule cannot be removed.
    expect(applySortToggle([...start], 'year')).toEqual([...start])
    // Removing the first rule promotes the next; a pending one gets a default.
    expect(applySortToggle(withRating, 'year')).toEqual([
      { key: 'rating', direction: 'desc' },
    ])
  })

  it('formats movie metadata consistently with explicit missing states', () => {
    expect(formatMovieMeta(movies[0])).toBe(
      'Year: 2018 | Rating: 7.0 | Hour: 1:40',
    )

    expect(
      formatMovieMeta({
        ...movies[0],
        rating: '',
        ratingValue: null,
        runtime: '0:00',
        runtimeMinutes: null,
        year: '----',
      }),
    ).toBe('Year: - | Rating: - | Hour: -')
  })
})
