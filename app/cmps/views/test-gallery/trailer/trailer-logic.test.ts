import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEAD_TRAILERS_KEY,
  markTrailerDead,
  nextKey,
  readDeadTrailers,
  trailerButtonFor,
  youtubeSearchUrl,
} from './trailer-logic'

beforeEach(() => window.localStorage.clear())

describe('nextKey', () => {
  it('returns the first key that has not failed', () => {
    expect(nextKey(['a', 'b', 'c'], new Set())).toBe('a')
    expect(nextKey(['a', 'b', 'c'], new Set(['a']))).toBe('b')
    expect(nextKey(['a', 'b', 'c'], new Set(['a', 'c']))).toBe('b')
  })

  it('returns null when every key has failed or there are none', () => {
    expect(nextKey(['a', 'b'], new Set(['a', 'b']))).toBeNull()
    expect(nextKey([], new Set())).toBeNull()
  })
})

describe('dead trailer store', () => {
  it('remembers dead keys without repeating them', () => {
    markTrailerDead('x')
    markTrailerDead('y')
    markTrailerDead('x')
    expect([...readDeadTrailers()]).toEqual(['y', 'x'])
  })

  it('keeps at most 500, dropping the oldest', () => {
    for (let i = 0; i < 520; i += 1) markTrailerDead(`k${i}`)
    const dead = readDeadTrailers()
    expect(dead.size).toBe(500)
    expect(dead.has('k0')).toBe(false)
    expect(dead.has('k519')).toBe(true)
  })

  it('ignores garbage in storage', () => {
    window.localStorage.setItem(DEAD_TRAILERS_KEY, '{not json')
    expect(readDeadTrailers().size).toBe(0)
    window.localStorage.setItem(DEAD_TRAILERS_KEY, '[1,"a",null]')
    expect([...readDeadTrailers()]).toEqual(['a'])
  })

  it('never throws when storage is blocked', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
    try {
      expect(() => markTrailerDead('x')).not.toThrow()
    } finally {
      Storage.prototype.setItem = original
    }
  })
})

describe('youtubeSearchUrl', () => {
  it('searches for the title, year and "trailer"', () => {
    expect(youtubeSearchUrl('Amélie', '2001')).toBe(
      'https://www.youtube.com/results?search_query=Am%C3%A9lie%202001%20trailer',
    )
  })

  it('leaves out a missing year', () => {
    expect(youtubeSearchUrl('Heat', '----')).toBe(
      'https://www.youtube.com/results?search_query=Heat%20trailer',
    )
  })
})

describe('trailerButtonFor', () => {
  it('hides with no keys, plays with a live key, goes to YouTube when all are dead', () => {
    expect(trailerButtonFor(undefined, new Set())).toEqual({ kind: 'none' })
    expect(trailerButtonFor([], new Set())).toEqual({ kind: 'none' })
    expect(trailerButtonFor(['a', 'b'], new Set(['a']))).toEqual({
      kind: 'play',
    })
    expect(trailerButtonFor(['a'], new Set(['a']))).toEqual({
      kind: 'youtube',
    })
  })
})
