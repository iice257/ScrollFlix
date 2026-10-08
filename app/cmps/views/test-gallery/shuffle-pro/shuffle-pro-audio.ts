// The Shuffle Pro whoosh: procedural Web Audio, no files and no network.
// Band-passed noise sweeps up with the spin speed and a quiet low rumble sits
// underneath. The AudioContext is only created and resumed inside a real user
// gesture (the first globe pointerdown), because Safari refuses otherwise and
// runs start seconds later from timers.

export const EGG_SOUND_STORAGE_KEY = 'wtw:sound:egg'

const listeners = new Set<() => void>()

export const readEggSoundEnabled = () => {
  try {
    return window.localStorage.getItem(EGG_SOUND_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

let eggSoundEnabled: boolean | null = null

export const eggSoundStore = {
  get: () => {
    eggSoundEnabled ??= readEggSoundEnabled()
    return eggSoundEnabled
  },
  set: (enabled: boolean) => {
    eggSoundEnabled = enabled
    try {
      window.localStorage.setItem(EGG_SOUND_STORAGE_KEY, enabled ? '1' : '0')
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
    for (const listener of listeners) listener()
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export const WHOOSH_BAND_MIN_HZ = 200
export const WHOOSH_BAND_MAX_HZ = 2400
export const WHOOSH_RUMBLE_MIN_HZ = 40
export const WHOOSH_RUMBLE_MAX_HZ = 60
export const WHOOSH_NOISE_GAIN = 0.2
export const WHOOSH_RUMBLE_GAIN = 0.1

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

let context: AudioContext | null = null

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
    }
    if (context.state === 'suspended') void context.resume()
  } catch {
    context = null
  }
}

export type Whoosh = {
  update: (omega: number, omegaMax: number) => void
  fadeOut: (ms: number) => void
  stop: () => void
}

let noiseBuffer: AudioBuffer | null = null

const getNoise = (ctx: AudioContext) => {
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

// Returns null when sound is off or the context was never unlocked.
export const createWhoosh = (): Whoosh | null => {
  if (!eggSoundStore.get()) return null
  const ctx = context
  if (!ctx || ctx.state !== 'running') return null

  try {
    const master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)

    const noise = ctx.createBufferSource()
    noise.buffer = getNoise(ctx)
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

    noise.start()
    rumble.start()

    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      try {
        noise.stop()
        rumble.stop()
      } catch {
        // Already stopped.
      }
      master.disconnect()
    }

    return {
      update: (omega, omegaMax) => {
        if (stopped) return
        const params = whooshParams(omega, omegaMax)
        const now = ctx.currentTime
        band.frequency.setTargetAtTime(params.bandHz, now, 0.08)
        noiseGain.gain.setTargetAtTime(params.noiseGain, now, 0.08)
        rumble.frequency.setTargetAtTime(params.rumbleHz, now, 0.12)
        rumbleGain.gain.setTargetAtTime(params.rumbleGain, now, 0.12)
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
