// The jingle for an Easter egg's reveal: one short, royalty-free sting per
// path, played as the card opens.
//
//   frost      a fast glass ripple up a pentatonic run, the top note lingering
//   amethyst   a wobbly arpeggio, up and back, dreamy and a little mysterious
//   jade       a bright marimba run, airy and light
//   gold       brass and a bell cascade into a held C-major chord, the grandest
//
// They were written for this project and live in the same sprite as the
// interface clicks (see public/media/sfx/LICENSE.txt). Each is levelled to its
// tier in sound-plan.json, a few LU louder each step up from frost to gold, so
// a gold reveal is plainly the bigger one. A soft reverb and a faint echo give
// the sting a tail; nothing else plays over it.
//
// It follows the "Easter egg sounds" switch, so it is on by default and goes
// quiet with the rest of the egg sounds.

import {
  type Bank,
  loadBank,
  pickVariant,
  prefetchBank,
} from '../../../../audio/sound-bank'
import { type AudioOut, getAudio } from '../../../../audio/sound-engine'
import { soundStore } from '../../../../audio/sound-settings'
import type { Tier } from './shuffle-pro-logic'

// How much room each tier gets. Loudness is not set here: the clips are
// levelled to the plan, and the ladder from frost to gold is in the sprite.
const MIX: Record<Tier, { reverb: number }> = {
  frost: { reverb: 0.45 },
  amethyst: { reverb: 0.55 },
  jade: { reverb: 0.4 },
  gold: { reverb: 0.65 },
}

const REVERB_SECONDS = 2.2
const TAIL_SECONDS = 3

export type Music = { stop: (fadeMs?: number) => void }

const impulses = new WeakMap<BaseAudioContext, AudioBuffer>()

// Fetches the clips ahead of time so the reveal never waits on them.
export const preloadJingle = () => {
  void prefetchBank()
}

const reverbImpulse = (ctx: BaseAudioContext) => {
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

// One jingle clip: a slice of some decoded buffer. The shipped ones live in
// the sprite bank; the audition page also plays candidates from its own.
export type JingleClip = {
  name: string
  buffer: AudioBuffer
  start: number
  length: number
}

export type RevealPlay = {
  clip: string
  seconds: number
  bus: GainNode
  source: AudioBufferSourceNode
  nodes: AudioNode[]
}

// Schedules a reveal on any output, live or offline: the jingle through its
// reverb and echo, and nothing else over it. `at` is seconds
// from now. Returns the nodes so a live caller can fade and free them.
export const scheduleReveal = (
  { ctx, out }: AudioOut,
  tier: Tier,
  bank: Bank,
  options: { at?: number; clip?: JingleClip } = {},
): RevealPlay | null => {
  const at = options.at ?? 0
  let clip = options.clip
  if (!clip) {
    const name = pickVariant(bank.manifest, tier)
    const entry = name ? bank.manifest[name] : null
    if (!name || !entry) return null
    clip = { name, buffer: bank.buffer, start: entry[0], length: entry[1] }
  }
  const mix = MIX[tier]
  const bus = ctx.createGain()
  bus.gain.value = 1
  const source = ctx.createBufferSource()
  source.buffer = clip.buffer
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
  source.connect(bus)
  bus.connect(out)
  bus.connect(wet).connect(convolver).connect(out)
  bus.connect(echo).connect(delay)
  delay.connect(feedback).connect(delay)
  delay.connect(out)
  source.start(ctx.currentTime + at, clip.start, clip.length + 0.01)
  return {
    clip: clip.name,
    seconds: at + clip.length + TAIL_SECONDS,
    bus,
    source,
    nodes: [bus, source, wet, convolver, delay, feedback, echo],
  }
}

let current: Music | null = null

export const stopPresentationMusic = (fadeMs = 900) => {
  current?.stop(fadeMs)
  current = null
}

// Plays a jingle for a path. Returns null when the egg sounds are off or
// audio was never unlocked. Starting again replaces whatever is playing.
export const startPresentationMusic = (tier: Tier): Music | null => {
  if (!soundStore.get().eggs) return null
  const audio = getAudio()
  if (!audio) return null
  stopPresentationMusic(250)
  const { ctx } = audio

  let play: RevealPlay | null = null
  let stopped = false
  let endTimer = 0

  const finish = () => {
    if (stopped) return
    stopped = true
    window.clearTimeout(endTimer)
    try {
      play?.source.stop()
    } catch {
      // Already stopped.
    }
    for (const node of play?.nodes ?? []) node.disconnect()
    if (current === music) current = null
  }

  const music: Music = {
    stop: (fadeMs = 900) => {
      if (stopped) return
      window.clearTimeout(endTimer)
      if (play) {
        const now = ctx.currentTime
        play.bus.gain.cancelScheduledValues(now)
        play.bus.gain.setValueAtTime(play.bus.gain.value, now)
        play.bus.gain.linearRampToValueAtTime(0, now + fadeMs / 1000)
      }
      endTimer = window.setTimeout(finish, fadeMs + 80)
    },
  }
  current = music

  void loadBank(ctx).then((bank) => {
    // Stopped, or replaced, while the clips were loading.
    if (stopped || current !== music) return
    if (!bank) {
      finish()
      return
    }
    try {
      play = scheduleReveal(audio, tier, bank)
      if (!play) {
        finish()
        return
      }
      endTimer = window.setTimeout(finish, play.seconds * 1000)
    } catch (error) {
      if (import.meta.env.DEV) console.warn('Reveal jingle failed', error)
      finish()
    }
  })
  return music
}
