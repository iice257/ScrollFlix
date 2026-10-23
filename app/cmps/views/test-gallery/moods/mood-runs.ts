// The three Shuffle Pro paths only the mood page can start. Each is found by
// doing something with the page that says something about taste, never by
// luck, and each run is made from what was picked:
//
//   Resonance  land on an odd pair, two worlds that pull against each other.
//   Eclipse    keep coming back: one world in three landings, or two worlds in
//              two landings each. Blends and multi-select count.
//   Wanderer   try the worlds on: any 3 within 10s, any 5 within 20s, or all 6
//              in one visit at any pace.
//
// Everything here is pure; the page keeps the memory and the store.

import { type MoodRunStart, paletteFromAccents } from '../shuffle-pro/mood-run'
import {
  type MoodPath,
  type Tier,
  isMoodPathBlocked,
} from '../shuffle-pro/shuffle-pro-logic'
import { MOOD_WORLDS, type MoodFilter, type MoodTimeId } from './mood-worlds'

const accentOf = (id: MoodFilter) =>
  MOOD_WORLDS.find((world) => world.id === id)?.accent ?? '#ffffff'

// ------------------------------------------------------------- Resonance

// Worlds that pull against each other.
export const ODD_PAIRS: ReadonlyArray<readonly [MoodFilter, MoodFilter]> = [
  ['dark', 'funny'],
  ['romantic', 'fast'],
  ['weird', 'highRated'],
]

export const isOddPair = (selected: readonly MoodFilter[]) =>
  selected.length === 2 &&
  ODD_PAIRS.some(
    ([a, b]) =>
      (selected[0] === a && selected[1] === b) ||
      (selected[0] === b && selected[1] === a),
  )

// ---------------------------------------------------------------- Eclipse

// How many landings a world has been part of, across visits.
export type Landings = Partial<Record<MoodFilter, number>>

export const LANDING_CAP = 99

export const ECLIPSE_RULES = {
  // One world in this many landings...
  oneWorld: 3,
  // ...or this many worlds, each in this many.
  manyWorlds: { worlds: 2, landings: 2 },
} as const

export const recordLanding = (
  counts: Landings,
  selected: readonly MoodFilter[],
): Landings => {
  const next = { ...counts }
  for (const id of selected) {
    next[id] = Math.min(LANDING_CAP, (next[id] ?? 0) + 1)
  }
  return next
}

// The worlds that earned an Eclipse, or none.
export const eclipseWorlds = (counts: Landings): MoodFilter[] => {
  const worlds = MOOD_WORLDS.map((world) => world.id)
  const often = worlds.filter(
    (id) => (counts[id] ?? 0) >= ECLIPSE_RULES.oneWorld,
  )
  if (often.length) return often
  const { worlds: needed, landings } = ECLIPSE_RULES.manyWorlds
  const twice = worlds.filter((id) => (counts[id] ?? 0) >= landings)
  return twice.length >= needed ? twice : []
}

// One landing away from a single-world Eclipse: the page says so quietly.
export const eclipseHint = (
  counts: Landings,
  selected: readonly MoodFilter[],
): MoodFilter | null =>
  [...selected]
    .reverse()
    .find((id) => (counts[id] ?? 0) === ECLIPSE_RULES.oneWorld - 1) ?? null

// ---------------------------------------------------------------- Wanderer

export type MoodPick = { id: MoodFilter; at: number }

export type WandererSize = 3 | 5 | 6

export const WANDERER_RULES = {
  quick: { worlds: 3, ms: 10_000 },
  steady: { worlds: 5, ms: 20_000 },
  all: 6,
} as const

const MAX_PICKS = 60

// Choosing a world counts; un-choosing one does not.
export const notePick = (
  picks: readonly MoodPick[],
  id: MoodFilter,
  at: number,
): MoodPick[] => [...picks, { id, at }].slice(-MAX_PICKS)

const distinctWithin = (picks: readonly MoodPick[], end: number, ms: number) =>
  new Set(
    picks
      .filter((pick) => pick.at <= end && pick.at >= end - ms)
      .map((p) => p.id),
  ).size

