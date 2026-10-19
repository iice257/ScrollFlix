// Integrated loudness (ITU-R BS.1770-4, K-weighted, gated) for rendered audio,
// so the audition page can measure a cue exactly as the site plays it. Mirrors
// scripts/sound/sound_dsp.py, which measures the shipped clips. 48 kHz only:
// the lab renders offline at that rate.

export const LAB_SAMPLE_RATE = 48000

type Samples = Float32Array | Float64Array

// Stage 1: the head-related high shelf. Stage 2: the low-frequency high-pass.
const SHELF = {
  b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
  a: [1, -1.69065929318241, 0.73248077421585],
}
const HIGH_PASS = {
  b: [1, -2, 1],
  a: [1, -1.99004745483398, 0.99007225036621],
}

const biquad = (input: Samples, { b, a }: { b: number[]; a: number[] }) => {
  const out = new Float64Array(input.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i]
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
    out[i] = y
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
  }
  return out
}

const BLOCK = Math.round(0.4 * LAB_SAMPLE_RATE)
const HOP = Math.round(0.1 * LAB_SAMPLE_RATE)
const toLufs = (power: number) => -0.691 + 10 * Math.log10(power)

// Integrated loudness in LUFS of 1 or 2 channels. Every channel counts at full
// weight, so a signal on both sides reads 3 LU above the same signal on one.
// Clips shorter than one block are zero-padded to a block, as the build does.
export const integratedLufs = (channels: Samples[]) => {
  const weighted = channels.map((channel) =>
    biquad(biquad(channel, SHELF), HIGH_PASS),
  )
  const length = Math.max(BLOCK, ...weighted.map((w) => w.length))
  const powers: number[] = []
  for (let start = 0; start + BLOCK <= length; start += HOP) {
    let power = 0
    for (const w of weighted) {
      let sum = 0
      const end = Math.min(w.length, start + BLOCK)
      for (let i = start; i < end; i += 1) sum += w[i] * w[i]
      power += sum / BLOCK
    }
    powers.push(power)
  }
  const absolute = powers.filter((p) => p > 0 && toLufs(p) > -70)
  if (absolute.length === 0) return Number.NEGATIVE_INFINITY
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const relativeGate = toLufs(mean(absolute)) - 10
  const gated = absolute.filter((p) => toLufs(p) > relativeGate)
  return toLufs(mean(gated))
}

export const samplePeakDb = (channels: Samples[]) => {
  let peak = 0
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      peak = Math.max(peak, Math.abs(channel[i]))
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY
}

// The last sample louder than -60 dBFS, in seconds, so a render's tail can be
// trimmed to what was actually heard.
export const lastSoundSeconds = (
  channels: Samples[],
  floor = 10 ** (-60 / 20),
) => {
  let last = 0
  for (const channel of channels) {
    for (let i = channel.length - 1; i > last; i -= 1) {
      if (Math.abs(channel[i]) > floor) {
        last = i
        break
      }
    }
  }
  return last / LAB_SAMPLE_RATE
}
