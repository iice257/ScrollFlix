// The music for an Easter egg's presentation: a short piece for each path,
// played from the peak while the card is on screen.
//
// It is written as a score first (a list of timed notes, built by pure code
// and covered by tests) and only then handed to Web Audio, where every note is
// scheduled up front. Nothing runs on a timer, so stopping it early is a fade
// and a handful of oscillator stops, and nothing accumulates.
//
//   frost      glassy and cold: a major seventh progression, bright bell arps
//   amethyst   cinematic: D minor falling to a dominant, struck-bell arps
//   jade       airy: a lydian drift with long, slow breathing notes
//   gold       grand: a rising major progression that lands on a held chord
//
// It follows the "Easter egg sounds" switch, so it is on by default and goes
// quiet with the rest of the egg sounds.

import { getAudio, pluck } from '../../../../audio/sound-engine'
import { soundStore } from '../../../../audio/sound-settings'
import type { Tier } from './shuffle-pro-logic'

export type NoteKind = 'pad' | 'bass' | 'arp' | 'bell' | 'final'

export type ScoreNote = {
  at: number
  hz: number
  kind: NoteKind
  gain: number
  attack: number
  decay: number
  type: OscillatorType
  detune?: number
}

export type Score = { notes: ScoreNote[]; length: number }

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

type Chord = { bass: number; pad: number[] }

type Piece = {
  // Seconds each chord lasts.
  chordLength: number
  chords: Chord[]
  // The note pool the arpeggio draws from, as MIDI numbers.
  pool: number[]
  // Steps into the pool for each arpeggio note within a chord.
  pattern: number[]
  // Arpeggio timbre.
  arp: { type: OscillatorType; gain: number; decay: number; bell: boolean }
  pad: { type: OscillatorType; gain: number; attack: number }
  // The last chord is held for this long (seconds) and takes the final notes.
  finale: { chord: Chord; length: number; sparkle: number[] }
}

const PIECES: Record<Tier, Piece> = {
  frost: {
    chordLength: 2.8,
    chords: [
      { bass: 45, pad: [57, 61, 64, 68] },
      { bass: 42, pad: [54, 57, 61, 64] },
      { bass: 38, pad: [62, 66, 69, 73] },
      { bass: 40, pad: [59, 64, 68, 71] },
    ],
    pool: [69, 71, 73, 76, 78, 81, 83, 85],
    pattern: [0, 2, 4, 3, 5, 4],
    arp: { type: 'sine', gain: 0.07, decay: 1.7, bell: true },
    pad: { type: 'triangle', gain: 0.045, attack: 1.2 },
    finale: {
      chord: { bass: 45, pad: [57, 64, 68, 73] },
      length: 4.2,
      sparkle: [93, 88, 85],
    },
  },
  amethyst: {
    chordLength: 3.1,
    chords: [
      { bass: 38, pad: [50, 57, 60, 64] },
      { bass: 46, pad: [58, 62, 65, 69] },
      { bass: 43, pad: [55, 58, 62, 65] },
      { bass: 45, pad: [57, 61, 64, 67] },
    ],
    pool: [62, 65, 67, 69, 72, 74, 77, 79],
    pattern: [0, 3, 2, 4, 3, 5],
    arp: { type: 'triangle', gain: 0.07, decay: 2.1, bell: true },
    pad: { type: 'sine', gain: 0.055, attack: 1.3 },
    finale: {
      chord: { bass: 38, pad: [50, 57, 62, 65, 69] },
      length: 4.6,
      sparkle: [86, 81, 77],
    },
  },
  jade: {
    chordLength: 3.4,
    chords: [
      { bass: 48, pad: [55, 59, 64, 67] },
      { bass: 52, pad: [55, 59, 62, 67] },
      { bass: 41, pad: [53, 57, 60, 64] },
      { bass: 43, pad: [55, 59, 62, 69] },
    ],
    pool: [67, 69, 72, 74, 76, 79, 81, 84],
    pattern: [0, 1, 3, 2, 4, 3],
    arp: { type: 'sine', gain: 0.06, decay: 2.6, bell: false },
    pad: { type: 'sine', gain: 0.06, attack: 1.6 },
    finale: {
      chord: { bass: 48, pad: [55, 60, 64, 67, 71] },
      length: 4.8,
      sparkle: [91, 86, 79],
    },
  },
  gold: {
    chordLength: 3.2,
    chords: [
      { bass: 36, pad: [48, 55, 60, 64, 67] },
      { bass: 45, pad: [57, 60, 64, 67] },
      { bass: 41, pad: [53, 60, 64, 69] },
      { bass: 43, pad: [55, 59, 62, 64, 69] },
    ],
    pool: [60, 64, 67, 71, 72, 76, 79, 83],
    pattern: [0, 2, 4, 6, 5, 7],
    arp: { type: 'triangle', gain: 0.075, decay: 2.2, bell: true },
    pad: { type: 'triangle', gain: 0.055, attack: 1.1 },
    finale: {
      chord: { bass: 36, pad: [48, 55, 59, 64, 67, 74] },
      length: 5.6,
      sparkle: [96, 91, 88, 84],
    },
  },
}

