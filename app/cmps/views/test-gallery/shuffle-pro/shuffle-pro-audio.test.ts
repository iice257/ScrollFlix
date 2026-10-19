import { describe, expect, it } from 'vitest'
import {
  WHOOSH_BAND_MAX_HZ,
  WHOOSH_BAND_MIN_HZ,
  WHOOSH_NOISE_GAIN,
  WHOOSH_RUMBLE_GAIN,
  WHOOSH_TRIM,
  createWhoosh,
  whooshParams,
} from './shuffle-pro-audio'

describe('whoosh', () => {
  it('is silent and low when the globe is still', () => {
    const still = whooshParams(0, 10)
    expect(still.bandHz).toBe(WHOOSH_BAND_MIN_HZ)
    expect(still.noiseGain).toBe(0)
    expect(still.rumbleGain).toBe(0)
  })

  it('gets brighter and louder with the spin, up to full at top speed', () => {
    const slow = whooshParams(2, 10)
    const fast = whooshParams(8, 10)
    expect(fast.bandHz).toBeGreaterThan(slow.bandHz)
    expect(fast.noiseGain).toBeGreaterThan(slow.noiseGain)
    const top = whooshParams(50, 10)
    expect(top.bandHz).toBe(WHOOSH_BAND_MAX_HZ)
    expect(top.noiseGain).toBe(WHOOSH_NOISE_GAIN)
    expect(top.rumbleGain).toBe(WHOOSH_RUMBLE_GAIN)
  })

  it('stays well under the click cues even at full spin', () => {
    // The noise is band-passed, so its peaks sit under its gain; the rumble and
    // drone add to it. The sum, trimmed, must stay below the clicks' peak.
    const worstCase =
      (WHOOSH_NOISE_GAIN + WHOOSH_RUMBLE_GAIN + 0.07) * WHOOSH_TRIM
    expect(worstCase).toBeLessThan(0.7)
  })

  it('makes nothing before audio has been unlocked', () => {
    expect(createWhoosh('gold')).toBeNull()
  })
})
