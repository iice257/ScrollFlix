import { describe, expect, it } from 'vitest'
import {
  PosterIndex,
  type PosterIndexEntry,
  chooseRandomIds,
  firstByKey,
  isCacheablePosterUrl,
  planEviction,
} from './poster-cache'

const entry = (key: string, size = 10, pinned = false): PosterIndexEntry => ({
  key,
  size,
  pinned,
})

describe('planEviction', () => {
  it('does nothing under both caps', () => {
    const entries = [entry('a'), entry('b'), entry('c')]
    expect(planEviction(entries, 5, 1000)).toEqual([])
  })

  it('drops the oldest entries once the count cap is exceeded', () => {
    const entries = Array.from({ length: 11 }, (_, i) => entry(`p${i}`))
    const dropped = planEviction(entries, 10, 10_000)
    // Trims to 90% of the cap in one batch: 9 left, so 2 dropped.
    expect(dropped).toEqual(['p0', 'p1'])
  })

  it('drops by bytes when the size cap is exceeded', () => {
    const entries = [entry('a', 60), entry('b', 60), entry('c', 60)]
    // 180 bytes > 100; target 90 bytes.
    expect(planEviction(entries, 100, 100)).toEqual(['a', 'b'])
  })

  it('never drops pinned entries', () => {
    const entries = [entry('a', 10, true), entry('b'), entry('c'), entry('d')]
    const dropped = planEviction(entries, 3, 10_000)
    expect(dropped).not.toContain('a')
    expect(dropped).toEqual(['b', 'c'])
  })

  it('stops when only pinned entries are left', () => {
    const entries = [entry('a', 10, true), entry('b', 10, true)]
    expect(planEviction(entries, 1, 10_000)).toEqual([])
  })
})

describe('PosterIndex', () => {
  it('keeps least recently used first', () => {
    const index = new PosterIndex()
    index.add('a', 1)
    index.add('b', 1)
    index.add('c', 1)
    index.touch('a')
    expect(index.list().map((e) => e.key)).toEqual(['b', 'c', 'a'])
  })

  it('keeps a pin when an entry is added again', () => {
    const index = new PosterIndex()
    index.add('a', 1, true)
    index.add('a', 2)
    expect(index.list()[0]).toEqual({ key: 'a', size: 2, pinned: true })
  })

  it('round-trips through JSON and ignores junk rows', () => {
    const index = new PosterIndex()
    index.add('a', 5, true)
    index.add('b', 7)
    const restored = PosterIndex.fromJSON(
      JSON.parse(JSON.stringify(index)).concat([['bad'], 3, null]),
    )
    expect(restored.list()).toEqual(index.list())
    expect(PosterIndex.fromJSON('nope').size).toBe(0)
  })
})

describe('chooseRandomIds', () => {
  const pool = Array.from({ length: 20 }, (_, i) => `m${i}`)

  it('returns the requested number of distinct ids', () => {
    const chosen = chooseRandomIds(pool, 8, [])
    expect(chosen).toHaveLength(8)
    expect(new Set(chosen).size).toBe(8)
  })

  it('keeps earlier picks that are still around', () => {
    const chosen = chooseRandomIds(pool, 5, ['m3', 'gone', 'm9'], () => 0)
    expect(chosen.slice(0, 2)).toEqual(['m3', 'm9'])
    expect(chosen).not.toContain('gone')
    expect(chosen).toHaveLength(5)
  })

  it('returns fewer when the pool is small', () => {
    expect(chooseRandomIds(['a', 'b'], 5, [])).toHaveLength(2)
  })
})

describe('firstByKey', () => {
  it('returns the smallest keys in order without a full sort', () => {
    const items = ['d', 'b', 'e', 'a', 'c', 'b2'].map((key) => ({ key }))
    expect(firstByKey(items, (item) => item.key, 3).map((i) => i.key)).toEqual([
      'a',
      'b',
      'b2',
    ])
  })

  it('handles fewer items than asked for', () => {
    expect(firstByKey(['b', 'a'], (item) => item, 5)).toEqual(['a', 'b'])
    expect(firstByKey([], (item: string) => item, 5)).toEqual([])
  })
})

describe('isCacheablePosterUrl', () => {
  it('accepts only public poster URLs', () => {
    expect(isCacheablePosterUrl('https://image.tmdb.org/t/p/w154/x.jpg')).toBe(
      true,
    )
    expect(isCacheablePosterUrl('https://example.com/x.jpg')).toBe(false)
    expect(isCacheablePosterUrl('/media/poster-sprite.jpg')).toBe(false)
  })
})
