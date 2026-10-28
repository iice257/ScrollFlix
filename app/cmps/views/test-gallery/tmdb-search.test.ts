import { describe, expect, it, vi } from 'vitest'
import { searchTmdb, toExternalMovie } from './tmdb-search'

const film = (id: number, extra = {}) => ({
  id,
  title: `Film ${id}`,
  originalTitle: `Film ${id}`,
  originalLanguage: 'en',
  year: '2011',
  rating: 7.4,
  votes: 12,
  popularity: 3.2,
  genres: ['Drama'],
  posterPath: `poster${id}`,
  backdropPath: null,
  overview: 'A film.',
  ...extra,
})

describe('toExternalMovie', () => {
  it('is an ordinary movie, flagged external, with its text in place', () => {
    const movie = toExternalMovie(film(7), 1_000_000)
    expect(movie).toMatchObject({
      id: 'c7',
      title: 'Film 7',
      year: '2011',
      rating: '7.4',
      overview: 'A film.',
      external: true,
      posterListUrl: 'https://image.tmdb.org/t/p/w92/poster7.jpg',
    })
    expect(movie.textIndex).toBeUndefined()
    expect(movie.originalTitle).toBeUndefined()
  })

  it('keeps a different original title and shows no rating without one', () => {
    const movie = toExternalMovie(
      film(8, { originalTitle: 'Film Eight', rating: null, year: '' }),
      1,
    )
    expect(movie.originalTitle).toBe('Film Eight')
    expect(movie.rating).toBe('')
    expect(movie.year).toBe('----')
  })
})

describe('searchTmdb', () => {
  it('asks the API and drops films the catalogue already holds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ films: [film(1), film(2), film(3)] }),
    })
    const found = await searchTmdb('film', new Set(['c2']), fetchImpl)
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/search?q=film')
    expect(found.map((movie) => movie.id)).toEqual(['c1', 'c3'])
  })

  it('throws when the API fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 })
    await expect(searchTmdb('film', new Set(), fetchImpl)).rejects.toThrow(
      'search 502',
    )
  })
})
