import { describe, expect, it } from 'vitest'
import {
  REST_STATE,
  TILT_RANGE_DEG,
  clamp,
  easeToward,
  intensityFor,
  isSettled,
  orientationToSheen,
  pointerToSheen,
  sheenVars,
  stepSheen,
} from './tilt-sheen-math'

const rect = { left: 100, top: 50, width: 200, height: 300 }

describe('pointerToSheen', () => {
  it('maps the centre to zero and the corners to +-1', () => {
    expect(pointerToSheen(200, 200, rect)).toEqual({ x: 0, y: 0 })
    expect(pointerToSheen(100, 50, rect)).toEqual({ x: -1, y: -1 })
    expect(pointerToSheen(300, 350, rect)).toEqual({ x: 1, y: 1 })
  })

  it('clamps a pointer outside the card', () => {
    expect(pointerToSheen(-500, 9999, rect)).toEqual({ x: -1, y: 1 })
  })

  it('survives an empty rect', () => {
    expect(pointerToSheen(5, 5, { ...rect, width: 0 })).toEqual({ x: 0, y: 0 })
  })
})

describe('orientationToSheen', () => {
  const base = { beta: 45, gamma: 0 }

  it('is zero at the baseline', () => {
    expect(orientationToSheen(45, 0, base)).toEqual({ x: 0, y: 0 })
  })

  it('is relative to how the phone was first held', () => {
    expect(orientationToSheen(70, 10, { beta: 70, gamma: 10 })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('maps roll to x and pitch to y, and clamps at the range', () => {
    const half = TILT_RANGE_DEG / 2
    expect(orientationToSheen(45, half, base)?.x).toBeCloseTo(0.5)
    expect(orientationToSheen(45 - half, 0, base)?.y).toBeCloseTo(-0.5)
    expect(orientationToSheen(180, 90, base)).toEqual({ x: 1, y: 1 })
    expect(orientationToSheen(-90, -90, base)).toEqual({ x: -1, y: -1 })
  })

  it('wraps angles across 180 degrees', () => {
    const next = orientationToSheen(0, -179, { beta: 0, gamma: 179 })
    expect(next?.x).toBeCloseTo(2 / TILT_RANGE_DEG)
  })

  it('returns null without a reading', () => {
    expect(orientationToSheen(null, 3, base)).toBeNull()
    expect(orientationToSheen(3, Number.NaN, base)).toBeNull()
  })
})

describe('smoothing', () => {
  it('halves the gap after one half-life, at any frame rate', () => {
    expect(easeToward(0, 1, 100, 100)).toBeCloseTo(0.5)
    let stepped = 0
    for (let i = 0; i < 10; i++) stepped = easeToward(stepped, 1, 10, 100)
    expect(stepped).toBeCloseTo(0.5)
  })

  it('never overshoots and holds still without time', () => {
    expect(easeToward(0.2, 1, 5000, 50)).toBeLessThanOrEqual(1)
    expect(easeToward(0.2, 1, 0, 50)).toBe(0.2)
  })

  it('settles all three channels', () => {
    let state = { x: -1, y: 1, o: 1 }
    const goal = REST_STATE
    for (let i = 0; i < 200 && !isSettled(state, goal); i++) {
      state = stepSheen(state, goal, 16, 170)
    }
    expect(isSettled(state, goal)).toBe(true)
  })
})

describe('intensityFor', () => {
  it('is full under a pointer and faint at rest', () => {
    expect(intensityFor({ x: 0, y: 0 }, true)).toBe(1)
    expect(intensityFor({ x: 0, y: 0 }, false)).toBe(REST_STATE.o)
  })

  it('grows with tilt but stays within 0..1', () => {
    const tilted = intensityFor({ x: 0.5, y: 0 }, false)
    expect(tilted).toBeGreaterThan(REST_STATE.o)
    expect(intensityFor({ x: 1, y: 1 }, false)).toBeLessThanOrEqual(1)
  })
})

describe('sheenVars', () => {
  it('writes light position and a matching card tilt', () => {
    const vars = sheenVars({ x: 1, y: -1, o: 0.5 }, 8)
    expect(vars['--ts-x']).toBe('1')
    expect(vars['--ts-y']).toBe('-1')
    expect(vars['--ts-o']).toBe('0.5')
    expect(vars['--ts-ry']).toBe('8deg')
    expect(vars['--ts-rx']).toBe('8deg')
  })

  it('writes no tilt when the tilt is zero', () => {
    expect(sheenVars({ x: 1, y: 1, o: 1 }, 0)['--ts-ry']).toBe('0deg')
  })
})

describe('clamp', () => {
  it('limits to the range', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
  })
})
