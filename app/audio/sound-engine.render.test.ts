import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Manifest, registerBank, resetBanks } from './sound-bank'
import { CUE_SPECS } from './sound-cues'
import { type AudioOut, renderCue, resetCueState } from './sound-engine'
import { setPointerX } from './sound-pointer'

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'public/media/sfx/sprite.json'), 'utf8'),
) as Manifest

// Just enough of Web Audio to schedule clips; nothing is heard.
const node = (): Record<string, unknown> => {
  const self: Record<string, unknown> = {
    gain: { value: 1 },
    pan: { value: 0 },
    playbackRate: { value: 1 },
    connect: (next: unknown) => next,
    disconnect: () => {},
    start: () => {},
  }
  return self
}
const fakeContext = () => {
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    createBufferSource: node,
    createGain: node,
    createStereoPanner: node,
    createConvolver: node,
    createBuffer: (_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
  } as unknown as BaseAudioContext
  registerBank(ctx, { buffer: {} as AudioBuffer, manifest })
  return { ctx, out: node() as unknown as AudioNode } satisfies AudioOut
}

const seeded = (start: number) => {
  let seed = start
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('rendering a cue', () => {
  let audio: AudioOut
  beforeEach(() => {
    // The humanising and the pan jitter draw from Math.random, so fix it too:
    // the same run every time, not a lucky one.
    vi.spyOn(Math, 'random').mockImplementation(seeded(42))
    resetBanks(seeded(11))
    resetCueState()
    setPointerX(0.5)
    audio = fakeContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const play = (
    cue: Parameters<typeof renderCue>[1],
    times: number,
    gap = 300,
  ) =>
    Array.from({ length: times }, (_, i) =>
      renderCue(audio, cue, { strength: (i % 6) / 5 }, i * gap),
    )

  it('never plays the same body clip twice in a row, for any cue', () => {
    for (const cue of Object.keys(CUE_SPECS) as (keyof typeof CUE_SPECS)[]) {
      const bodies = play(cue, 60)
        .map((p) => p.layers.find((l) => l.role === 'body')?.clip)
        .filter(Boolean)
      for (const [i, clip] of bodies.entries()) {
        if (i > 0) expect(clip, `${cue} #${i}`).not.toBe(bodies[i - 1])
      }
    }
  })

  it('plays 8 hovers in a row with at least 5 different ticks', () => {
    const clips = play('hover', 8).map((p) => p.layers[0].clip)
    expect(new Set(clips).size).toBeGreaterThanOrEqual(5)
  })

  it('varies pitch and level on every play of a tap', () => {
    const taps = play('tap', 30).map((p) => p.layers[0])
    expect(new Set(taps.map((t) => t.rate.toFixed(3))).size).toBeGreaterThan(20)
    const levels = taps.map((t) => t.gainDb)
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(1.5)
    for (const t of taps) {
      expect(Math.abs(Math.log2(t.rate) * 12)).toBeLessThan(0.7)
    }
  })

  it('pans with the pointer', () => {
    setPointerX(0)
    const left = play('tap', 20).map((p) => p.layers[0].pan)
    setPointerX(1)
    const right = play('tap', 20, 400).map((p) => p.layers[0].pan)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(left)).toBeLessThan(-0.5)
    expect(mean(right)).toBeGreaterThan(0.5)
  })

  it('plays one click for every cue, from the hover, tap or spin family', () => {
    for (const cue of Object.keys(CUE_SPECS) as (keyof typeof CUE_SPECS)[]) {
      const layers = play(cue, 1)[0].layers
      expect(layers, cue).toHaveLength(1)
      expect(['hover', 'tap', 'spin'], cue).toContain(layers[0].group)
    }
  })

  it('leans the tap click up to open and save, down to close and land', () => {
    const lean = (cue: keyof typeof CUE_SPECS, times = 40) => {
      const rates = play(cue, times).map((p) => p.layers[0].rate)
      return 12 * Math.log2(rates.reduce((a, b) => a + b, 0) / rates.length)
    }
    const tap = lean('tap')
    expect(lean('open')).toBeGreaterThan(tap + 1.5)
    expect(lean('heart')).toBeGreaterThan(lean('open'))
    expect(lean('close')).toBeLessThan(tap - 2)
    expect(lean('grab')).toBeLessThan(tap - 3)
  })

  it('climbs the click along a mood row and along a path', () => {
    for (const cue of ['moodPick', 'trailPoint'] as const) {
      const low = renderCue(audio, cue, { strength: 0 }, 0).layers[0]
      const high = renderCue(audio, cue, { strength: 1 }, 5000).layers[0]
      expect(high.rate, cue).toBeGreaterThan(low.rate)
    }
  })

  it('plays softer when a cue repeats in a hurry', () => {
    const calm = renderCue(audio, 'tap', {}, 10_000).layers[0].gainDb
    const burst = [0, 20, 40, 60, 80].map(
      (t) => renderCue(audio, 'tap', {}, 20_000 + t).layers[0].gainDb,
    )
    const calmMean = Array.from(
      { length: 30 },
      (_, i) =>
        renderCue(audio, 'tap', {}, 100_000 + i * 2000).layers[0].gainDb,
    )
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(burst.slice(1))).toBeLessThan(mean(calmMean) - 1.5)
    expect(Number.isFinite(calm)).toBe(true)
  })

  it('scales a settle by how hard it landed', () => {
    const soft = renderCue(audio, 'settle', { strength: 0 }, 0).layers[0]
    const hard = renderCue(audio, 'settle', { strength: 1 }, 5000).layers[0]
    expect(hard.gainDb).toBeGreaterThan(soft.gainDb + 5)
    expect(hard.rate).toBeLessThan(soft.rate)
  })

  it('falls back to the synthesised voice before the clips have loaded', () => {
    const bare = {
      ...fakeContext(),
      ctx: { currentTime: 0 } as unknown as BaseAudioContext,
    }
    const played = renderCue(bare, 'heart', {}, 0)
    expect(played.synth).toBe(true)
    expect(played.layers).toHaveLength(0)
  })
})
