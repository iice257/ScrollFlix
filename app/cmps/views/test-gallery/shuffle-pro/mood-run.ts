// What a mood run is made of. The run itself is an ordinary Shuffle Pro run
// (the same spin, sky, particles and landing); this file holds the parts that
// make each one different: colours blended from the picked worlds, and the
// numbers that set its length, energy and particle density.

import type { MoodPath, Tier } from './shuffle-pro-logic'
import type { Palette } from './sky-pass'

type Rgb = [number, number, number]

// How a mood run is started. `look` is the existing path whose shader and
// particles it borrows; `palette` replaces that path's colours.
export type MoodRunStart = {
  path: MoodPath
  look: Tier
  palette: Palette
  // Scales the top spin speed (fast worlds run harder, dark ones softer).
  energy: number
  // Scales every step of the timeline (the time choice, the Wanderer's size).
  length: number
  // 0..1: how many particles the sky draws (the number of films that fit).
  density: number
}

// What the card needs to dress itself once the run has landed.
export type MoodPresentation = {
  path: MoodPath
  look: Tier
  palette: Palette
}

const WHITE: Rgb = [1, 1, 1]
const BLACK: Rgb = [0, 0, 0]

const parseHex = (value: string): Rgb => {
  const n = Number.parseInt(value.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

const byte = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)

const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => byte(v).toString(16).padStart(2, '0')).join('')}`

const toTriplet = ([r, g, b]: Rgb) => `${byte(r)} ${byte(g)} ${byte(b)}`

// A sky palette from the accents of the worlds a run was made from. The first
// accent leads. One accent gives a single-hue run, two blend into each other,
// and a long list (the Wanderer) spreads across the whole list.
export const paletteFromAccents = (accents: readonly string[]): Palette => {
  const list = (accents.length ? accents : ['#ffffff']).map(parseHex)
  const lead = list[0]
  const second = list[1] ?? lead
  const middle = list[Math.floor(list.length / 2)]
  const last = list[list.length - 1]
  const blend = mix(lead, second, 0.5)

  let c0: Rgb
  let c1: Rgb
  let c2: Rgb
  let accent: Rgb
  if (list.length >= 4) {
    c0 = mix(second, WHITE, 0.75)
    c1 = mix(middle, WHITE, 0.3)
    c2 = lead
    accent = mix(last, WHITE, 0.4)
  } else if (list.length >= 2) {
    c0 = mix(blend, WHITE, 0.8)
    c1 = mix(second, WHITE, 0.3)
    c2 = lead
    accent = mix(second, WHITE, 0.45)
  } else {
    c0 = mix(lead, WHITE, 0.78)
    c1 = mix(lead, WHITE, 0.35)
    c2 = lead
    accent = mix(lead, WHITE, 0.6)
  }

  return {
    c0,
    c1,
    c2,
    deep: mix(blend, BLACK, 0.86),
    accent,
    skyTop: mix(blend, WHITE, 0.3),
    skyBottom: mix(blend, WHITE, 0.88),
  }
}

// The card's colour variables (see the premium card in shuffle-pro.css). Set
// on the card itself, they replace what a path would have given it.
export const moodCardVars = (palette: Palette): Record<string, string> => ({
  '--sp-c0': toHex(palette.c0),
  '--sp-c1': toHex(palette.c1),
  '--sp-c2': toHex(palette.c2),
  '--sp-glow': toTriplet(palette.c2),
  '--sp-glow2': toTriplet(palette.accent),
  '--sp-kicker': toHex(palette.c1),
  '--sp-name-a': toHex(mix(palette.c0, WHITE, 0.5)),
  '--sp-name-b': toHex(mix(palette.c2, WHITE, 0.15)),
})

// Fixed colours for a path on the collection shelf, before any run has made
// its own: Resonance blends two worlds, Eclipse is one deep world, the
// Wanderer spreads across all six.
export const MOOD_PATH_SWATCHES: Record<MoodPath, string[]> = {
  resonance: ['#a78bfa', '#ffd23f'],
  eclipse: ['#a78bfa'],
  wanderer: ['#ff7a2f', '#ffd23f', '#5eead4', '#ff6b9d'],
}
