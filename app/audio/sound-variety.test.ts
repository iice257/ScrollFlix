import { describe, expect, it } from 'vitest'
import {
  SPIN_MAX_RATE,
  SPIN_MIN_SPEED,
  createBag,
  createSpinTicker,
  humanize,
  panFromPointer,
  recencyDb,
  spinStrength,
} from './sound-variety'

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

describe('spin ticks', () => {
  const ticksOver = (speed: number, seconds: number) => {
    const ticker = createSpinTicker(seeded(8))
    const out = []
    for (let t = 0; t < seconds * 1000; t += 16) {
      out.push(...ticker.update(speed, 16))
    }
    return out
  }

  it('are silent while the globe drifts or stands still', () => {
    expect(ticksOver(0, 2)).toHaveLength(0)
    expect(ticksOver(SPIN_MIN_SPEED * 0.9, 2)).toHaveLength(0)
  })

  it('come faster as the globe speeds up, but never faster than the cap', () => {
    const slow = ticksOver(1, 2).length
    const medium = ticksOver(4, 2).length
    const fast = ticksOver(40, 2).length
    expect(slow).toBeGreaterThan(0)
    expect(medium).toBeGreaterThan(slow)
    expect(fast).toBeGreaterThanOrEqual(medium)
    expect(fast / 2).toBeLessThanOrEqual(SPIN_MAX_RATE + 3)
  })

  it('get louder and higher with speed', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const slow = ticksOver(1, 3)
    const fast = ticksOver(12, 3)
    expect(mean(fast.map((t) => t.gainDb))).toBeGreaterThan(
      mean(slow.map((t) => t.gainDb)) + 4,
    )
    expect(mean(fast.map((t) => t.rate))).toBeGreaterThan(
      mean(slow.map((t) => t.rate)),
    )
    expect(spinStrength(0)).toBe(0)
    expect(spinStrength(100)).toBe(1)
  })

  it('stays quiet after the globe stops, even if frames arrive late', () => {
    const ticker = createSpinTicker(seeded(1))
    ticker.update(5, 16)
    expect(ticker.update(0, 16)).toHaveLength(0)
    expect(ticker.update(5, 5000).length).toBeLessThanOrEqual(2)
  })
})
