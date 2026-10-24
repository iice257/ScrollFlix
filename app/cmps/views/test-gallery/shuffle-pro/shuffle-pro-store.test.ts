import { beforeEach, describe, expect, it } from 'vitest'
import {
  SHUFFLE_PRO_STORAGE_KEY,
  parseShuffleProData,
  recordRun,
  shuffleProStore,
} from './shuffle-pro-store'

describe('shuffle pro store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    shuffleProStore.reset()
  })

  it('starts empty and treats bad data as empty', () => {
    const empty = {
      found: {},
      moodPaths: {},
      totalRuns: 0,
      bestStreak: 0,
    }
    expect(parseShuffleProData(null)).toEqual(empty)
    expect(parseShuffleProData('{nope')).toEqual(empty)
    expect(parseShuffleProData('{"v":2,"found":{}}')).toEqual(empty)
  })

  it('records a path with count, first and last time', () => {
    const first = recordRun(
      {
        found: {},
        moodPaths: {},
        totalRuns: 0,
        bestStreak: 0,
      },
      'frost',
      100,
    )
    const second = recordRun(first, 'frost', 250)
    expect(second.found.frost).toEqual({ count: 2, firstAt: 100, lastAt: 250 })
    expect(second.totalRuns).toBe(2)
  })

  it('persists found paths under a versioned key and survives a reload', () => {
    shuffleProStore.recordRun('jade', 500)
    const raw = window.localStorage.getItem(SHUFFLE_PRO_STORAGE_KEY)
    expect(raw).toContain('"v":1')
    const restored = parseShuffleProData(raw)
    expect(restored.found.jade).toEqual({ count: 1, firstAt: 500, lastAt: 500 })
  })

  it('keeps the longest streak and only grows it', () => {
    shuffleProStore.recordStreak(4)
    shuffleProStore.recordStreak(2)
    expect(shuffleProStore.get().bestStreak).toBe(4)
    shuffleProStore.recordStreak(7)
    expect(shuffleProStore.get().bestStreak).toBe(7)
    const restored = parseShuffleProData(
      window.localStorage.getItem(SHUFFLE_PRO_STORAGE_KEY),
    )
    expect(restored.bestStreak).toBe(7)
    // A run does not wipe it.
    shuffleProStore.recordRun('frost', 1)
    expect(shuffleProStore.get().bestStreak).toBe(7)
  })

  it('ignores the old repeat and demo settings that were saved', () => {
    window.localStorage.setItem(
      SHUFFLE_PRO_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        found: { frost: { count: 1, firstAt: 1, lastAt: 2 } },
        repeatFound: true,
        demoMode: true,
      }),
    )
    const restored = parseShuffleProData(
      window.localStorage.getItem(SHUFFLE_PRO_STORAGE_KEY),
    )
    expect(restored.found.frost?.count).toBe(1)
    expect(restored).not.toHaveProperty('repeatFound')
    expect(restored).not.toHaveProperty('demoMode')
  })

  it('notifies subscribers and can be reset', () => {
    let calls = 0
    const unsubscribe = shuffleProStore.subscribe(() => {
      calls += 1
    })
    shuffleProStore.recordRun('amethyst')
    expect(calls).toBe(1)
    expect(shuffleProStore.get().found.amethyst?.count).toBe(1)
    shuffleProStore.reset()
    expect(shuffleProStore.get().found).toEqual({})
    unsubscribe()
    shuffleProStore.recordRun('gold')
    expect(calls).toBe(2)
  })

  it('keeps mood paths apart from the tiers and persists them', () => {
    shuffleProStore.recordMoodRun('resonance', 700)
    shuffleProStore.recordMoodRun('resonance', 900)
    const data = shuffleProStore.get()
    expect(data.moodPaths.resonance).toEqual({
      count: 2,
      firstAt: 700,
      lastAt: 900,
    })
    expect(data.found).toEqual({})
    expect(data.totalRuns).toBe(2)
    const restored = parseShuffleProData(
      window.localStorage.getItem(SHUFFLE_PRO_STORAGE_KEY),
    )
    expect(restored.moodPaths.resonance?.count).toBe(2)
    shuffleProStore.reset()
    expect(shuffleProStore.get().moodPaths).toEqual({})
  })

  it('reads data saved before mood paths existed', () => {
    const old = JSON.stringify({
      v: 1,
      found: { frost: { count: 2, firstAt: 1, lastAt: 2 } },
      totalRuns: 2,
      bestStreak: 3,
    })
    const restored = parseShuffleProData(old)
    expect(restored.found.frost?.count).toBe(2)
    expect(restored.moodPaths).toEqual({})
  })
})
