import { describe, expect, it } from 'vitest'
import {
  EMPTY_STREAK,
  JADE_PROFILE,
  STANDARD_PROFILE,
  type StreakEvent,
  type StreakState,
  angularSpeedAt,
  axisForDragDirection,
  cameraPullback,
  isBigSpin,
  landingOmega,
  pickLandingTarget,
  precessedAxis,
  readyForSnap,
  reduceStreak,
  resolveTier,
  revealAt,
  screenSpinDirection,
  shouldTriggerHold,
} from './shuffle-pro-logic'

describe('shouldTriggerHold', () => {
  it('fires after 5s held still', () => {
    const args = { maxMovedPx: 3, immersive: false }
    expect(shouldTriggerHold({ ...args, elapsedMs: 4999 })).toBe(false)
    expect(shouldTriggerHold({ ...args, elapsedMs: 5000 })).toBe(true)
  })

  it('fires after 10s when the pointer moved', () => {
    const args = { maxMovedPx: 120, immersive: false }
    expect(shouldTriggerHold({ ...args, elapsedMs: 9999 })).toBe(false)
    expect(shouldTriggerHold({ ...args, elapsedMs: 10000 })).toBe(true)
  })

  it('treats up to 8px as still', () => {
    expect(
      shouldTriggerHold({ elapsedMs: 5000, maxMovedPx: 8, immersive: false }),
    ).toBe(true)
    expect(
      shouldTriggerHold({ elapsedMs: 5000, maxMovedPx: 8.5, immersive: false }),
    ).toBe(false)
  })

  it('is faster when immersive: 3s still, 6s moving', () => {
    expect(
      shouldTriggerHold({ elapsedMs: 3000, maxMovedPx: 0, immersive: true }),
    ).toBe(true)
    expect(
      shouldTriggerHold({ elapsedMs: 2999, maxMovedPx: 0, immersive: true }),
    ).toBe(false)
    expect(
      shouldTriggerHold({ elapsedMs: 6000, maxMovedPx: 50, immersive: true }),
    ).toBe(true)
    expect(
      shouldTriggerHold({ elapsedMs: 5999, maxMovedPx: 50, immersive: true }),
    ).toBe(false)
  })
})

describe('isBigSpin', () => {
  it('is true from a quarter turn', () => {
    expect(isBigSpin(Math.PI / 2)).toBe(true)
    expect(isBigSpin(Math.PI / 2 - 0.001)).toBe(false)
    expect(isBigSpin(7)).toBe(true)
  })
})

type Run = { state: StreakState; trigger: string | null }

const play = (
  events: StreakEvent[],
  options: { immersive?: boolean; random?: () => number } = {},
) => {
  let state: StreakState = EMPTY_STREAK
  const results: Run[] = []
  for (const event of events) {
    const result = reduceStreak(state, event, {
      immersive: options.immersive ?? false,
      random: options.random ?? (() => 0.99),
    })
    state = result.state
    results.push({ state, trigger: result.trigger })
  }
  return results
}

const repeat = (event: StreakEvent, count: number) =>
  Array.from({ length: count }, () => event)

