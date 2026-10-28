import { describe, expect, it } from 'vitest'
import type { TestMovie } from './catalog-loader'
import { editDistance, normalizeSearch, searchMovies } from './film-search'

const film = (
  id: string,
  title: string,
  year: string,
  genres: string[],
  countries: string,
  extra: Partial<TestMovie> = {},
) =>
  ({
    id,
    title,
    year,
    genres,
    countries,
    voteCount: 1000,
    tagline: '',
    overview: '',
    ...extra,
  }) as TestMovie

const catalogue = [
  film(
    'dk',
    'The Dark Knight',
    '2008',
    ['Action', 'Crime'],
    'United States of America',
  ),
  film(
    'dkr',
    'The Dark Knight Rises',
    '2012',
    ['Action'],
    'United States of America',
  ),
  film('dd', 'Dark Waters', '2019', ['Drama'], 'United States of America'),
  film(
    'god',
    'The Godfather',
    '1972',
    ['Crime', 'Drama'],
    'United States of America',
  ),
  film('para', 'Parasite', '2019', ['Thriller', 'Drama'], 'South Korea', {
    originalTitle: '기생충',
  }),
  film('train', 'Train to Busan', '2016', ['Horror', 'Action'], 'South Korea'),
  film('spirit', 'Spirited Away', '2001', ['Animation', 'Family'], 'Japan', {
    originalTitle: '千と千尋の神隠し',
  }),
  film(
    'lion',
    'The Lion King',
    '1994',
    ['Animation', 'Family'],
    'United States of America',
  ),
  film('lagos', 'Lionheart', '2018', ['Drama', 'Comedy'], 'Nigeria'),
  film('amelie', 'Amélie', '2001', ['Comedy', 'Romance'], 'France'),
]
const titles = (movies: TestMovie[] | null) =>
  (movies ?? []).map((movie) => movie.title)

describe('normalizeSearch', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalizeSearch("  Amélie: Le  Fabuleux Destin d'Amélie ")).toBe(
      'amelie le fabuleux destin d amelie',
    )
  })
})

describe('editDistance', () => {
  it('counts a swap as one edit and stops early past the ceiling', () => {
    expect(editDistance('godfater', 'godfather', 2)).toBe(1)
    expect(editDistance('parasite', 'parasite', 2)).toBe(0)
    expect(editDistance('abcdef', 'uvwxyz', 1)).toBe(2)
    expect(editDistance('short', 'considerably longer', 2)).toBe(3)
  })
})

describe('searchMovies', () => {
  it('leaves an empty search alone', () => {
    expect(searchMovies(catalogue, '   ')).toBeNull()
    expect(searchMovies(catalogue, '!!')).toBeNull()
  })

  it('finds a title by whole words, a prefix, or any part of a word', () => {
    expect(titles(searchMovies(catalogue, 'godfather'))).toEqual([
      'The Godfather',
    ])
    expect(titles(searchMovies(catalogue, 'paras'))).toEqual(['Parasite'])
    expect(titles(searchMovies(catalogue, 'THE LION'))[0]).toBe('The Lion King')
  })

  it('puts the exact title before longer ones, and well-known before obscure', () => {
    expect(titles(searchMovies(catalogue, 'the dark knight'))).toEqual([
      'The Dark Knight',
      'The Dark Knight Rises',
    ])
    const crowded = [
      film('a', 'Dark Night', '2000', [], '', { voteCount: 5 }),
      film('b', 'Dark Night', '2001', [], '', { voteCount: 50_000 }),
    ]
    expect(searchMovies(crowded, 'dark night')?.map((m) => m.id)).toEqual([
      'b',
      'a',
    ])
  })

  it('forgives typos, swapped letters and missing accents', () => {
    expect(titles(searchMovies(catalogue, 'godfater'))).toEqual([
      'The Godfather',
    ])
    expect(titles(searchMovies(catalogue, 'paraiste'))).toEqual(['Parasite'])
    expect(titles(searchMovies(catalogue, 'amelie'))).toEqual(['Amélie'])
    expect(titles(searchMovies(catalogue, 'spirted awya'))[0]).toBe(
      'Spirited Away',
    )
  })

  it('reads a year beside a title, or on its own', () => {
    expect(titles(searchMovies(catalogue, 'dark knight 2012'))[0]).toBe(
      'The Dark Knight Rises',
    )
    expect(titles(searchMovies(catalogue, 'dark knight 2008'))[0]).toBe(
      'The Dark Knight',
    )
    expect(titles(searchMovies(catalogue, '2001')).sort()).toEqual([
      'Amélie',
      'Spirited Away',
    ])
  })

  it('reads a decade', () => {
    expect(titles(searchMovies(catalogue, '90s animation'))).toEqual([
      'The Lion King',
    ])
  })

  it('reads genres, their everyday words, and where a film is from', () => {
    expect(titles(searchMovies(catalogue, 'korean horror'))).toEqual([
      'Train to Busan',
    ])
    expect(titles(searchMovies(catalogue, 'scary'))).toEqual(['Train to Busan'])
    expect(titles(searchMovies(catalogue, 'nollywood'))).toEqual(['Lionheart'])
    expect(titles(searchMovies(catalogue, 'japanese animation'))).toEqual([
      'Spirited Away',
    ])
    expect(titles(searchMovies(catalogue, 'south korea'))).toEqual([
      'Parasite',
      'Train to Busan',
    ])
  })

  it('matches an original title', () => {
    expect(titles(searchMovies(catalogue, '기생충'))).toEqual(['Parasite'])
  })

  it('uses a loaded tagline or overview as a hint', () => {
    const withText = [
      film('r', 'Machine', '2010', [], '', {
        overview: 'A robot learns to love.',
      }),
      film('x', 'Other', '2011', [], ''),
    ]
    expect(titles(searchMovies(withText, 'robot'))).toEqual(['Machine'])
  })

  it('falls back to the films matching most words when none match all', () => {
    expect(titles(searchMovies(catalogue, 'godfather zebra'))).toEqual([
      'The Godfather',
    ])
  })

  it('returns nothing for a word no film comes near', () => {
    expect(titles(searchMovies(catalogue, 'qqqqqq'))).toEqual([])
  })
})