// The score for a path: pads and bass per chord, an arpeggio over each, then
// the held finale with a few high bells.
export const buildScore = (tier: Tier): Score => {
  const piece = PIECES[tier]
  const notes: ScoreNote[] = []
  const stepGap = piece.chordLength / 9

  piece.chords.forEach((chord, chordIndex) => {
    const start = chordIndex * piece.chordLength
    const decay = piece.chordLength * 0.9

    notes.push({
      at: start,
      hz: hz(chord.bass),
      kind: 'bass',
      gain: 0.1,
      attack: 0.5,
      decay: decay + 0.6,
      type: 'sine',
    })
    for (const midi of chord.pad) {
      for (const detune of [-5, 5]) {
        notes.push({
          at: start,
          hz: hz(midi),
          kind: 'pad',
          gain: piece.pad.gain,
          attack: piece.pad.attack,
          decay,
          type: piece.pad.type,
          detune,
        })
      }
    }
    piece.pattern.forEach((step, noteIndex) => {
      const pitch = piece.pool[(step + chordIndex * 2) % piece.pool.length]
      notes.push({
        at: start + 0.45 + noteIndex * stepGap * 1.4,
        hz: hz(pitch),
        kind: piece.arp.bell ? 'bell' : 'arp',
        gain: piece.arp.gain * (1 - noteIndex * 0.06),
        attack: piece.arp.bell ? 0.004 : 0.35,
        decay: piece.arp.decay,
        type: piece.arp.type,
      })
    })
  })

  const finaleStart = piece.chords.length * piece.chordLength
  notes.push({
    at: finaleStart,
    hz: hz(piece.finale.chord.bass),
    kind: 'bass',
    gain: 0.11,
    attack: 0.4,
    decay: piece.finale.length + 0.4,
    type: 'sine',
  })
  for (const midi of piece.finale.chord.pad) {
    for (const detune of [-6, 6]) {
      notes.push({
        at: finaleStart,
        hz: hz(midi),
        kind: 'final',
        gain: piece.pad.gain * 1.1,
        attack: 0.9,
        decay: piece.finale.length,
        type: piece.pad.type,
        detune,
      })
    }
  }
  piece.finale.sparkle.forEach((pitch, index) => {
    notes.push({
      at: finaleStart + 0.3 + index * 0.42,
      hz: hz(pitch),
      kind: 'bell',
      gain: 0.05,
      attack: 0.004,
      decay: 2.2,
      type: 'sine',
    })
  })

  return { notes, length: finaleStart + piece.finale.length }
}

// A struck bell is a few partials with different lifetimes.
const BELL_PARTIALS: ReadonlyArray<
  readonly [ratio: number, level: number, decay: number]
> = [
  [1, 1, 1],
  [2.76, 0.32, 0.55],
  [5.4, 0.14, 0.3],
]

// --------------------------------------------------------------- playback

export type Music = { stop: (fadeMs?: number) => void }

const MUSIC_LEVEL = 1.3
const REVERB_SECONDS = 2.6

const impulses = new WeakMap<BaseAudioContext, AudioBuffer>()

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

// Starts the piece for a path. Returns null when the egg sounds are off or
// audio was never unlocked. Starting again replaces whatever is playing.
export const startPresentationMusic = (tier: Tier): Music | null => {
  if (!soundStore.get().eggs) return null
  const audio = getAudio()
  if (!audio) return null
  stopPresentationMusic(400)
  const { ctx, out } = audio

  try {
    const bus = ctx.createGain()
    bus.gain.setValueAtTime(0.0001, ctx.currentTime)
    bus.gain.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 1.6)
    const wet = ctx.createGain()
    wet.gain.value = 0.38
    const convolver = ctx.createConvolver()
    convolver.buffer = reverbImpulse(ctx)
    bus.connect(out)
    bus.connect(wet).connect(convolver).connect(out)

    const score = buildScore(tier)
    const voices: OscillatorNode[] = []
    const lead = 0.9
    for (const note of score.notes) {
      if (note.kind === 'bell') {
        for (const [ratio, level, decayScale] of BELL_PARTIALS) {
          voices.push(
            pluck(
              { ctx, out: bus },
              {
                freq: note.hz * ratio,
                decay: note.decay * decayScale,
                gain: note.gain * level,
                attack: note.attack,
                start: lead + note.at,
                type: note.type,
              },
            ),
          )
        }
        continue
      }
      voices.push(
        pluck(
          { ctx, out: bus },
          {
            freq: note.hz,
            decay: note.decay,
            gain: note.gain,
            attack: note.attack,
            start: lead + note.at,
            type: note.type,
            detune: note.detune,
          },
        ),
      )
    }

    let stopped = false
    const finish = () => {
      if (stopped) return
      stopped = true
      for (const voice of voices) {
        try {
          voice.stop()
        } catch {
          // Already stopped.
        }
      }
      bus.disconnect()
      wet.disconnect()
      convolver.disconnect()
      if (current === music) current = null
    }
    const endTimer = window.setTimeout(finish, (lead + score.length + 3) * 1000)
    const music: Music = {
      stop: (fadeMs = 900) => {
        if (stopped) return
        window.clearTimeout(endTimer)
        const now = ctx.currentTime
        bus.gain.cancelScheduledValues(now)
        bus.gain.setValueAtTime(bus.gain.value, now)
        bus.gain.linearRampToValueAtTime(0, now + fadeMs / 1000)
        window.setTimeout(finish, fadeMs + 80)
      },
    }
    current = music
    return music
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Presentation music failed', error)
    return null
  }
}
