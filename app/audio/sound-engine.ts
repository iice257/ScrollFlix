// The sound engine: one AudioContext, one master bus. Cues are single clicks
// (sound-cues.ts) drawn from the sprite (sound-bank.ts), with every play varied
// a little (sound-variety.ts); small synthesised voices stand in until the
// clips have loaded.
//
// Nothing here makes a sound or touches Web Audio until a user gesture calls
// unlockAudio(); the clips are fetched then. While sound is off the hot paths
// cost one boolean read.
//
// Cue map (category -> cues). There are only a few on purpose: the site is
// quiet apart from the Easter egg.
//   shuffle  shuffleStart, landing, settle, trailPoint
//   ui       heart, moodPick, moodGo, confirm, hover, tap, grab, open, close,
//            spinTick (unused)
//   shuffleStart and landing are the two cues that stay synthesised: a soft
//   whoosh and a low thump, with no clips.
// The Shuffle Pro Easter egg voices live in shuffle-pro-audio.ts and are
// gated by `eggs`, not by the master switch.

import {
  bankReady,
  getBank,
  loadBank,
  pickVariant,
  playClip,
} from './sound-bank'
import { CUE_SPECS, type Cue, type Layer, type LayerRole } from './sound-cues'
import { pointerPan } from './sound-pointer'
import { isCategoryOn, soundStore } from './sound-settings'
import { dbToGain, humanize, semisToRate } from './sound-variety'

export type { Cue } from './sound-cues'

// -------------------------------------------------------------- rate limits

export type CueLimiter = {
  // `counted` false skips the shared voice cap, for cues that fire too often
  // to be worth counting (the spin ticks); their own interval still applies.
  tryAcquire: (name: string, now: number, counted?: boolean) => boolean
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
    tryAcquire: (name, now, counted = true) => {
      const last = lastAt.get(name)
      if (last !== undefined && now - last < (minIntervalMs[name] ?? 40)) {
        return false
      }
      if (counted && voices >= maxVoices) return false
      lastAt.set(name, now)
      if (counted) voices += 1
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
let limiterInput: AudioNode | null = null
let unsubscribeVolume: (() => void) | null = null

export const volumeToGain = (volume: number) => 0.9 * volume ** 1.6

// The curve of the safety limiter: untouched up to -6 dBFS, then a smooth
// roll-off that can never pass full scale. It is a shaper and not a compressor
// on purpose. Measured in a browser, a DynamicsCompressorNode took about 4 LU
// off a 100 ms burst at any level (even -40 dBFS, far below its threshold), and
// 7 LU off a crisp tap, so it undid the loudness plan for every short cue.
// This one has no memory: a clip that peaks under -6 dBFS passes unchanged.
export const LIMITER_KNEE = 0.5

export const softLimit = (x: number, knee = LIMITER_KNEE) => {
  const magnitude = Math.abs(x)
  if (magnitude <= knee) return x
  const over = knee + (1 - knee) * Math.tanh((magnitude - knee) / (1 - knee))
  return x < 0 ? -over : over
}

export const softLimitCurve = (size = 4097, knee = LIMITER_KNEE) => {
  const curve = new Float32Array(size)
  for (let i = 0; i < size; i += 1) {
    curve[i] = softLimit((i / (size - 1)) * 2 - 1, knee)
  }
  return curve
}

// The output chain: a safety limiter, then the master volume. Not a tone
// control: the clips are levelled to the plan (sound-plan.json), so this only
// rounds off pile-ups of layers. Shared with the offline renderer so a
// rendered file is the same chain as the live site.
export const createMasterChain = (ctx: BaseAudioContext, volume: number) => {
  const limiter = ctx.createWaveShaper()
  limiter.curve = softLimitCurve()
  limiter.oversample = '4x'
  const master = ctx.createGain()
  master.gain.value = volumeToGain(volume)
  limiter.connect(master).connect(ctx.destination)
  return { input: limiter as AudioNode, master }
}

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
      const chain = createMasterChain(context, soundStore.get().volume)
      limiterInput = chain.input
      master = chain.master
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
    void loadBank(context)
    if (context.state === 'suspended') void context.resume()
  } catch {
    context = null
    master = null
    limiterInput = null
    unsubscribeVolume?.()
    unsubscribeVolume = null
  }
}

export type AudioOut = { ctx: BaseAudioContext; out: AudioNode }

// The running context and its output bus, or null if audio isn't unlocked.
export const getAudio = (): AudioOut | null => {
  if (!context || !limiterInput || context.state !== 'running') return null
  return { ctx: context, out: limiterInput }
}

let noiseBuffer: AudioBuffer | null = null

export const getNoiseBuffer = (ctx: BaseAudioContext) => {
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

const MAX_VOICES = 8
const limiter = createCueLimiter(
  Object.fromEntries(
    (Object.keys(CUE_SPECS) as Cue[]).map((cue) => [
      cue,
      CUE_SPECS[cue].minIntervalMs,
    ]),
  ),
  MAX_VOICES,
)

// One pentatonic note per mood world, low to high.
const MOOD_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]

// The shuffle trail climbs a pentatonic scale, one star at a time.
const TRAIL_NOTES = [
  659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760,
]

// These two voices were tuned when the output went through a compressor with
// makeup gain, which lifted quiet sounds by about 7 dB and held loud ones near
// where they were. The output chain is now a plain soft limiter (above), so a
// quiet voice needs the lift written in. The whoosh is quiet, so it takes the
// full lift; the thump already peaks at about -10 dBFS, so it takes a little.
// Both stay under the peak of the click cues (about -1 dBFS).
const SYNTH_TRIM = 2.2
const LOW_TRIM = 1.25

