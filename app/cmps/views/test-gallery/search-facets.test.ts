import { describe, expect, it } from 'vitest'
import { type FacetCatalog, suggestFacets } from './search-facets'

const catalog: FacetCatalog = {
  genres: ['Action', 'Comedy', 'Drama', 'Horror', 'Science Fiction'],
  moods: [
    { id: 'fast', label: 'Fast' },
    { id: 'dark', label: 'Dark' },
    { id: 'funny', label: 'Funny' },
    { id: 'highRated', label: 'High-rated' },
  ],
  runtimes: [
    { id: 'movieUnder90', label: 'Under 1 hr 30' },
    { id: 'movieOver120', label: 'Over 2 hrs' },
  ],
  sorts: [
    { key: 'year', label: 'Year', asc: 'Oldest first', desc: 'Newest first' },
    {
      key: 'runtime',
      label: 'Runtime',
      asc: 'Shortest first',
      desc: 'Longest first',
    },
  ],
}

const ids = (query: string) => suggestFacets(query, catalog).map((s) => s.id)

describe('suggestFacets', () => {
  it('finds a genre by name or prefix', () => {
    expect(ids('comedy')[0]).toBe('genre:Comedy')
    expect(ids('horr')[0]).toBe('genre:Horror')
    expect(ids('science')).toContain('genre:Science Fiction')
  })

  it('ignores case and accents', () => {
    expect(ids('DRAMA')[0]).toBe('genre:Drama')
  })

  it('finds moods by label and by the words people use', () => {
    expect(ids('dark')).toContain('mood:dark')
    expect(ids('scary')).toContain('mood:dark')
    expect(ids('laugh')).toContain('mood:funny')
  })

  it('finds sorts by what they do', () => {
    expect(ids('newest')[0]).toBe('sort:year:desc')
    expect(ids('oldest')[0]).toBe('sort:year:asc')
    expect(ids('shortest')).toContain('sort:runtime:asc')
  })

  it('finds runtimes', () => {
    expect(ids('short')).toContain('runtime:movieUnder90')
    expect(ids('epic')).toContain('runtime:movieOver120')
  })

  it('reads years and decades from numbers', () => {
    expect(ids('1994')[0]).toBe('year:1994')
    expect(ids('90s')[0]).toBe('decade:1990')
    expect(ids('1980s')[0]).toBe('decade:1980')
    expect(ids('10s')[0]).toBe('decade:2010')
  })

  it('reads a rating from "7+" or "rating 8"', () => {
    expect(ids('7+')[0]).toBe('rating:7')
    expect(ids('rating 8')[0]).toBe('rating:8')
    expect(ids('7.5+')[0]).toBe('rating:7.5')
  })

  it('does not suggest a bare number as a rating', () => {
    expect(ids('7')).not.toContain('rating:7')
  })

  it('stays quiet for short or unrelated queries', () => {
    expect(ids('a')).toEqual([])
    expect(ids('')).toEqual([])
    expect(ids('zzzzqq')).toEqual([])
  })

  it('matches every word of a longer phrase', () => {
    expect(ids('newest first')).toContain('sort:year:desc')
    expect(ids('science fic')).toContain('genre:Science Fiction')
  })

  it('caps the number of suggestions', () => {
    expect(suggestFacets('re', catalog, 3).length).toBeLessThanOrEqual(3)
  })
})
