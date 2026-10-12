// The jingle for an Easter egg's reveal: one short, royalty-free sting per
// path, played as the card opens.
//
//   frost      plucked strings climbing a glassy whole-tone scale
//   amethyst   the same scale falling back, dreamy and a little mysterious
//   jade       a bright plucked rise, airy and light
//   gold       a steel-drum fanfare that lands on its root, the grandest
//
// The clips are CC0, from Kenney's "Music Jingles" pack (see
// public/media/sfx/LICENSE.txt). Each is under 1.5 seconds; a soft reverb
// and a faint echo give it a shimmering tail without any more notes.
//
// It follows the "Easter egg sounds" switch, so it is on by default and goes
// quiet with the rest of the egg sounds.

import { getAudio } from '../../../../audio/sound-engine'
import { soundStore } from '../../../../audio/sound-settings'
import type { Tier } from './shuffle-pro-logic'

export const JINGLE_URLS: Record<Tier, string> = {
  frost: '/media/sfx/jingle-frost.mp3',
  amethyst: '/media/sfx/jingle-amethyst.mp3',
  jade: '/media/sfx/jingle-jade.mp3',
  gold: '/media/sfx/jingle-gold.mp3',
}

// How loud each plays and how much room it gets.
const MIX: Record<Tier, { level: number; reverb: number }> = {
  frost: { level: 1, reverb: 0.5 },
  amethyst: { level: 1, reverb: 0.55 },
  jade: { level: 1.05, reverb: 0.4 },
  gold: { level: 1.15, reverb: 0.6 },
}

const REVERB_SECONDS = 2.2
const TAIL_SECONDS = 3

export type Music = { stop: (fadeMs?: number) => void }

const bytes = new Map<Tier, Promise<ArrayBuffer | null>>()
const decoded = new WeakMap<BaseAudioContext, Map<Tier, AudioBuffer>>()
const impulses = new WeakMap<BaseAudioContext, AudioBuffer>()

// Fetches a tier's clip ahead of time so the reveal never waits on it.
export const preloadJingle = (tier: Tier) => {
  if (bytes.has(tier)) return
  bytes.set(
    tier,
    fetch(JINGLE_URLS[tier])
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null),
  )
}

const loadJingle = async (ctx: AudioContext, tier: Tier) => {
  let cache = decoded.get(ctx)
  if (!cache) {
    cache = new Map()
    decoded.set(ctx, cache)
  }
  const ready = cache.get(tier)
  if (ready) return ready
  preloadJingle(tier)
  const data = await bytes.get(tier)
  if (!data) return null
  try {
    // decodeAudioData takes the bytes it is given, so hand it a copy.
    const buffer = await ctx.decodeAudioData(data.slice(0))
    cache.set(tier, buffer)
    return buffer
  } catch {
    return null
  }
}

const reverbImpulse = (ctx: AudioContext) => {
  const cached = impulses.get(ctx)
  if (cached) return cached
  const length = Math.floor(ctx.sampleRate * REVERB_SECONDS)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2.6
    }
  }
  impulses.set(ctx, buffer)
  return buffer
}

let current: Music | null = null

export const stopPresentationMusic = (fadeMs = 900) => {
  current?.stop(fadeMs)
  current = null
}

// Plays the jingle for a path. Returns null when the egg sounds are off or
// audio was never unlocked. Starting again replaces whatever is playing.
export const startPresentationMusic = (tier: Tier): Music | null => {
  if (!soundStore.get().eggs) return null
  const audio = getAudio()
  if (!audio) return null
  stopPresentationMusic(250)
  const { ctx, out } = audio
  const mix = MIX[tier]

  const nodes: AudioNode[] = []
  let source: AudioBufferSourceNode | null = null
  let stopped = false
  let endTimer = 0

  const finish = () => {
    if (stopped) return
    stopped = true
    window.clearTimeout(endTimer)
    try {
      source?.stop()
    } catch {
      // Already stopped.
    }
    for (const node of nodes) node.disconnect()
    if (current === music) current = null
  }

  const bus = ctx.createGain()
  bus.gain.value = mix.level
  nodes.push(bus)
  const music: Music = {
    stop: (fadeMs = 900) => {
      if (stopped) return
      window.clearTimeout(endTimer)
      const now = ctx.currentTime
      bus.gain.cancelScheduledValues(now)
      bus.gain.setValueAtTime(bus.gain.value, now)
      bus.gain.linearRampToValueAtTime(0, now + fadeMs / 1000)
      endTimer = window.setTimeout(finish, fadeMs + 80)
    },
  }
  current = music

  void loadJingle(ctx, tier).then((buffer) => {
    // Stopped, or replaced, while the clip was loading.
    if (stopped || current !== music || !buffer) {
      if (!buffer) finish()
      return
    }
    try {
      source = ctx.createBufferSource()
      source.buffer = buffer
      const wet = ctx.createGain()
      wet.gain.value = mix.reverb
      const convolver = ctx.createConvolver()
      convolver.buffer = reverbImpulse(ctx)
      // A faint echo, so the sting trails off rather than stopping.
      const delay = ctx.createDelay(1)
      delay.delayTime.value = 0.28
      const feedback = ctx.createGain()
      feedback.gain.value = 0.3
      const echo = ctx.createGain()
      echo.gain.value = 0.2
      nodes.push(source, wet, convolver, delay, feedback, echo)

      source.connect(bus)
      bus.connect(out)
      bus.connect(wet).connect(convolver).connect(out)
      bus.connect(echo).connect(delay)
      delay.connect(feedback).connect(delay)
      delay.connect(out)
      source.start()
      endTimer = window.setTimeout(
        finish,
        (buffer.duration + TAIL_SECONDS) * 1000,
      )
    } catch (error) {
      if (import.meta.env.DEV) console.warn('Reveal jingle failed', error)
      finish()
    }
  })
  return music
}
