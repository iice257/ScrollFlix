import { describe, expect, it } from 'vitest'
import {
  FLICK_WEATHER_SPEED,
  liveCount,
  pickWeatherKind,
  stormPlan,
} from './weather-logic'

describe('stormPlan', () => {
  it('is gentle at the threshold and longer and stronger for a harder flick', () => {
    const soft = stormPlan(FLICK_WEATHER_SPEED)
    const hard = stormPlan(FLICK_WEATHER_SPEED + 3)
    expect(soft.durationMs).toBeGreaterThanOrEqual(1800)
    expect(hard.durationMs).toBeGreaterThan(soft.durationMs)
    expect(hard.intensity).toBeGreaterThan(soft.intensity)
    expect(hard.intensity).toBeLessThanOrEqual(1)
  })

  it('never goes below the floor for a slower speed', () => {
    expect(stormPlan(0).durationMs).toBe(1800)
  })
})

describe('pickWeatherKind', () => {
  it('chooses rain a little more often than snow', () => {
    expect(pickWeatherKind(() => 0.1)).toBe('rain')
    expect(pickWeatherKind(() => 0.54)).toBe('rain')
    expect(pickWeatherKind(() => 0.56)).toBe('snow')
  })
})

describe('liveCount', () => {
  it('scales with intensity and stays within the pool', () => {
    expect(liveCount(100, 0.5)).toBe(50)
    expect(liveCount(100, 2)).toBe(100)
    expect(liveCount(100, -1)).toBe(0)
  })
})
