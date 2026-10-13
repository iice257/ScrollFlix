// The sound engine: one AudioContext, one master bus, procedural voices.
//
// Nothing here makes a sound or touches Web Audio until a user gesture calls
// unlockAudio(), and nothing is fetched or decoded: every voice is built from
// oscillators and noise. While sound is off the hot paths cost one boolean
// read.
//
// Cue map (category -> cues). There are only a few on purpose: the site is
// quiet apart from the Easter egg.
//   shuffle  shuffleStart, landing, settle, trailPoint
//   ui       heart, moodPick, moodGo, confirm, hover, tap, grab, open, close
// The Shuffle Pro Easter egg voices live in shuffle-pro-audio.ts and are
// gated by `eggs`, not by the master switch.

import { type SoundCategory, isCategoryOn, soundStore } from './sound-settings'

// -------------------------------------------------------------- rate limits

export type CueLimiter = {
  tryAcquire: (name: string, now: number) => boolean
  release: () => void
}

// Caps how often each cue may fire and how many voices may overlap, so rapid
// input can't stack dozens of voices or clip.
export const createCueLimiter = (
  minIntervalMs: Record<string, number>,
  maxVoices: number,
): CueLimiter => {
  const lastAt = new Map<string, number>()
  let voices = 0
  return {
    tryAcquire: (name, now) => {
      const last = lastAt.get(name)
      if (last !== undefined && now - last < (minIntervalMs[name] ?? 40)) {
        return false
      }
      if (voices >= maxVoices) return false
      lastAt.set(name, now)
      voices += 1
      return true
    },
    release: () => {
      voices = Math.max(0, voices - 1)
    },
  }
}

// ---------------------------------------------------------------- context

let context: AudioContext | null = null
let master: GainNode | null = null
let compressor: DynamicsCompressorNode | null = null
let unsubscribeVolume: (() => void) | null = null

const volumeToGain = (volume: number) => 0.9 * volume ** 1.6

// Call from inside a user gesture. Safe to call repeatedly.
export const unlockAudio = () => {
  if (typeof window === 'undefined') return
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return
      context = new Ctor()
      compressor = context.createDynamicsCompressor()
      compressor.threshold.value = -16
      compressor.knee.value = 18
      compressor.ratio.value = 5
      compressor.attack.value = 0.004
      compressor.release.value = 0.2
      master = context.createGain()
      master.gain.value = volumeToGain(soundStore.get().volume)
      compressor.connect(master).connect(context.destination)
      unsubscribeVolume = soundStore.subscribe(() => {
        if (master && context) {
          master.gain.setTargetAtTime(
            volumeToGain(soundStore.get().volume),
            context.currentTime,
            0.05,
          )
        }
      })
    }
    if (context.state === 'suspended') void context.resume()
  } catch {
    context = null
    master = null
    compressor = null
    unsubscribeVolume?.()
    unsubscribeVolume = null
  }
}

export type AudioOut = { ctx: AudioContext; out: AudioNode }

// The running context and its output bus, or null if audio isn't unlocked.
export const getAudio = (): AudioOut | null => {
  if (!context || !compressor || context.state !== 'running') return null
  return { ctx: context, out: compressor }
}

let noiseBuffer: AudioBuffer | null = null

export const getNoiseBuffer = (ctx: AudioContext) => {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer
  }
  const length = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  noiseBuffer = buffer
  return buffer
}

// A sine or triangle voice with a plucked envelope; the building block of the
// small interface sounds.
export const pluck = (
  { ctx, out }: AudioOut,
  options: {
    freq: number
    toFreq?: number
    type?: OscillatorType
    start?: number
    attack?: number
    decay: number
    gain: number
    detune?: number
  },
) => {
  const at = ctx.currentTime + (options.start ?? 0)
  const attack = options.attack ?? 0.004
  const osc = ctx.createOscillator()
  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(options.freq, at)
  if (options.toFreq) {
    osc.frequency.exponentialRampToValueAtTime(
      options.toFreq,
      at + options.decay,
    )
  }
  if (options.detune) osc.detune.value = options.detune
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(options.gain, at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + options.decay)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + attack + options.decay + 0.05)
  return osc
}

