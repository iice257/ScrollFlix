import {
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createTwinkleClock } from './twinkle-clock'

describe('twinkle clock', () => {
  let frames: MockInstance<typeof window.requestAnimationFrame>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    frames = vi.spyOn(window, 'requestAnimationFrame')
  })

  afterEach(() => {
    vi.useRealTimers()
    frames.mockRestore()
  })

  const make = (reducedMotion = false) => {
    const onTick = vi.fn()
    const clock = createTwinkleClock({
      reducedMotion,
      onTick,
      now: () => Date.now(),
    })
    return { clock, onTick }
  }

  it('does not tick, or ask for a frame, while the engine draws', () => {
    const { clock, onTick } = make()
    clock.setWanted(true)
    for (let at = 0; at < 1_000; at += 16) {
      clock.engineDrew()
      vi.advanceTimersByTime(16)
    }
    expect(onTick).not.toHaveBeenCalled()
    expect(frames).not.toHaveBeenCalled()
    clock.dispose()
  })

  it('ticks at most 15 times a second when idle, from timers', () => {
    const { clock, onTick } = make()
    clock.setWanted(true)
    vi.advanceTimersByTime(1_000)
    expect(onTick.mock.calls.length).toBeGreaterThan(8)
    expect(onTick.mock.calls.length).toBeLessThanOrEqual(15)
    expect(frames).not.toHaveBeenCalled()
    clock.dispose()
  })

  it('stops when nothing is wanted', () => {
    const { clock, onTick } = make()
    clock.setWanted(true)
    clock.setWanted(false)
    vi.advanceTimersByTime(1_000)
    expect(onTick).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reduced motion never schedules', () => {
    const { clock, onTick } = make(true)
    clock.setWanted(true)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(2_000)
    expect(onTick).not.toHaveBeenCalled()
    // Turning it on later starts nothing either, until it is switched off.
    clock.setReducedMotion(false)
    expect(vi.getTimerCount()).toBe(1)
    clock.setReducedMotion(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(frames).not.toHaveBeenCalled()
  })
})
