import { describe, expect, it } from 'vitest'
import {
  LIMITER_KNEE,
  createCueLimiter,
  softLimit,
  softLimitCurve,
} from './sound-engine'

describe('cue limiter', () => {
  it('drops a cue that fires again inside its minimum interval', () => {
    const limiter = createCueLimiter({ tick: 55 }, 8)
    expect(limiter.tryAcquire('tick', 1000)).toBe(true)
    expect(limiter.tryAcquire('tick', 1030)).toBe(false)
    expect(limiter.tryAcquire('tick', 1056)).toBe(true)
  })

  it('tracks each cue on its own clock', () => {
    const limiter = createCueLimiter({ tick: 55, open: 90 }, 8)
    expect(limiter.tryAcquire('tick', 1000)).toBe(true)
    expect(limiter.tryAcquire('open', 1001)).toBe(true)
  })

  it('caps how many voices can overlap and frees them on release', () => {
    const limiter = createCueLimiter({}, 2)
    expect(limiter.tryAcquire('a', 0)).toBe(true)
    expect(limiter.tryAcquire('b', 0)).toBe(true)
    expect(limiter.tryAcquire('c', 0)).toBe(false)
    limiter.release()
    expect(limiter.tryAcquire('c', 1)).toBe(true)
  })

  it('never lets the voice count go negative', () => {
    const limiter = createCueLimiter({}, 1)
    limiter.release()
    limiter.release()
    expect(limiter.tryAcquire('a', 0)).toBe(true)
    expect(limiter.tryAcquire('b', 0)).toBe(false)
  })
})

describe('safety limiter curve', () => {
  it('passes everything under the knee unchanged, so short cues keep their level', () => {
    for (const x of [0, 0.01, -0.2, 0.31, -LIMITER_KNEE, LIMITER_KNEE]) {
      expect(softLimit(x)).toBe(x)
    }
  })

  it('never passes full scale, however hard it is pushed', () => {
    for (const x of [0.6, 0.9, 1, 1.5, 4, -1, -8]) {
      expect(Math.abs(softLimit(x))).toBeLessThan(1)
    }
  })

  it('rises smoothly and in order, with no step at the knee', () => {
    const curve = softLimitCurve(2049)
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1])
    }
    const step = 2 / 2048
    const below =
      (softLimit(LIMITER_KNEE) - softLimit(LIMITER_KNEE - step)) / step
    const above =
      (softLimit(LIMITER_KNEE + step) - softLimit(LIMITER_KNEE)) / step
    expect(below).toBeCloseTo(1, 2)
    expect(above).toBeGreaterThan(0.97)
  })

  it('is symmetric', () => {
    for (const x of [0.2, 0.7, 1]) expect(softLimit(-x)).toBe(-softLimit(x))
  })

  it('costs a crisp tap peaking at -1.4 dBFS less than half a dB', () => {
    const peak = 10 ** (-1.4 / 20)
    const lost = 20 * Math.log10(peak / softLimit(peak))
    expect(lost).toBeLessThan(0.6)
  })
})
