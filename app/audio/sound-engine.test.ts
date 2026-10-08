import { describe, expect, it } from 'vitest'
import { createCueLimiter } from './sound-engine'

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
