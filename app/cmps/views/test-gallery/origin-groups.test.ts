import { describe, expect, it } from 'vitest'
import type { TestMovie } from './catalog-loader'
import {
  ORIGIN_GROUPS,
  countOrigins,
  filterMoviesByOrigins,
} from './origin-groups'

const film = (id: string, countries: string, genres: string[] = []) =>
  ({ id, countries, genres }) as TestMovie

const films = [
  film('ghibli', 'Japan', ['Animation', 'Family']),
  film('pixar', 'United States of America', ['Animation', 'Family']),
  film('seoul', 'South Korea', ['Thriller']),
  film('lagos', 'Nigeria', ['Drama']),
  film('cape', 'South Africa', ['Drama']),
  film('cairo', 'Egypt', ['Drama']),
  film('paris', 'France', ['Romance']),
  film('mumbai', 'India', ['Drama']),
  film('nowhere', '', ['Drama']),
]
const ids = (movies: TestMovie[]) => movies.map((movie) => movie.id)

describe('origin groups', () => {
  it('splits animation into anime and cartoons by country', () => {
    expect(ids(filterMoviesByOrigins(films, ['anime']))).toEqual(['ghibli'])
    expect(ids(filterMoviesByOrigins(films, ['cartoons']))).toEqual(['pixar'])
  })

  it('finds a film by its country, and by the region it belongs to', () => {
    expect(ids(filterMoviesByOrigins(films, ['nollywood']))).toEqual(['lagos'])
    expect(ids(filterMoviesByOrigins(films, ['southAfrican']))).toEqual([
      'cape',
    ])
    expect(ids(filterMoviesByOrigins(films, ['african']))).toEqual([
      'lagos',
      'cape',
      'cairo',
    ])
    expect(ids(filterMoviesByOrigins(films, ['korean']))).toEqual(['seoul'])
    expect(ids(filterMoviesByOrigins(films, ['indian']))).toEqual(['mumbai'])
    expect(ids(filterMoviesByOrigins(films, ['european']))).toEqual(['paris'])
  })

  it('combines selected groups with "or" and keeps everything with none', () => {
    expect(ids(filterMoviesByOrigins(films, ['korean', 'indian']))).toEqual([
      'seoul',
      'mumbai',
    ])
    expect(filterMoviesByOrigins(films, [])).toBe(films)
  })

  it('leaves a film with no country out of every region', () => {
    const regions = ORIGIN_GROUPS.filter(
      (group) => group.id !== 'anime' && group.id !== 'cartoons',
    )
    for (const group of regions) expect(group.test(films[8])).toBe(false)
  })

  it('counts each group in one pass', () => {
    const counts = countOrigins(films)
    expect(counts.get('african')).toBe(3)
    expect(counts.get('anime')).toBe(1)
    expect(counts.get('hollywood')).toBe(1)
    expect(counts.get('latinAmerican')).toBeUndefined()
  })

  it('has unique ids and labels', () => {
    expect(new Set(ORIGIN_GROUPS.map((group) => group.id)).size).toBe(
      ORIGIN_GROUPS.length,
    )
    expect(new Set(ORIGIN_GROUPS.map((group) => group.label)).size).toBe(
      ORIGIN_GROUPS.length,
    )
  })
})
