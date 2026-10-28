import { describe, expect, it } from 'vitest'
import { countGenresAndFilters } from './filter-count'

describe('countGenresAndFilters', () => {
  it('counts distinct genres once, ignoring case and blanks', () => {
    expect(
      countGenresAndFilters({
        genres: ['Action', 'action', 'Drama', ' ', 'Horror'],
        groups: [],
      }),
    ).toBe(3)
  })

  it('adds every enabled filter chip and skips "all" and disabled chips', () => {
    expect(
      countGenresAndFilters({
        genres: ['Action'],
        groups: [
          [{ id: 'all' }, { id: 'movies' }, { id: 'series', disabled: true }],
          [{ id: 'a' }, { id: 'b' }],
          [1970, 1980, 1990],
          [6, 7, 8],
        ],
      }),
    ).toBe(1 + 1 + 2 + 3 + 3)
  })

  it('moves with its sources', () => {
    const base = { genres: ['A', 'B'], groups: [[{ id: 'x' }]] }
    const before = countGenresAndFilters(base)
    expect(countGenresAndFilters({ ...base, genres: ['A', 'B', 'C'] })).toBe(
      before + 1,
    )
  })
})