// The biggest Wanderer these picks reached. Each pick is tried as the end of a
// window, so a long think after the last pick does not undo it.
export const wandererReached = (
  picks: readonly MoodPick[],
): WandererSize | null => {
  if (new Set(picks.map((pick) => pick.id)).size >= WANDERER_RULES.all) return 6
  let best: WandererSize | null = null
  for (const { at } of picks) {
    const { quick, steady } = WANDERER_RULES
    if (distinctWithin(picks, at, steady.ms) >= steady.worlds) return 5
    if (distinctWithin(picks, at, quick.ms) >= quick.worlds) best = 3
  }
  return best
}

// ---------------------------------------------------------------- the run

// The look each world borrows: crisp and bright, soft glitter, or smoke.
const LOOK_FOR: Record<MoodFilter, Tier> = {
  fast: 'frost',
  highRated: 'frost',
  funny: 'amethyst',
  romantic: 'amethyst',
  dark: 'jade',
  weird: 'jade',
}

// Fast worlds run harder; dark and romantic ones run slower and deeper.
const ENERGY_FOR: Record<MoodFilter, number> = {
  fast: 1.25,
  funny: 1.1,
  weird: 1.1,
  highRated: 1,
  romantic: 0.85,
  dark: 0.8,
}

// The time choice sets how long a run lasts.
const TIME_LENGTH: Record<MoodTimeId, number> = {
  any: 1,
  movieUnder90: 0.7,
  movie90to120: 1,
  movieOver120: 1.3,
}

const WANDERER_LENGTH: Record<WandererSize, number> = {
  3: 0.75,
  5: 0.9,
  6: 1.1,
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

// More films that fit, more particles in the sky.
export const densityFor = (filmCount: number) =>
  clamp(
    0.4 + (0.6 * Math.log10(Math.max(0, filmCount) + 1)) / Math.log10(2000),
    0.4,
    1,
  )

export type MoodRunInputs = {
  // In the order they were picked; the last one leads.
  selected: readonly MoodFilter[]
  time: MoodTimeId
  filmCount: number
  picks: readonly MoodPick[]
  // The counts before this landing.
  landings: Landings
  found: Partial<Record<MoodPath, unknown>>
}

export type MoodPlan = {
  run: MoodRunStart | null
  // The counts to keep: this landing included, and spent once an Eclipse fires.
  landings: Landings
}

const buildRun = (
  path: MoodPath,
  worlds: readonly MoodFilter[],
  { time, filmCount }: Pick<MoodRunInputs, 'time' | 'filmCount'>,
  size: WandererSize | null,
): MoodRunStart => {
  // The lead world's accent comes first, then the rest as they were picked.
  const lead = worlds[worlds.length - 1]
  const ordered = [lead, ...worlds.filter((id) => id !== lead)]
  const wanderer = path === 'wanderer'
  const length = clamp(
    TIME_LENGTH[time] * (size ? WANDERER_LENGTH[size] : 1),
    0.55,
    1.5,
  )
  return {
    path,
    look: wanderer ? 'amethyst' : LOOK_FOR[lead],
    palette: paletteFromAccents(ordered.map(accentOf)),
    energy: wanderer ? 1.05 : ENERGY_FOR[lead],
    length,
    density: densityFor(filmCount),
  }
}

// Decides whether this landing earns a run, and which. When more than one
// path qualifies the rarest wins (Eclipse, then Resonance, then Wanderer); the
// others stay available for next time.
export const planMoodRun = (input: MoodRunInputs): MoodPlan => {
  const counts = recordLanding(input.landings, input.selected)
  const open = (path: MoodPath) => !isMoodPathBlocked(path, input.found)

  const eclipse = open('eclipse') ? eclipseWorlds(counts) : []
  if (eclipse.length) {
    // The worlds picked just now lead; the others follow in menu order.
    const picked = input.selected.filter((id) => eclipse.includes(id))
    const worlds = [...eclipse.filter((id) => !picked.includes(id)), ...picked]
    const spent = { ...counts }
    for (const id of eclipse) delete spent[id]
    return { run: buildRun('eclipse', worlds, input, null), landings: spent }
  }

  if (isOddPair(input.selected) && open('resonance')) {
    return {
      run: buildRun('resonance', input.selected, input, null),
      landings: counts,
    }
  }

  const size = open('wanderer') ? wandererReached(input.picks) : null
  if (size) {
    const seen: MoodFilter[] = []
    for (const { id } of input.picks) {
      const at = seen.indexOf(id)
      if (at >= 0) seen.splice(at, 1)
      seen.push(id)
    }
    return {
      run: buildRun('wanderer', seen, input, size),
      landings: counts,
    }
  }

  return { run: null, landings: counts }
}
