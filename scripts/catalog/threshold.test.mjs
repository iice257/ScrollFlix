import { describe, expect, it } from 'vitest'
import { chooseThreshold, cutByVotes } from './threshold.mjs'

const filmsWith = (voteCounts) =>
  new Map(voteCounts.map((voteCount, i) => [i + 1, { id: i + 1, voteCount }]))

describe('chooseThreshold', () => {
  it('uses the vote count of the target-th film', () => {
    const films = filmsWith([500, 400, 300, 200, 100, 50])
    expect(chooseThreshold(films, 3)).toEqual({ minVotes: 300, count: 3 })
  })

  it('includes every film tied at the threshold', () => {
    const films = filmsWith([500, 300, 300, 300, 100])
    // The 2nd film has 300 votes, and so do two more.
    expect(chooseThreshold(films, 2)).toEqual({ minVotes: 300, count: 4 })
  })

  it('keeps everything, at the floor, with fewer candidates than the target', () => {
    const films = filmsWith([500, 40, 12])
    expect(chooseThreshold(films, 100, 10)).toEqual({ minVotes: 10, count: 3 })
    expect(chooseThreshold(new Map(), 100, 10)).toEqual({
      minVotes: 10,
      count: 0,
    })
  })

  it('keeps everything when the target is exactly met', () => {
    const films = filmsWith([500, 40, 12])
    expect(chooseThreshold(films, 3, 10)).toEqual({ minVotes: 10, count: 3 })
  })

  it('never goes below the floor', () => {
    const films = filmsWith([500, 40, 3, 2, 1])
    expect(chooseThreshold(films, 4, 10)).toEqual({ minVotes: 10, count: 2 })
  })
})

describe('cutByVotes', () => {
  it('returns the films at or above the threshold', () => {
    const films = filmsWith([500, 300, 300, 100])
    const cut = cutByVotes(films, 2)
    expect(cut.minVotes).toBe(300)
    expect(cut.films.map((film) => film.id).sort()).toEqual([1, 2, 3])
    expect(cut.count).toBe(cut.films.length)
  })
})