const VOICES: Record<Cue, (audio: AudioOut, strength: number) => void> = {
  // The globe's detent has no synthesised stand-in: silence beats a beep.
  spinTick: () => {},
  // A soft whoosh as the globe sets off for a random movie.
  shuffleStart: (audio) => {
    burst(audio, {
      centerHz: 300,
      toHz: 2400,
      q: 0.9,
      attack: 0.12,
      decay: 0.4,
      gain: 0.09 * SYNTH_TRIM,
    })
  },
  // The globe settling on a movie: a soft low thump.
  landing: (audio, strength) => {
    pluck(audio, {
      freq: 150,
      toFreq: 52,
      decay: 0.22,
      gain: 0.3 * strength * LOW_TRIM,
    })
    burst(audio, {
      centerHz: 420,
      q: 0.7,
      type: 'lowpass',
      decay: 0.05,
      gain: 0.1 * strength * LOW_TRIM,
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

// ---------------------------------------------------------- recorded cues

export type CueOptions = {
  // 0..1: how hard, or how far along. What it means depends on the cue.
  strength?: number
  // Added to the cue's own level (dB) and pitch (a rate multiplier). The spin
  // ticker uses these to scale a detent by the globe's speed.
  gainDb?: number
  rate?: number
  // Overrides the pointer for the stereo position, -1..1.
  pan?: number
  // Seconds from now to start, for rendering a timed sequence.
  atSec?: number
}

export type PlayedLayer = {
  role: LayerRole
  group: string
  clip: string
  rate: number
  gainDb: number
  pan: number
}

export type CuePlayback = {
  cue: Cue
  layers: PlayedLayer[]
  // True when no recorded layer played and the synthesised voice should.
  synth: boolean
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const lerp = (from: number, to: number, t: number) => from + (to - from) * t
const jitter = (amount: number) => (Math.random() * 2 - 1) * amount

const lastPlayed = new Map<Cue, number>()

// Tests (and the audition page) start from a clean slate.
export const resetCueState = () => {
  lastPlayed.clear()
}

// Plays a cue's recorded layers on any audio output, live or offline, and says
// what it played. No gates and no rate limits: playCue does those. This is
// also what the audition page calls, so it hears exactly what the site does.
export const renderCue = (
  audio: AudioOut,
  cue: Cue,
  options: CueOptions = {},
  nowMs = performance.now(),
): CuePlayback => {
  const spec = CUE_SPECS[cue]
  const bank = getBank(audio.ctx)
  const layers: PlayedLayer[] = []
  if (bank) {
    const since = nowMs - (lastPlayed.get(cue) ?? Number.NEGATIVE_INFINITY)
    const feel = humanize(spec.humanize, since)
    const strength = clamp01(options.strength ?? 1)
    const strengthDb = spec.strength
      ? lerp(spec.strength.gainDb[0], spec.strength.gainDb[1], strength)
      : 0
    const strengthSemis = spec.strength?.semis
      ? lerp(spec.strength.semis[0], spec.strength.semis[1], strength)
      : 0
    const basePan = options.pan ?? (spec.pan === 'pointer' ? pointerPan() : 0)
    for (const layer of spec.layers) {
      const played = playLayer(audio, layer, {
        spec,
        feel,
        strengthDb,
        strengthSemis,
        basePan,
        options,
      })
      if (played) layers.push(played)
    }
    lastPlayed.set(cue, nowMs)
  }
  return { cue, layers, synth: layers.length === 0 }
}

const playLayer = (
  { ctx, out }: AudioOut,
  layer: Layer,
  c: {
    spec: (typeof CUE_SPECS)[Cue]
    feel: ReturnType<typeof humanize>
    strengthDb: number
    strengthSemis: number
    basePan: number
    options: CueOptions
  },
): PlayedLayer | null => {
  const bank = getBank(ctx)
  if (!bank) return null
  const clip = pickVariant(bank.manifest, layer.group)
  if (!clip) return null
  const rate =
    semisToRate(
      c.feel.semis + c.strengthSemis + (layer.semis ?? 0) + jitter(0.1),
    ) * (c.options.rate ?? 1)
  const gainDb =
    (layer.gainDb ?? 0) + c.feel.gainDb + c.strengthDb + (c.options.gainDb ?? 0)
  const pan = Math.max(-1, Math.min(1, c.basePan + jitter(0.06)))
  const result = playClip(ctx, out, clip, {
    gain: dbToGain(gainDb),
    rate,
    pan,
    when: c.options.atSec ?? 0,
  })
  if (!result) return null
  return {
    role: layer.role,
    group: layer.group,
    clip,
    rate,
    gainDb,
    pan,
  }
}

// Dev mode (local development only) silences every interface cue and leaves
// the Shuffle Pro Easter egg sounds, which do not go through playCue.
let devSilence = false
export const setDevSilence = (silent: boolean) => {
  devSilence = import.meta.env.DEV && silent
}

// Plays one interface cue if sound is on for its category. Never throws.
export const playCue = (cue: Cue, strength = 1, options: CueOptions = {}) => {
  if (devSilence) return
  const spec = CUE_SPECS[cue]
  if (!isCategoryOn(soundStore.get(), spec.category)) return
  const audio = getAudio()
  if (!audio) return
  const counted = !spec.uncounted
  if (!limiter.tryAcquire(cue, performance.now(), counted)) return
  try {
    const level = clamp01(strength)
    const played = bankReady(audio.ctx)
      ? renderCue(audio, cue, { ...options, strength: level })
      : null
    if (!played || played.synth) VOICES[cue](audio, level)
  } catch {
    // Sound must never break the interface.
  } finally {
    if (counted) window.setTimeout(limiter.release, 400)
  }
}
