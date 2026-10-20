import { describe, expect, it } from 'vitest'
import { createBag, humanize, panFromPointer, recencyDb } from './sound-variety'

// A repeatable dice roll, so a failure can be reproduced.
const seeded = (start: number) => {
  let seed = start
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('shuffle bag', () => {
  it('uses every variant once before any comes round again', () => {
    const bag = createBag(seeded(1))
    for (let round = 0; round < 20; round += 1) {
      const seen = new Set(Array.from({ length: 6 }, () => bag.next(6)))
      expect(seen.size).toBe(6)
    }
  })

  it('never repeats a variant, even across the seam between rounds', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const bag = createBag(seeded(seed))
      let last = -1
      for (let i = 0; i < 300; i += 1) {
        const next = bag.next(5)
        expect(next).not.toBe(last)
        last = next
      }
    }
  })

  it('copes with one variant, and with the count changing', () => {
    const bag = createBag(seeded(3))
    expect(bag.next(1)).toBe(0)
    expect(bag.next(1)).toBe(0)
    for (let i = 0; i < 20; i += 1) {
      expect(bag.next(i % 2 ? 3 : 7)).toBeLessThan(i % 2 ? 3 : 7)
    }
  })
})

describe('humanize', () => {
  it('stays inside the stated pitch and level ranges', () => {
    const random = seeded(9)
    for (let i = 0; i < 500; i += 1) {
      const h = humanize({ semis: 0.5, gainDb: 1.5 }, 1000, random)
      expect(Math.abs(h.semis)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(h.gainDb)).toBeLessThanOrEqual(1.5)
      expect(h.rate).toBeCloseTo(2 ** (h.semis / 12), 10)
    }
  })

  it('really varies: 200 plays give many different pitches and levels', () => {
    const random = seeded(4)
    const plays = Array.from({ length: 200 }, () =>
      humanize({ semis: 0.5, gainDb: 1.5 }, 1000, random),
    )
    // 1 semitone of range in 0.01 buckets: 200 random draws fill ~85 of 100.
    expect(new Set(plays.map((p) => p.semis.toFixed(2))).size).toBeGreaterThan(
      60,
    )
    const levels = plays.map((p) => p.gainDb)
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(2.5)
  })

  it('plays a rapid repeat softer than an unhurried one', () => {
    expect(recencyDb(1000)).toBe(0)
    expect(recencyDb(400)).toBe(0)
    expect(recencyDb(30)).toBe(-4)
    expect(recencyDb(100)).toBeLessThan(recencyDb(300))
    expect(recencyDb(300)).toBeLessThan(0)
  })
})

describe('stereo position', () => {
  it('follows the pointer, calm in the middle and never fully hard', () => {
    expect(panFromPointer(500, 1000)).toBeCloseTo(0)
    expect(panFromPointer(0, 1000)).toBeCloseTo(-0.7)
    expect(panFromPointer(1000, 1000)).toBeCloseTo(0.7)
    expect(panFromPointer(2000, 1000)).toBeCloseTo(0.7)
    expect(panFromPointer(250, 1000)).toBeLessThan(0)
  })

  it('is centred when there is nothing to measure', () => {
    expect(panFromPointer(Number.NaN, 1000)).toBe(0)
    expect(panFromPointer(10, 0)).toBe(0)
  })
})