// A short band-passed noise burst: clicks, ticks and swishes.
export const burst = (
  { ctx, out }: AudioOut,
  options: {
    centerHz: number
    q: number
    start?: number
    attack?: number
    decay: number
    gain: number
    type?: BiquadFilterType
    toHz?: number
  },
) => {
  const at = ctx.currentTime + (options.start ?? 0)
  const attack = options.attack ?? 0.002
  const source = ctx.createBufferSource()
  source.buffer = getNoiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = options.type ?? 'bandpass'
  filter.Q.value = options.q
  filter.frequency.setValueAtTime(options.centerHz, at)
  if (options.toHz) {
    filter.frequency.exponentialRampToValueAtTime(
      options.toHz,
      at + attack + options.decay,
    )
  }
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(options.gain, at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + options.decay)
  source.connect(filter).connect(gain).connect(out)
  source.start(at, Math.random() * 1.5)
  source.stop(at + attack + options.decay + 0.05)
  return source
}

// ------------------------------------------------------------------- cues

export type Cue =
  | 'shuffleStart'
  | 'landing'
  | 'heart'
  | 'moodPick'
  | 'moodGo'
  | 'confirm'
  | 'hover'
  | 'tap'
  | 'grab'
  | 'open'
  | 'close'
  | 'settle'
  | 'trailPoint'

export const CUE_CATEGORY: Record<Cue, SoundCategory> = {
  shuffleStart: 'shuffle',
  landing: 'shuffle',
  heart: 'ui',
  moodPick: 'ui',
  moodGo: 'ui',
  confirm: 'ui',
  hover: 'ui',
  tap: 'ui',
  grab: 'ui',
  open: 'ui',
  close: 'ui',
  settle: 'shuffle',
  trailPoint: 'shuffle',
}

const CUE_MIN_INTERVAL_MS: Record<Cue, number> = {
  shuffleStart: 200,
  landing: 200,
  heart: 120,
  moodPick: 70,
  moodGo: 300,
  confirm: 90,
  hover: 55,
  tap: 45,
  grab: 120,
  open: 160,
  close: 160,
  settle: 160,
  trailPoint: 90,
}

const MAX_VOICES = 8
const limiter = createCueLimiter(CUE_MIN_INTERVAL_MS, MAX_VOICES)

// One pentatonic note per mood world, low to high.
const MOOD_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]

// The shuffle trail climbs a pentatonic scale, one star at a time.
const TRAIL_NOTES = [
  659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760,
]

