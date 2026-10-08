// The Shuffle Pro Easter egg sounds, all procedural Web Audio:
//
//   whoosh   band-passed noise that sweeps up with the spin, a low rumble, and
//            a quiet tonal drone (tuned per path) that swells with the sky
//   chime    one voice per path at the peak: glassy Frost, bell Amethyst,
//            breathy Jade, a rich chord for Gold
//   thud     the landing, as the card opens
//
// They follow the "Easter egg sounds" switch, not the master sound switch, so
// they stay audible by default. The AudioContext itself lives in the shared
// engine and is only created inside a real user gesture.

import {
  type AudioOut,
  burst,
  getAudio,
  getNoiseBuffer,
  pluck,
} from '../../../../audio/sound-engine'
import { soundStore } from '../../../../audio/sound-settings'
import type { Tier } from './shuffle-pro-logic'

export { unlockAudio } from '../../../../audio/sound-engine'

export const WHOOSH_BAND_MIN_HZ = 200
export const WHOOSH_BAND_MAX_HZ = 2400
export const WHOOSH_RUMBLE_MIN_HZ = 40
export const WHOOSH_RUMBLE_MAX_HZ = 60
export const WHOOSH_NOISE_GAIN = 0.2
export const WHOOSH_RUMBLE_GAIN = 0.1
export const DRONE_GAIN = 0.07

// How loud and how bright the whoosh is for a spin speed.
export const whooshParams = (omega: number, omegaMax: number) => {
  const level = Math.min(1, Math.max(0, omega / Math.max(0.0001, omegaMax)))
  return {
    bandHz:
      WHOOSH_BAND_MIN_HZ + (WHOOSH_BAND_MAX_HZ - WHOOSH_BAND_MIN_HZ) * level,
    noiseGain: WHOOSH_NOISE_GAIN * level,
    rumbleHz:
      WHOOSH_RUMBLE_MIN_HZ +
      (WHOOSH_RUMBLE_MAX_HZ - WHOOSH_RUMBLE_MIN_HZ) * level,
    rumbleGain: WHOOSH_RUMBLE_GAIN * level,
  }
}

// Root note of each path's drone, in Hz: A2, G2, E2, C2.
export const DRONE_ROOT_HZ: Record<Tier, number> = {
  frost: 110,
  amethyst: 98,
  jade: 82.41,
  gold: 65.41,
}

export type Whoosh = {
  update: (omega: number, omegaMax: number, sky?: number) => void
  fadeOut: (ms: number) => void
  stop: () => void
}

const eggsOn = () => soundStore.get().eggs

// Returns null when the Easter egg sounds are off or audio was never unlocked.
export const createWhoosh = (tier: Tier = 'frost'): Whoosh | null => {
  if (!eggsOn()) return null
  const audio = getAudio()
  if (!audio) return null
  const { ctx, out } = audio

  try {
    const master = ctx.createGain()
    master.gain.value = 1
    master.connect(out)

    const noise = ctx.createBufferSource()
    noise.buffer = getNoiseBuffer(ctx)
    noise.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 0.9
    band.frequency.value = WHOOSH_BAND_MIN_HZ
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    noise.connect(band).connect(noiseGain).connect(master)

    const rumble = ctx.createOscillator()
    rumble.type = 'sine'
    rumble.frequency.value = WHOOSH_RUMBLE_MIN_HZ
    const rumbleGain = ctx.createGain()
    rumbleGain.gain.value = 0
    rumble.connect(rumbleGain).connect(master)

    // The drone: the root and its fifth, slightly detuned so they beat slowly.
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0
    droneGain.connect(master)
    const root = DRONE_ROOT_HZ[tier]
    const droneOscillators = [
      { ratio: 1, detune: -4 },
      { ratio: 1, detune: 5 },
      { ratio: 1.5, detune: 0 },
    ].map(({ ratio, detune }) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = root * ratio
      osc.detune.value = detune
      osc.connect(droneGain)
      return osc
    })

    noise.start()
    rumble.start()
    for (const osc of droneOscillators) osc.start()

    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      try {
        noise.stop()
        rumble.stop()
        for (const osc of droneOscillators) osc.stop()
      } catch {
        // Already stopped.
      }
      master.disconnect()
    }

    return {
      update: (omega, omegaMax, sky = 0) => {
        if (stopped) return
        const params = whooshParams(omega, omegaMax)
        const now = ctx.currentTime
        band.frequency.setTargetAtTime(params.bandHz, now, 0.08)
        noiseGain.gain.setTargetAtTime(params.noiseGain, now, 0.08)
        rumble.frequency.setTargetAtTime(params.rumbleHz, now, 0.12)
        rumbleGain.gain.setTargetAtTime(params.rumbleGain, now, 0.12)
        droneGain.gain.setTargetAtTime(DRONE_GAIN * sky, now, 0.25)
      },
      fadeOut: (ms) => {
        if (stopped) return
        const now = ctx.currentTime
        master.gain.cancelScheduledValues(now)
        master.gain.setValueAtTime(master.gain.value, now)
        master.gain.linearRampToValueAtTime(0, now + ms / 1000)
        window.setTimeout(stop, ms + 80)
      },
      stop,
    }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ chime