describe('reduceStreak', () => {
  const shuffle: StreakEvent = { type: 'shuffle' }
  const bigSpin: StreakEvent = { type: 'bigSpin' }
  const brk: StreakEvent = { type: 'break' }
  const neutral: StreakEvent = { type: 'neutral' }

  it('counts shuffles and big spins in the streak', () => {
    const [a, b, c] = play([shuffle, bigSpin, shuffle])
    expect(a.state).toEqual({ streak: 1, bigSpinRun: 0 })
    expect(b.state).toEqual({ streak: 2, bigSpinRun: 1 })
    expect(c.state).toEqual({ streak: 3, bigSpinRun: 0 })
  })

  it('starts a Frost run on the fifth big spin in a row', () => {
    const results = play(repeat(bigSpin, 5))
    expect(results.slice(0, 4).every((r) => r.trigger === null)).toBe(true)
    expect(results[4].trigger).toBe('frost')
    expect(results[4].state).toEqual(EMPTY_STREAK)
  })

  it('does not count big spins that are not consecutive', () => {
    const results = play([
      ...repeat(bigSpin, 4),
      shuffle,
      ...repeat(bigSpin, 4),
    ])
    expect(results.every((r) => r.trigger === null)).toBe(true)
  })

  it('resets the big-spin run, but not the streak, on another shuffle', () => {
    const results = play([bigSpin, bigSpin, shuffle])
    expect(results[2].state).toEqual({ streak: 3, bigSpinRun: 0 })
  })

  it('lets neutral events pass without breaking anything', () => {
    const results = play([shuffle, bigSpin, neutral, neutral, bigSpin, neutral])
    expect(results[5].state).toEqual({ streak: 3, bigSpinRun: 2 })
    expect(results[2].state).toBe(results[1].state)
  })

  it('breaks both counters on a breaking event', () => {
    const results = play([shuffle, bigSpin, brk, shuffle])
    expect(results[2].state).toEqual(EMPTY_STREAK)
    expect(results[3].state).toEqual({ streak: 1, bigSpinRun: 0 })
  })

  it('a break stops the build-up to the five-big-spin trigger', () => {
    const results = play([...repeat(bigSpin, 4), brk, bigSpin])
    expect(results.every((r) => r.trigger === null)).toBe(true)
  })

  it('rolls the 5% Amethyst chance first at exactly the 10th action', () => {
    const results = play(repeat(shuffle, 10), { random: () => 0.01 })
    expect(results.slice(0, 9).every((r) => r.trigger === null)).toBe(true)
    expect(results[9].trigger).toBe('amethyst')
    expect(results[9].state).toEqual(EMPTY_STREAK)
  })

  it('never rolls before the 10th action, even with a lucky random', () => {
    let calls = 0
    const results = play(repeat(shuffle, 9), {
      random: () => {
        calls += 1
        return 0
      },
    })
    expect(calls).toBe(0)
    expect(results.every((r) => r.trigger === null)).toBe(true)
  })

  it('rolls on every action from the 10th until it fires', () => {
    const rolls = [0.5, 0.2, 0.049]
    let index = 0
    const results = play(repeat(shuffle, 12), {
      random: () => rolls[index++] ?? 0.99,
    })
    expect(results[9].trigger).toBeNull()
    expect(results[10].trigger).toBeNull()
    expect(results[11].trigger).toBe('amethyst')
    expect(index).toBe(3)
  })

  it('does not fire on a 5% roll that misses', () => {
    const results = play(repeat(shuffle, 20), { random: () => 0.05 })
    expect(results.every((r) => r.trigger === null)).toBe(true)
  })

  it('mixes action types toward the streak roll', () => {
    const mixed: StreakEvent[] = [
      shuffle,
      bigSpin,
      shuffle,
      neutral,
      bigSpin,
      shuffle,
      shuffle,
      neutral,
      bigSpin,
      shuffle,
      neutral,
      shuffle,
      shuffle,
    ]
    // Neutral events are never counted: the 10th counted action is the last.
    const results = play(mixed, { random: () => 0.01 })
    expect(results.slice(0, 12).every((r) => r.trigger === null)).toBe(true)
    expect(results[12].trigger).toBe('amethyst')
  })

  it('Frost takes precedence when the roll would also fire', () => {
    // Five shuffles, then five big spins: the fifth is both the 10th action
    // and the fifth big spin in a row. Earlier rolls (none) cannot fire.
    const events = [...repeat(shuffle, 5), ...repeat(bigSpin, 5)]
    const results = play(events, { random: () => 0.01 })
    expect(results[8].trigger).toBeNull()
    expect(results[9].trigger).toBe('frost')
  })

  it('resets on runEnd', () => {
    const results = play([shuffle, shuffle, { type: 'runEnd' }])
    expect(results[2].state).toEqual(EMPTY_STREAK)
  })

  describe('immersive', () => {
    it('starts a Jade run on the third big spin', () => {
      const results = play(repeat(bigSpin, 3), { immersive: true })
      expect(results[1].trigger).toBeNull()
      expect(results[2].trigger).toBe('jade')
    })

    it('starts a guaranteed Jade run on the sixth shuffle', () => {
      const results = play(repeat(shuffle, 6), {
        immersive: true,
        random: () => 0.99,
      })
      expect(results.slice(0, 5).every((r) => r.trigger === null)).toBe(true)
      expect(results[5].trigger).toBe('jade')
    })

    it('never uses the Frost or Amethyst rules', () => {
      const results = play(repeat(shuffle, 5), {
        immersive: true,
        random: () => 0,
      })
      expect(results.every((r) => r.trigger === null)).toBe(true)
    })
  })

  it('normal mode does not fire Jade at 3 big spins or 6 shuffles', () => {
    expect(play(repeat(bigSpin, 3)).every((r) => r.trigger === null)).toBe(true)
    expect(play(repeat(shuffle, 6)).every((r) => r.trigger === null)).toBe(true)
  })
})