const VOICES: Record<Cue, (audio: AudioOut, strength: number) => void> = {
  // A soft whoosh as the globe sets off for a random movie.
  shuffleStart: (audio) => {
    burst(audio, {
      centerHz: 300,
      toHz: 2400,
      q: 0.9,
      attack: 0.12,
      decay: 0.4,
      gain: 0.09,
    })
  },
  // The globe settling on a movie: a soft low thump.
  landing: (audio, strength) => {
    pluck(audio, {
      freq: 150,
      toFreq: 52,
      decay: 0.22,
      gain: 0.3 * strength,
    })
    burst(audio, {
      centerHz: 420,
      q: 0.7,
      type: 'lowpass',
      decay: 0.05,
      gain: 0.1 * strength,
    })
  },
  heart: (audio) => {
    pluck(audio, { freq: 880, toFreq: 1320, decay: 0.12, gain: 0.08 })
    pluck(audio, {
      freq: 1760,
      decay: 0.28,
      gain: 0.035,
      start: 0.06,
      type: 'triangle',
    })
  },
  // Choosing a mood world: a note whose pitch is the world's place in the row,
  // so moving along the worlds plays a scale. Strength 0..1 picks the note.
  moodPick: (audio, strength) => {
    const hz = MOOD_NOTES[Math.round(strength * (MOOD_NOTES.length - 1))]
    pluck(audio, { freq: hz, decay: 0.34, gain: 0.07, type: 'triangle' })
    pluck(audio, { freq: hz * 2, decay: 0.22, gain: 0.025, start: 0.02 })
  },
  // Landing on a film from the mood page: a short rising chord.
  moodGo: (audio) => {
    for (const [index, hz] of [523.25, 659.25, 783.99, 1046.5].entries()) {
      pluck(audio, {
        freq: hz,
        decay: 0.7,
        gain: 0.055,
        start: index * 0.06,
        type: 'triangle',
      })
    }
  },
  // A glassy tick under a mouse pointer; deliberately tiny.
  hover: (audio) => {
    pluck(audio, { freq: 2600, toFreq: 2100, decay: 0.035, gain: 0.02 })
  },
  // A press: a soft knock with a crisp edge.
  tap: (audio) => {
    pluck(audio, {
      freq: 520,
      toFreq: 340,
      decay: 0.09,
      gain: 0.07,
      type: 'triangle',
    })
    burst(audio, {
      centerHz: 4200,
      q: 1.2,
      type: 'highpass',
      decay: 0.025,
      gain: 0.05,
    })
  },
  // Taking hold of the globe.
  grab: (audio) => {
    pluck(audio, { freq: 190, toFreq: 120, decay: 0.09, gain: 0.1 })
    burst(audio, {
      centerHz: 700,
      q: 0.7,
      type: 'lowpass',
      decay: 0.05,
      gain: 0.06,
    })
  },
  // A film card opens: a short upward sweep with a breath of air.
  open: (audio) => {
    pluck(audio, {
      freq: 392,
      toFreq: 784,
      decay: 0.24,
      gain: 0.07,
      type: 'triangle',
    })
    pluck(audio, { freq: 1175, decay: 0.3, gain: 0.025, start: 0.07 })
    burst(audio, {
      centerHz: 1200,
      toHz: 3600,
      q: 0.8,
      attack: 0.05,
      decay: 0.2,
      gain: 0.035,
    })
  },
  close: (audio) => {
    pluck(audio, {
      freq: 660,
      toFreq: 300,
      decay: 0.2,
      gain: 0.055,
      type: 'triangle',
    })
  },
  // A drag or flick comes to rest; a harder one lands heavier.
  settle: (audio, strength) => {
    pluck(audio, {
      freq: 150,
      toFreq: 58,
      decay: 0.28,
      gain: 0.06 + 0.2 * strength,
    })
    burst(audio, {
      centerHz: 500,
      q: 0.7,
      type: 'lowpass',
      decay: 0.06,
      gain: 0.04 + 0.08 * strength,
    })
  },
  // A star joins the shuffle trail. Strength 0..1 picks the note.
  trailPoint: (audio, strength) => {
    const hz = TRAIL_NOTES[Math.round(strength * (TRAIL_NOTES.length - 1))]
    pluck(audio, { freq: hz, decay: 0.55, gain: 0.06 })
    pluck(audio, { freq: hz * 2.76, decay: 0.3, gain: 0.018, start: 0.01 })
    pluck(audio, { freq: hz * 2, decay: 0.7, gain: 0.02, start: 0.09 })
  },
  confirm: (audio) => {
    pluck(audio, { freq: 659, decay: 0.16, gain: 0.07, type: 'triangle' })
    pluck(audio, {
      freq: 988,
      decay: 0.22,
      gain: 0.06,
      start: 0.075,
      type: 'triangle',
    })
  },
}

// Plays one interface cue if sound is on for its category. Never throws.
export const playCue = (cue: Cue, strength = 1) => {
  const settings = soundStore.get()
  if (!isCategoryOn(settings, CUE_CATEGORY[cue])) return
  const audio = getAudio()
  if (!audio) return
  if (!limiter.tryAcquire(cue, performance.now())) return
  try {
    VOICES[cue](audio, Math.min(1, Math.max(0, strength)))
  } catch {
    // Sound must never break the interface.
  } finally {
    window.setTimeout(limiter.release, 400)
  }
}
