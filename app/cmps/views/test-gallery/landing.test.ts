import { describe, expect, it } from 'vitest'
import { pickLandingMovie } from './landing'

const movies = [
  { id: '0-1' },
  { id: '28-38579' },
  { id: '5-77' },
  { id: '9-4' },
]

describe('pickLandingMovie', () => {
  it('never returns Marmaduke, whatever the random value', () => {
    for (let step = 0; step <= 100; step += 1) {
      const picked = pickLandingMovie(movies, () => step / 100)
      expect(picked?.id).not.toBe('28-38579')
    }
  })

  it('maps random() across the eligible movies', () => {
    expect(pickLandingMovie(movies, () => 0)?.id).toBe('0-1')
    expect(pickLandingMovie(movies, () => 0.5)?.id).toBe('5-77')
    expect(pickLandingMovie(movies, () => 0.999)?.id).toBe('9-4')
  })

  it('returns null for an empty set and falls back if everything is excluded', () => {
    expect(pickLandingMovie([], () => 0.3)).toBeNull()
    expect(pickLandingMovie([{ id: '1-38579' }], () => 0.3)?.id).toBe('1-38579')
  })

  it('does not match a TMDB id that merely contains the excluded digits', () => {
    expect(pickLandingMovie([{ id: '1-1385790' }], () => 0)?.id).toBe(
      '1-1385790',
    )
  })
})
