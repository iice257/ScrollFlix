// The impure edge of the mood runs: reads what is found and remembered, asks
// the pure rules what this landing earns, and keeps the new counts.

import { isMoodPathBlocked } from '../shuffle-pro/shuffle-pro-logic'
import { shuffleProStore } from '../shuffle-pro/shuffle-pro-store'
import { readLandings, writeLandings } from './mood-memory'
import {
  type Landings,
  type MoodPick,
  type MoodPlan,
  eclipseHint,
  isOddPair,
  planMoodRun,
} from './mood-runs'
import type { MoodFilter, MoodTimeId } from './mood-worlds'

export type MoodVisit = {
  selected: readonly MoodFilter[]
  time: MoodTimeId
  filmCount: number
  picks: readonly MoodPick[]
}

const plan = (visit: MoodVisit, landings: Landings): MoodPlan => {
  const { moodPaths } = shuffleProStore.get()
  return planMoodRun({ ...visit, landings, found: moodPaths })
}

// What landing now would earn, without keeping anything.
export const previewMoodRun = (visit: MoodVisit, landings = readLandings()) =>
  plan(visit, landings).run

// Whether the pair chosen is one Resonance would still start on.
export const resonanceOpen = (selected: readonly MoodFilter[]) => {
  const { moodPaths } = shuffleProStore.get()
  return isOddPair(selected) && !isMoodPathBlocked('resonance', moodPaths)
}

// The world one landing from an Eclipse, if an Eclipse can still start.
export const eclipseNudge = (
  selected: readonly MoodFilter[],
  landings = readLandings(),
) => {
  const { moodPaths } = shuffleProStore.get()
  if (isMoodPathBlocked('eclipse', moodPaths)) return null
  return eclipseHint(landings, selected)
}

// Lands: keeps the counts and returns the run this landing earned, if any.
export const landMoodRun = (visit: MoodVisit) => {
  const result = plan(visit, readLandings())
  writeLandings(result.landings)
  return result.run
}