describe('resolveTier', () => {
  const never = () => 0.99
  const always = () => 0

  it('keeps the base tier until Frost, Amethyst and Jade are all found', () => {
    expect(resolveTier('frost', { found: {}, random: always })).toBe('frost')
    expect(
      resolveTier('jade', {
        found: { frost: 1, amethyst: 1 },
        random: always,
      }),
    ).toBe('jade')
  })

  it('upgrades the next run of any kind to Gold once all three are found', () => {
    const found = { frost: 1, amethyst: 1, jade: 1 }
    expect(resolveTier('frost', { found, random: never })).toBe('gold')
    expect(resolveTier('amethyst', { found, random: never })).toBe('gold')
    expect(resolveTier('jade', { found, random: never })).toBe('gold')
  })

  it('upgrades with a 10% chance after Gold has been found', () => {
    const found = { frost: 1, amethyst: 1, jade: 1, gold: 1 }
    expect(resolveTier('frost', { found, random: () => 0.099 })).toBe('gold')
    expect(resolveTier('frost', { found, random: () => 0.1 })).toBe('frost')
    expect(resolveTier('jade', { found, random: () => 0.5 })).toBe('jade')
  })
})

describe('run timeline', () => {
  it('starts slow, accelerates, and holds the top speed with small drift', () => {
    const p = STANDARD_PROFILE
    expect(angularSpeedAt(0, p)).toBeCloseTo(0.6, 6)
    expect(angularSpeedAt(2000, p)).toBeLessThan((0.6 + 7) / 2)
    expect(angularSpeedAt(4000, p)).toBeCloseTo(7, 6)
    for (const t of [4500, 5000, 5400, 8000, 20000]) {
      expect(angularSpeedAt(t, p)).toBeGreaterThanOrEqual(7 * 0.96 - 1e-9)
      expect(angularSpeedAt(t, p)).toBeLessThanOrEqual(7 * 1.04 + 1e-9)
    }
  })

  it('is monotonic through the wind-up', () => {
    let last = -1
    for (let t = 0; t <= 4000; t += 100) {
      const speed = angularSpeedAt(t, STANDARD_PROFILE)
      expect(speed).toBeGreaterThan(last)
      last = speed
    }
  })

  it('has a shorter, faster Jade profile', () => {
    expect(JADE_PROFILE.windupMs).toBe(2000)
    expect(JADE_PROFILE.peakMs).toBe(2500)
    expect(angularSpeedAt(2000, JADE_PROFILE)).toBeCloseTo(9, 6)
    expect(JADE_PROFILE.skyStartMs).toBe(STANDARD_PROFILE.skyStartMs * 0.5)
  })

  it('pulls the camera back continuously, scaled by the camera ratio', () => {
    const p = STANDARD_PROFILE
    expect(cameraPullback(0, p, 1)).toBe(0)
    expect(cameraPullback(7, p, 1)).toBeCloseTo(1.4, 9)
    expect(cameraPullback(7, p, 0.8)).toBeCloseTo(1.12, 9)
    const before = cameraPullback(angularSpeedAt(3990, p), p, 1)
    const after = cameraPullback(angularSpeedAt(4010, p), p, 1)
    expect(Math.abs(after - before)).toBeLessThan(0.02)
  })

  it('reveals the sky, colour and particles on schedule', () => {
    const p = STANDARD_PROFILE
    expect(revealAt(0, p)).toEqual({ sky: 0, color: 0, particles: 0 })
    expect(revealAt(800, p).sky).toBe(0)
    expect(revealAt(3000, p).sky).toBeCloseTo(1, 9)
    expect(revealAt(1500, p).color).toBe(0)
    expect(revealAt(3500, p).color).toBeCloseTo(1, 9)
    expect(revealAt(3000, p).particles).toBe(0)
    expect(revealAt(4500, p).particles).toBeCloseTo(1, 9)
    const mid = revealAt(1900, p).sky
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })
})

