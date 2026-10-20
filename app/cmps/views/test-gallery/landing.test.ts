import { describe, expect, it } from 'vitest'
import { filmLinkId, matchesFilmLink, pickLandingMovie } from './landing'

const movies = [{ id: 'c1' }, { id: 'c38579' }, { id: 'c77' }, { id: 'c4' }]

describe('pickLandingMovie', () => {
  it('never returns Marmaduke, whatever the random value', () => {
    for (let step = 0; step <= 100; step += 1) {
      const picked = pickLandingMovie(movies, () => step / 100)
      expect(picked?.id).not.toBe('c38579')
    }
  })

  it('maps random() across the eligible movies', () => {
    expect(pickLandingMovie(movies, () => 0)?.id).toBe('c1')
    expect(pickLandingMovie(movies, () => 0.5)?.id).toBe('c77')
    expect(pickLandingMovie(movies, () => 0.999)?.id).toBe('c4')
  })

  it('returns null for an empty set and falls back if everything is excluded', () => {
    expect(pickLandingMovie([], () => 0.3)).toBeNull()
    expect(pickLandingMovie([{ id: 'c38579' }], () => 0.3)?.id).toBe('c38579')
  })

  it('does not match a TMDB id that merely contains the excluded digits', () => {
    expect(pickLandingMovie([{ id: 'c1385790' }], () => 0)?.id).toBe('c1385790')
  })
})

describe('film links', () => {
  it('uses the TMDB id, which survives a reordered catalogue', () => {
    expect(filmLinkId('c27205')).toBe('27205')
    expect(filmLinkId('412-27205')).toBe('27205')
    expect(filmLinkId('27205')).toBe('27205')
  })

  it('matches a link against the full id or the TMDB id', () => {
    expect(matchesFilmLink({ id: 'c27205' }, '27205')).toBe(true)
    expect(matchesFilmLink({ id: 'c27205' }, 'c27205')).toBe(true)
    expect(matchesFilmLink({ id: 'c27205' }, '99')).toBe(false)
  })

  it('still finds a film from a link shared before catalogue v2', () => {
    expect(matchesFilmLink({ id: 'c27205' }, '412-27205')).toBe(true)
    expect(matchesFilmLink({ id: 'c27205' }, '412-99')).toBe(false)
  })
})
