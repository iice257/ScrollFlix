import { describe, expect, it, vi } from 'vitest'
import { cleanQuery, handleSearch, parseSearch } from './search'

const result = (extra = {}) => ({
  id: 603,
  title: 'The Matrix',
  original_title: 'The Matrix',
  original_language: 'en',
  release_date: '1999-03-30',
  vote_average: 8.2,
  vote_count: 25000,
  popularity: 80.5,
  genre_ids: [28, 878],
  poster_path: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
  backdrop_path: '/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg',
  overview: 'A hacker learns the truth.',
  ...extra,
})

describe('parseSearch', () => {
  it('keeps what the index shows, with file names for the images', () => {
    expect(parseSearch({ results: [result()] })).toEqual([
      {
        id: 603,
        title: 'The Matrix',
        originalTitle: 'The Matrix',
        originalLanguage: 'en',
        year: '1999',
        rating: 8.2,
        votes: 25000,
        popularity: 80.5,
        genres: ['Action', 'Science Fiction'],
        posterPath: 'f89U3ADr1oiB1s9GkdPOEpXUk5H',
        backdropPath: 'fNG7i7RqMErkcqhohV2a6cV1Ehy',
        overview: 'A hacker learns the truth.',
      },
    ])
  })

  it('drops films with no poster or title, and a rating from no votes', () => {
    const films = parseSearch({
      results: [
        result({ id: 1, poster_path: null }),
        result({ id: 2, title: '  ' }),
        result({ id: 3, vote_count: 0, vote_average: 0 }),
        result({ id: 4, poster_path: '/../../evil.jpg' }),
      ],
    })
    expect(films.map((film) => film.id)).toEqual([3])
    expect(films[0].rating).toBeNull()
  })

  it('caps the list and tolerates an empty body', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      result({ id: index + 1 }),
    )
    expect(parseSearch({ results: many })).toHaveLength(20)
    expect(parseSearch(null)).toEqual([])
  })
})

describe('handleSearch', () => {
  const ask = (q: string, load = vi.fn()) =>
    handleSearch(new Request(`https://x.test/api/search?q=${q}`), load)

  it('wants three characters', async () => {
    const load = vi.fn()
    expect((await ask('ab', load)).status).toBe(400)
    expect(load).not.toHaveBeenCalled()
  })

  it('searches TMDB and shares the reply', async () => {
    const load = vi.fn().mockResolvedValue({ results: [result()] })
    const response = await ask('matrix%20reloaded', load)
    expect(load).toHaveBeenCalledWith(
      'search/movie?query=matrix%20reloaded&include_adult=false&language=en-US&page=1',
    )
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(
      ((await response.json()) as { films: unknown[] }).films,
    ).toHaveLength(1)
  })

  it('says so when TMDB cannot be reached', async () => {
    expect((await ask('matrix', vi.fn().mockResolvedValue(null))).status).toBe(
      502,
    )
    expect(
      (await ask('matrix', vi.fn().mockRejectedValue(new Error('x')))).status,
    ).toBe(502)
  })
})

describe('cleanQuery', () => {
  it('trims, folds spaces and caps the length', () => {
    expect(cleanQuery('  the   matrix ')).toBe('the matrix')
    expect(cleanQuery('a'.repeat(200))).toHaveLength(80)
    expect(cleanQuery(null)).toBe('')
  })
})