describe('spin axis', () => {
  it('turns drag direction into a screen-space rotation axis', () => {
    const right = axisForDragDirection(10, 0)
    expect(right[0]).toBeCloseTo(0, 9)
    expect(right[1]).toBeCloseTo(1, 9)
    const up = axisForDragDirection(0, -10)
    expect(up[0]).toBeCloseTo(-1, 9)
    expect(up[1]).toBeCloseTo(0, 9)
  })

  it('falls back to the default direction when the pointer held still', () => {
    const axis = axisForDragDirection(0, 0)
    expect(Math.hypot(...axis)).toBeCloseTo(1, 9)
    expect(axis[1]).toBeGreaterThan(axis[0])
  })

  it('maps the axis back to the on-screen motion direction', () => {
    const [x, y] = screenSpinDirection(axisForDragDirection(10, 0))
    expect(x).toBeCloseTo(1, 9)
    expect(y).toBeCloseTo(0, 9)
  })

  it('precesses by at most 25 degrees and stays a unit vector', () => {
    const base = axisForDragDirection(1, 0.35)
    let maxAngle = 0
    for (let t = 0; t <= 12000; t += 100) {
      const axis = precessedAxis(base, t)
      expect(Math.hypot(...axis)).toBeCloseTo(1, 9)
      const dot = axis[0] * base[0] + axis[1] * base[1] + axis[2] * base[2]
      maxAngle = Math.max(maxAngle, Math.acos(Math.min(1, dot)))
    }
    expect(maxAngle).toBeLessThanOrEqual((25 * Math.PI) / 180 + 1e-9)
    expect(maxAngle).toBeGreaterThan((20 * Math.PI) / 180)
  })

  it('starts exactly on the base axis', () => {
    const base = axisForDragDirection(3, -2)
    const axis = precessedAxis(base, 0)
    for (let i = 0; i < 3; i += 1) expect(axis[i]).toBeCloseTo(base[i], 9)
  })
})

describe('landing', () => {
  it('decays with a 450ms time constant', () => {
    expect(landingOmega(7, 0)).toBe(7)
    expect(landingOmega(7, 450)).toBeCloseTo(7 / Math.E, 9)
  })

  it('hands over to the snap below 1.2 rad/s', () => {
    expect(readyForSnap(1.2)).toBe(false)
    expect(readyForSnap(1.19)).toBe(true)
    expect(readyForSnap(landingOmega(7, 900))).toBe(true)
  })

  it('never lands on the current movie', () => {
    const ids = ['a', 'b', 'c']
    for (let step = 0; step < 20; step += 1) {
      expect(pickLandingTarget(ids, 'b', () => step / 20)).not.toBe('b')
    }
    expect(pickLandingTarget(['only'], 'only', () => 0)).toBe('only')
    expect(pickLandingTarget([], null, () => 0)).toBeNull()
  })
})
