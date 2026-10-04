import { describe, expect, it } from 'vitest'
import {
  type GalleryKeyState,
  applySortDirection,
  applySortToggle,
  compareListGroups,
  filterMoviesByDecisionFilters,
  filterMoviesByGenres,
  filterMoviesByTitleSearch,
  filterMoviesByYearAndRating,
  formatFilmCount,
  formatMovieMeta,
  getActiveSortRules,
  getCatalogChunkCount,
  getGalleryWindow,
  getGenreOverlap,
  getRuntimeBucket,
  getSimilarMovies,
  groupMoviesAlphabetically,
  groupMoviesByPopularity,
  groupMoviesByRating,
  groupMoviesByRuntime,
  groupMoviesByVotes,
  groupMoviesByYear,
  isLightweightDevice,
  mapCatalogRow,
  mapMovie,
  resolveMoviePosterUrls,
  shouldHandleGalleryKey,
  sortMoviesByRules,
  sortMoviesForList,
  withWeightedRatings,
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
  ratingValue: 7 as number | null,
  runtime: '100m',
  runtimeMinutes: 100 as number | null,
  tagline: '',
  title,
  voteCount: 1000 as number | null,
  popularity: 10 as number | null,
  weightedRating: 7 as number | null,
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
        'movieUnder90',
      ).movies.map((item) => item.title),
    ).toEqual(['A Quiet Place'])
  })

  it('broadens sparse decision filter results without duplicating movies', () => {
    const result = filterMoviesByDecisionFilters(
      movies,
      ['funny'],
      'movieUnder90',
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
    expect(sortMoviesForList(movies, 'year')[0].title).toBe('A Quiet Place')
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
      { ...movies[0], weightedRating: 6.4 },
      { ...movies[1], weightedRating: 8.9 },
      { ...movies[2], weightedRating: null },
      { ...movies[3], weightedRating: 8.1 },
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
    const order = (direction: 'asc' | 'desc') =>
      Object.keys(groupMoviesByRating(rated)).sort((a, b) =>
        compareListGroups(a, b, 'rating', direction),
      )
    expect(order('desc')).toEqual(['8+', '6+', 'Unrated'])
    expect(order('asc')).toEqual(['6+', '8+', 'Unrated'])
  })

  it('sorts by stacked rules and ignores rules without a direction', () => {
    const pool = [
      { ...movies[0], year: '2007', weightedRating: 7.5 },
      { ...movies[1], year: '2007', weightedRating: 8.1 },
      { ...movies[2], year: '1995', weightedRating: 6 },
      { ...movies[3], year: '2007', weightedRating: 7.5 },
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
    const start = [{ key: 'alpha', direction: 'asc' }] as const
    // Ticking a key appends it as pending; a direction click sets it.
    const withRating = applySortToggle([...start], 'rating')
    expect(withRating).toEqual([
      { key: 'alpha', direction: 'asc' },
      { key: 'rating', direction: null },
    ])
    expect(applySortDirection(withRating, 'rating', 'desc')[1]).toEqual({
      key: 'rating',
      direction: 'desc',
    })
    // One click on an unselected key adds it with that direction.
    expect(applySortDirection([...start], 'year', 'asc')).toHaveLength(2)
    // The last remaining rule cannot be removed.
    expect(applySortToggle([...start], 'alpha')).toEqual([...start])
    // Removing the first rule promotes the next; a pending one gets a default.
    expect(applySortToggle(withRating, 'alpha')).toEqual([
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
    ).toBe('Year: - | Rating: N/A | Hour: -')
  })

  it('falls back to A-Z ascending when no rule is active', () => {
    expect(getActiveSortRules([])).toEqual([{ key: 'alpha', direction: 'asc' }])
    expect(getActiveSortRules([{ key: 'year', direction: null }])).toEqual([
      { key: 'alpha', direction: 'asc' },
    ])
  })

  it('sorts by each new key with unknown values always last', () => {
    const unknown = {
      runtimeMinutes: null,
      popularity: null,
      voteCount: null,
      weightedRating: null,
    }
    const pool = [
      {
        ...movies[0],
        title: 'Aa',
        runtimeMinutes: 120,
        popularity: 5,
        voteCount: 50,
        weightedRating: 6,
      },
      { ...movies[1], ...unknown, title: 'Bb' },
      {
        ...movies[2],
        title: 'Cc',
        runtimeMinutes: 80,
        popularity: 50,
        voteCount: 5000,
        weightedRating: 8,
      },
    ]
    const titles = (
      key: 'rating' | 'runtime' | 'popularity' | 'votes',
      direction: 'asc' | 'desc',
    ) => sortMoviesByRules(pool, [{ key, direction }]).map((item) => item.title)

    expect(titles('rating', 'desc')).toEqual(['Cc', 'Aa', 'Bb'])
    expect(titles('rating', 'asc')).toEqual(['Aa', 'Cc', 'Bb'])
    expect(titles('runtime', 'asc')).toEqual(['Cc', 'Aa', 'Bb'])
    expect(titles('runtime', 'desc')).toEqual(['Aa', 'Cc', 'Bb'])
    expect(titles('popularity', 'desc')).toEqual(['Cc', 'Aa', 'Bb'])
    expect(titles('popularity', 'asc')).toEqual(['Aa', 'Cc', 'Bb'])
    expect(titles('votes', 'desc')).toEqual(['Cc', 'Aa', 'Bb'])
    expect(titles('votes', 'asc')).toEqual(['Aa', 'Cc', 'Bb'])
    expect(
      sortMoviesByRules(
        [movies[0], { ...movies[1], year: '----' }, movies[3]],
        [{ key: 'year', direction: 'desc' }],
      ).map((item) => item.title),
    ).toEqual(['A Quiet Place', 'Zodiac', 'Before Sunrise'])
  })

  it('computes Bayesian weighted ratings and leaves unrated movies null', () => {
    const pool = [
      { ...movies[0], ratingValue: 8, voteCount: 100 },
      { ...movies[1], ratingValue: 6, voteCount: 300 },
      { ...movies[2], ratingValue: 9, voteCount: 0 },
      { ...movies[3], ratingValue: null, voteCount: 500 },
      { ...movies[4], ratingValue: 7, voteCount: null },
    ]
    const [first, second, third, fourth, fifth] = withWeightedRatings(pool)
    // C = mean(8, 6) = 7, m = median(100, 300) = 200
    expect(first.weightedRating).toBeCloseTo((100 / 300) * 8 + (200 / 300) * 7)
    expect(second.weightedRating).toBeCloseTo((300 / 500) * 6 + (200 / 500) * 7)
    expect(third.weightedRating).toBeNull()
    expect(fourth.weightedRating).toBeNull()
    expect(fifth.weightedRating).toBeNull()
  })

  it('normalizes a 0.0 vote average to a null rating', () => {
    const mapped = mapMovie(
      { id: '1', title: 'X', vote_average: '0.0', vote_count: 12 },
      0,
      new Set(),
    )
    expect(mapped.ratingValue).toBeNull()
    expect(mapped.rating).toBe('')
    expect(mapped.voteCount).toBe(12)
    expect(formatMovieMeta(mapped)).toContain('Rating: N/A')
  })

  it('groups by runtime, votes and popularity with unknown groups last', () => {
    const pool = [
      { ...movies[0], runtimeMinutes: 80, voteCount: 20000, popularity: 100 },
      { ...movies[1], runtimeMinutes: 100, voteCount: 2000, popularity: 50 },
      { ...movies[2], runtimeMinutes: 150, voteCount: 200, popularity: 10 },
      { ...movies[3], runtimeMinutes: null, voteCount: null, popularity: null },
      { ...movies[4], runtimeMinutes: 90, voteCount: 10, popularity: 1 },
    ]
    const runtime = groupMoviesByRuntime(pool)
    expect(Object.keys(runtime).sort()).toEqual(
      ['1h 30–2h', 'Over 2h', 'Under 1h 30', 'Unknown'].sort(),
    )
    expect(runtime['1h 30–2h']).toHaveLength(2)
    expect(Object.keys(groupMoviesByVotes(pool)).sort()).toEqual(
      ['10k+', '1k–10k', '100–1k', 'Under 100', 'Unknown'].sort(),
    )
    const popular = groupMoviesByPopularity(pool)
    expect(popular['Top 25%']).toEqual([pool[0]])
    expect(popular['Top 50%']).toEqual([pool[1]])
    expect(popular.Rest).toEqual([pool[2], pool[4]])
    expect(popular.Unknown).toEqual([pool[3]])
    const order = (direction: 'asc' | 'desc') =>
      Object.keys(runtime).sort((a, b) =>
        compareListGroups(a, b, 'runtime', direction),
      )
    expect(order('asc')).toEqual([
      'Under 1h 30',
      '1h 30–2h',
      'Over 2h',
      'Unknown',
    ])
    expect(order('desc')).toEqual([
      'Over 2h',
      '1h 30–2h',
      'Under 1h 30',
      'Unknown',
    ])
  })
})

describe('runtime buckets', () => {
  it('maps runtimes onto three contiguous movie buckets', () => {
    expect(getRuntimeBucket(84)).toBe('movieUnder90')
    expect(getRuntimeBucket(89)).toBe('movieUnder90')
    expect(getRuntimeBucket(90)).toBe('movie90to120')
    expect(getRuntimeBucket(120)).toBe('movie90to120')
    expect(getRuntimeBucket(121)).toBe('movieOver120')
    expect(getRuntimeBucket(null)).toBeNull()
  })
})

describe('year and rating filters', () => {
  const rated = (id: string, year: string, ratingValue: number | null) => ({
    ...movie(id, id, year, ['Drama'], Number(id.length)),
    ratingValue,
  })
  const pool = [
    rated('a', '1994', 8.4),
    rated('bb', '1999', 6.1),
    rated('ccc', '2001', 7),
    rated('dddd', '2019', null),
  ]
  const titles = (items: Array<{ title: string }>) =>
    items.map((item) => item.title)

  it('matches an exact year', () => {
    expect(
      titles(
        filterMoviesByYearAndRating(pool, { kind: 'year', value: 1999 }, null),
      ),
    ).toEqual(['bb'])
  })

  it('matches a whole decade inclusively', () => {
    expect(
      titles(
        filterMoviesByYearAndRating(
          pool,
          { kind: 'decade', value: 1990 },
          null,
        ),
      ),
    ).toEqual(['a', 'bb'])
  })

  it('applies a minimum rating and excludes unrated movies', () => {
    expect(titles(filterMoviesByYearAndRating(pool, null, 7))).toEqual([
      'a',
      'ccc',
    ])
    expect(titles(filterMoviesByYearAndRating(pool, null, 0))).toEqual([
      'a',
      'bb',
      'ccc',
    ])
  })

  it('combines year and rating', () => {
    expect(
      titles(
        filterMoviesByYearAndRating(pool, { kind: 'decade', value: 1990 }, 8),
      ),
    ).toEqual(['a'])
  })
})

describe('shouldHandleGalleryKey', () => {
  const base = {
    key: 'shuffle' as const,
    mode: 'wall',
    galleryReady: true,
    overlayOpen: false,
    hasTarget: true,
    repeat: false,
    hasModifier: false,
    activeElementKind: 'body' as const,
  }

  it('handles the key when nothing blocks it', () => {
    expect(shouldHandleGalleryKey(base)).toBe(true)
    expect(shouldHandleGalleryKey({ ...base, key: 'open' })).toBe(true)
    expect(
      shouldHandleGalleryKey({ ...base, activeElementKind: 'canvas' }),
    ).toBe(true)
  })

  it('allows shuffle shortcuts in index mode', () => {
    expect(shouldHandleGalleryKey({ ...base, mode: 'list' })).toBe(true)
  })

  it.each<[string, Partial<GalleryKeyState>]>([
    ['index mode open shortcut', { mode: 'list', key: 'open' }],
    ['filters mode', { mode: 'filters' }],
    ['gallery not ready', { galleryReady: false }],
    ['an overlay open', { overlayOpen: true }],
    ['no target movie', { hasTarget: false }],
    ['a repeated key', { repeat: true }],
    ['a modifier held', { hasModifier: true }],
    ['an interactive element focused', { activeElementKind: 'interactive' }],
  ])('ignores the key with %s', (_label, override) => {
    expect(shouldHandleGalleryKey({ ...base, ...override })).toBe(false)
  })
})

describe('catalogue films', () => {
  it('maps a compact catalogue row to a movie with TMDB posters', () => {
    const mapped = mapCatalogRow(
      [603, 'The Matrix', 1999, 79, [0, 2], 1, 'abc123', '3a4b5c', 25000, 987],
      12,
      2000,
      {
        countries: ['France', 'United States of America'],
        genres: ['Action', 'Drama', 'Science Fiction'],
      },
    )
    expect(mapped).toMatchObject({
      id: 'c603',
      rank: 2000,
      title: 'The Matrix',
      year: '1999',
      rating: '7.9',
      ratingValue: 7.9,
      genres: ['Action', 'Science Fiction'],
      countries: 'United States of America',
      posterUrl: 'https://image.tmdb.org/t/p/w154/abc123.jpg',
      posterDetailUrl: 'https://image.tmdb.org/t/p/w342/abc123.jpg',
      placeholderColor: '#3a4b5c',
      runtimeMinutes: null,
      voteCount: 25000,
      popularity: 98.7,
      textIndex: 12,
    })
  })

  it('treats a zero rating as unrated', () => {
    const mapped = mapCatalogRow(
      [1, 'X', 0, 0, [], -1, 'p', '000000', 0, 0],
      0,
      1,
      {
        countries: [],
        genres: [],
      },
    )
    expect(mapped.ratingValue).toBeNull()
    expect(mapped.year).toBe('----')
  })
})

describe('catalogue size by device', () => {
  const manifest = { chunks: ['a', 'b', 'c', 'd', 'e'], chunkSize: 2000 }
  const desktop = { coarsePointer: false, narrowViewport: false }

  it('treats a phone, or a weak machine, as lightweight', () => {
    expect(isLightweightDevice(desktop)).toBe(false)
    expect(isLightweightDevice({ ...desktop, memoryGb: 8, cores: 8 })).toBe(
      false,
    )
    expect(
      isLightweightDevice({ coarsePointer: true, narrowViewport: true }),
    ).toBe(true)
    expect(isLightweightDevice({ ...desktop, memoryGb: 4 })).toBe(true)
    expect(isLightweightDevice({ ...desktop, cores: 4 })).toBe(true)
  })

  it('keeps a wide touch screen on the full catalogue', () => {
    expect(
      isLightweightDevice({ coarsePointer: true, narrowViewport: false }),
    ).toBe(false)
  })

  it('loads two chunks, about 5,000 films, on lightweight devices', () => {
    expect(getCatalogChunkCount(manifest, 1056, true)).toBe(2)
  })

  it('loads every chunk elsewhere', () => {
    expect(getCatalogChunkCount(manifest, 1056, false)).toBe(5)
  })

  it('never asks for more chunks than exist', () => {
    expect(
      getCatalogChunkCount({ ...manifest, chunks: ['a'] }, 1056, true),
    ).toBe(1)
  })
})

describe('film counts', () => {
  it('rounds down to thousands for copy', () => {
    expect(formatFilmCount(1056)).toBe('1k+')
    expect(formatFilmCount(5056)).toBe('5k+')
    expect(formatFilmCount(10000)).toBe('10k+')
    expect(formatFilmCount(640)).toBe('640')
  })
})

describe('similar movies', () => {
  const source = movie('s', 'Source', '2000', ['Horror', 'Thriller'], 1)
  const pool = [
    source,
    {
      ...movie('a', 'Both genres', '2001', ['Horror', 'Thriller'], 50),
      ratingValue: 6,
    },
    {
      ...movie('b', 'One genre, great', '2002', ['Horror'], 2),
      ratingValue: 9,
    },
    {
      ...movie('c', 'Obscure ten', '2003', ['Horror', 'Thriller'], 19000),
      ratingValue: 10,
    },
    movie('d', 'Unrelated', '2004', ['Comedy'], 3),
  ]

  it('ranks genre overlap first, then popularity-weighted rating', () => {
    expect(getSimilarMovies(source, pool).map((item) => item.id)).toEqual([
      'a',
      'c',
      'b',
    ])
  })

  it('caps the result and skips the film itself', () => {
    const result = getSimilarMovies(source, pool, 1)
    expect(result.map((item) => item.id)).toEqual(['a'])
  })
})
