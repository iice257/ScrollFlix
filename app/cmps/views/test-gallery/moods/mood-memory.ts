// What the mood page remembers between visits: how many landings each world
// has been part of, which is what an Eclipse is made from. Storage that is
// missing or blocked just means the count starts again.

import { LANDING_CAP, type Landings } from './mood-runs'
import { MOOD_WORLDS } from './mood-worlds'

export const MOOD_LANDINGS_KEY = 'wtw:mood-landings:v1'

export const parseLandings = (raw: string | null): Landings => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const counts: Landings = {}
    for (const { id } of MOOD_WORLDS) {
      const value = parsed?.[id]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        counts[id] = Math.min(LANDING_CAP, Math.floor(value))
      }
    }
    return counts
  } catch {
    return {}
  }
}

export const readLandings = (): Landings => {
  try {
    return parseLandings(window.localStorage.getItem(MOOD_LANDINGS_KEY))
  } catch {
    return {}
  }
}

export const writeLandings = (counts: Landings) => {
  try {
    window.localStorage.setItem(MOOD_LANDINGS_KEY, JSON.stringify(counts))
  } catch {
    // Private mode or blocked storage: nothing to remember it with.
  }
}
