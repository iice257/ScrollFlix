import { describe, expect, it } from 'vitest'
import {
  MIN_SAVED_FOR_TASTE,
  type TasteMovie,
  affinity,
  buildTasteProfile,
  leadingMood,
  moodsOf,
  pickWeighted,
  tasteWeight,
  topGenres,
} from './taste'

const film = (
  id: string,
  genres: string[],
  ratingValue: number | null = 6,
): TasteMovie => ({ id, genres, ratingValue })

const darkSaved = [
  film('1', ['Horror', 'Thriller']),
  film('2', ['Crime', 'Mystery']),
  film('3', ['Horror', 'Mystery'], 8),
]

describe('moodsOf', () => {
  it('maps genres and ratings onto mood worlds', () => {
    expect(moodsOf(film('a', ['Horror'], 8))).toEqual(
      expect.arrayContaining(['dark', 'weird', 'highRated']),
    )
    expect(moodsOf(film('b', ['Romance'], 5))).toEqual(['romantic'])
    expect(moodsOf(film('c', ['Documentary'], null))).toEqual([])
  })
})

describe('buildTasteProfile', () => {
  it('needs a few saved films before it says anything', () => {
    expect(buildTasteProfile([])).toBeNull()
    expect(
      buildTasteProfile(darkSaved.slice(0, MIN_SAVED_FOR_TASTE - 1)),
    ).toBeNull()
    expect(buildTasteProfile(darkSaved)).not.toBeNull()
  })

  it('leans on the genres and moods that repeat', () => {
    const profile = buildTasteProfile(darkSaved)
    expect(profile?.genres.Horror).toBe(1)
    expect(profile?.genres.Mystery).toBe(1)
    expect(profile?.genres.Thriller).toBeCloseTo(0.5)
    expect(leadingMood(profile)).toBe('dark')
    expect(topGenres(profile, 2)).toEqual(['Horror', 'Mystery'])
  })
})

describe('affinity and weight', () => {
  const profile = buildTasteProfile(darkSaved)

  it('rewards films that match and ignores ones that do not', () => {
    expect(profile).not.toBeNull()
    if (!profile) return
    expect(affinity(film('x', ['Horror', 'Mystery']), profile)).toBe(1)
    expect(affinity(film('y', ['Comedy']), profile)).toBe(0)
    expect(affinity(film('z', []), profile)).toBe(0)
  })

  it('is neutral without a profile and never below one', () => {
    expect(tasteWeight(film('x', ['Horror']), null)).toBe(1)
    expect(tasteWeight(film('y', ['Comedy']), profile)).toBe(1)
    expect(tasteWeight(film('x', ['Horror', 'Mystery']), profile)).toBe(3)
  })
})

describe('pickWeighted', () => {
  it('is uniform for equal weights', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(
      pickWeighted(
        items,
        () => 1,
        () => 0,
      ),
    ).toBe('a')
    expect(
      pickWeighted(
        items,
        () => 1,
        () => 0.99,
      ),
    ).toBe('d')
  })

  it('favours the heavier item in proportion', () => {
    const items = ['light', 'heavy']
    const weight = (item: string) => (item === 'heavy' ? 3 : 1)
    // The heavy item owns the last 75% of the range.
    expect(pickWeighted(items, weight, () => 0.2)).toBe('light')
    expect(pickWeighted(items, weight, () => 0.3)).toBe('heavy')
    expect(pickWeighted(items, weight, () => 0.99)).toBe('heavy')
  })

  it('handles nothing to pick and all-zero weights', () => {
    expect(
      pickWeighted(
        [],
        () => 1,
        () => 0.5,
      ),
    ).toBeNull()
    expect(
      pickWeighted(
        ['a', 'b'],
        () => 0,
        () => 0.9,
      ),
    ).toBe('b')
  })
})