// A partial of a struck or bowed tone: its ratio to the base, level, decay.
type Tone = readonly [ratio: number, gain: number, decay: number]

const strike = (
  audio: AudioOut,
  baseHz: number,
  partials: readonly Tone[],
  options: { start?: number; type?: OscillatorType; level: number },
) => {
  for (const [ratio, gain, decay] of partials) {
    pluck(audio, {
      freq: baseHz * ratio,
      decay,
      gain: gain * options.level,
      start: options.start,
      type: options.type,
      attack: 0.003,
    })
  }
}

const CHIME_LEVEL = 0.16

const CHIMES: Record<Tier, (audio: AudioOut) => void> = {
  // Glass: inharmonic partials, a bright "ting" and a long cold shimmer.
  frost: (audio) => {
    strike(
      audio,
      1318.5,
      [
        [1, 1, 2.2],
        [2.76, 0.55, 1.4],
        [5.4, 0.28, 0.8],
        [8.93, 0.14, 0.45],
      ],
      { level: CHIME_LEVEL },
    )
    burst(audio, {
      centerHz: 7000,
      q: 1.2,
      type: 'highpass',
      decay: 0.04,
      gain: 0.05,
    })
  },
  // Bell: hum, prime, tierce, quint and nominal, as a struck bell rings.
  amethyst: (audio) => {
    strike(
      audio,
      523.25,
      [
        [0.5, 0.55, 3.4],
        [1, 1, 3.0],
        [1.19, 0.6, 2.3],
        [1.5, 0.4, 1.8],
        [2, 0.5, 1.6],
        [2.67, 0.2, 1.0],
      ],
      { level: CHIME_LEVEL },
    )
  },
  // Breath: a swell of filtered air over a soft fifth.
  jade: (audio) => {
    burst(audio, {
      centerHz: 600,
      toHz: 1100,
      q: 1.6,
      attack: 0.5,
      decay: 1.5,
      gain: 0.1,
    })
    for (const [hz, gain] of [
      [392, 0.1],
      [587.3, 0.06],
    ] as const) {
      pluck(audio, {
        freq: hz,
        attack: 0.4,
        decay: 1.9,
        gain,
        type: 'sine',
      })
    }
  },
  // Gold: a warm major-seventh chord with a sparkle on top.
  gold: (audio) => {
    for (const hz of [261.63, 329.63, 392, 493.88, 523.25]) {
      pluck(audio, {
        freq: hz,
        attack: 0.07,
        decay: 3.2,
        gain: 0.06,
        type: 'triangle',
      })
      pluck(audio, {
        freq: hz * 2,
        attack: 0.07,
        decay: 2.4,
        gain: 0.018,
      })
    }
    strike(audio, 2093, [[1, 1, 1.6]], { start: 0.12, level: 0.05 })
    strike(audio, 2637, [[1, 1, 1.4]], { start: 0.26, level: 0.04 })
  },
}

// The peak: the sky has just reached full strength.
export const playPeakChime = (tier: Tier) => {
  if (!eggsOn()) return
  const audio = getAudio()
  if (!audio) return
  try {
    CHIMES[tier](audio)
  } catch {
    // Sound must never break the run.
  }
}

// The landing, as the card opens. Gold gets a longer, deeper boom.
export const playLandingThud = (tier: Tier) => {
  if (!eggsOn()) return
  const audio = getAudio()
  if (!audio) return
  try {
    const gold = tier === 'gold'
    pluck(audio, {
      freq: gold ? 120 : 150,
      toFreq: gold ? 38 : 48,
      decay: gold ? 0.7 : 0.38,
      gain: gold ? 0.5 : 0.4,
    })
    burst(audio, {
      centerHz: 380,
      q: 0.7,
      type: 'lowpass',
      decay: 0.06,
      gain: 0.14,
    })
  } catch {
    // Sound must never break the run.
  }
}
