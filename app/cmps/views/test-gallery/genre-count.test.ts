import { describe, expect, it } from 'vitest'
import { formatGenreCount } from './genre-count'

describe('formatGenreCount', () => {
  it('is exact below 1,000', () => {
    expect(formatGenreCount(0)).toBe('0')
    expect(formatGenreCount(7)).toBe('7')
    expect(formatGenreCount(999)).toBe('999')
  })

  it('shows exactly 1,000 as 1k', () => {
    expect(formatGenreCount(1000)).toBe('1k')
  })

  it('shows thousands to one decimal', () => {
    expect(formatGenreCount(2300)).toBe('2.3k')
    expect(formatGenreCount(2349)).toBe('2.3k')
    expect(formatGenreCount(2350)).toBe('2.4k')
    expect(formatGenreCount(4300)).toBe('4.3k')
    expect(formatGenreCount(4321)).toBe('4.3k')
    expect(formatGenreCount(1049)).toBe('1k')
    expect(formatGenreCount(1050)).toBe('1.1k')
  })

  it('drops the decimal when it rounds to a whole thousand', () => {
    expect(formatGenreCount(2960)).toBe('3k')
    expect(formatGenreCount(9990)).toBe('10k')
    expect(formatGenreCount(10000)).toBe('10k')
  })
})
