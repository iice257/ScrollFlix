import { describe, expect, it } from 'vitest'
import {
  LAB_SAMPLE_RATE,
  integratedLufs,
  lastSoundSeconds,
  samplePeakDb,
} from './lab-loudness'

const sine = (hz: number, dbfs: number, seconds: number) => {
  const out = new Float32Array(Math.round(seconds * LAB_SAMPLE_RATE))
  const amp = 10 ** (dbfs / 20)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = amp * Math.sin((2 * Math.PI * hz * i) / LAB_SAMPLE_RATE)
  }
  return out
}

describe('lab loudness', () => {
  it('reads a -20 dBFS 1 kHz sine as -23 LUFS on one channel (BS.1770 reference)', () => {
    expect(integratedLufs([sine(1000, -20, 3)])).toBeCloseTo(-23.0, 1)
  })

  it('reads the same sine on both channels 3 LU louder', () => {
    const tone = sine(1000, -20, 3)
    expect(integratedLufs([tone, tone])).toBeCloseTo(-20.0, 1)
  })

  it('follows level 1:1', () => {
    const quiet = integratedLufs([sine(1000, -40, 2)])
    const loud = integratedLufs([sine(1000, -30, 2)])
    expect(loud - quiet).toBeCloseTo(10, 2)
  })

  it('weights deep lows below mids, as the K curve does', () => {
    const mid = integratedLufs([sine(1000, -20, 2)])
    const low = integratedLufs([sine(60, -20, 2)])
    const deep = integratedLufs([sine(25, -20, 2)])
    expect(mid - low).toBeGreaterThan(3)
    expect(mid - low).toBeLessThan(4.5)
    expect(mid - deep).toBeGreaterThan(10)
  })

  it('pads a clip shorter than a block instead of inflating it', () => {
    const short = sine(1000, -20, 0.1)
    expect(integratedLufs([short])).toBeLessThan(-23 - 5)
  })

  it('says silence is silent', () => {
    expect(integratedLufs([new Float32Array(48000)])).toBe(
      Number.NEGATIVE_INFINITY,
    )
    expect(samplePeakDb([new Float32Array(10)])).toBe(Number.NEGATIVE_INFINITY)
  })

  it('reports the peak and where the sound stops', () => {
    const data = new Float32Array(LAB_SAMPLE_RATE)
    data[24000] = 0.5
    expect(samplePeakDb([data])).toBeCloseTo(-6.02, 1)
    expect(lastSoundSeconds([data])).toBeCloseTo(0.5, 2)
  })
})
