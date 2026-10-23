import { describe, expect, it } from 'vitest'
import { nextRevealStart } from './infinite-movie-menu'

describe('nextRevealStart', () => {
  it('starts a lone poster straight away', () => {
    expect(nextRevealStart(1000, 0, 5)).toEqual({ start: 1000, cursor: 1009 })
  })

  it('queues posters that land together a few ms apart', () => {
    let cursor = 0
    const starts: number[] = []
    for (let index = 0; index < 4; index += 1) {
      const next = nextRevealStart(1000, cursor, index)
      starts.push(next.start)
      cursor = next.cursor
    }
    expect(starts).toEqual([1000, 1009, 1018, 1027])
  })

  it('never starts one before the poster has landed', () => {
    const next = nextRevealStart(2000, 500, 3)
    expect(next.start).toBe(2000)
  })

  it('spreads a long backlog instead of bunching it at the end', () => {
    const now = 1000
    const cursor = now + 5000
    const starts = new Set<number>()
    for (let index = 0; index < 60; index += 1) {
      const next = nextRevealStart(now, cursor, index, false, 9, 420)
      expect(next.start).toBeGreaterThanOrEqual(now)
      expect(next.start).toBeLessThan(now + 420)
      expect(next.cursor).toBe(cursor)
      starts.add(next.start)
    }
    expect(starts.size).toBeGreaterThan(30)
  })

  it('does not stagger with reduced motion', () => {
    expect(nextRevealStart(1000, 1300, 2, true)).toEqual({
      start: 1000,
      cursor: 1300,
    })
  })
})
