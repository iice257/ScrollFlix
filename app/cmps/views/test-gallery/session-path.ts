// History (the session path): the films you have landed on, in order. Shuffles
// and opened posters add a point; a Shuffle Pro run adds a point in its path's
// colour. It is drawn over the globe as a thin thread of light, can be walked
// back through, and can be shared. It is kept in this browser's local storage,
// so it lasts across visits until accounts arrive, and nothing leaves the
// device.

import { migrateLegacyId } from './catalog-loader'
import type { Tier } from './shuffle-pro/shuffle-pro-logic'

export type PathPoint = {
  id: string
  // The Shuffle Pro path that found it, or null for a plain landing.
  tier: Tier | null
  // When it was added (ms), so the newest link can draw itself in.
  at: number
}

export const MAX_PATH = 60
export const PATH_STORAGE_KEY = 'wtw:session-path:v1'

// Light and dark ink for each Shuffle Pro path, as "r, g, b" (from the sky
// palettes so a point matches the run that made it).
export const PATH_INK: Record<Tier, { dark: string; light: string }> = {
  frost: { dark: '150, 220, 255', light: '30, 110, 190' },
  amethyst: { dark: '201, 167, 255', light: '120, 70, 210' },
  jade: { dark: '95, 227, 197', light: '14, 130, 104' },
  gold: { dark: '247, 213, 139', light: '170, 112, 10' },
}

// Adds a landing. The same film twice in a row is one point, and a path found
// on the latest point upgrades it in place.
export const addToPath = (
  path: readonly PathPoint[],
  id: string,
  tier: Tier | null,
  now: number,
): PathPoint[] => {
  const last = path[path.length - 1]
  if (last && last.id === id) {
    return tier && last.tier !== tier
      ? [...path.slice(0, -1), { ...last, tier }]
      : [...path]
  }
  return [...path, { id, tier, at: now }].slice(-MAX_PATH)
}

const TIERS: readonly string[] = ['frost', 'amethyst', 'jade', 'gold']

export const parsePath = (raw: string | null): PathPoint[] => {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: PathPoint[] = []
    for (const item of parsed) {
      const entry = item as Partial<PathPoint> | null
      if (entry && typeof entry.id === 'string') {
        out.push({
          // Ids from before catalogue v2 (`${index}-${tmdbId}`) become `c${tmdbId}`.
          id: migrateLegacyId(entry.id),
          tier:
            typeof entry.tier === 'string' && TIERS.includes(entry.tier)
              ? (entry.tier as Tier)
              : null,
          // Old points are not "new": they never animate.
          at: 0,
        })
      }
    }
    return out.slice(-MAX_PATH)
  } catch {
    return []
  }
}

let current: readonly PathPoint[] | null = null
const listeners = new Set<() => void>()

const readStored = (kind: 'localStorage' | 'sessionStorage') => {
  try {
    return window[kind].getItem(PATH_STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
    return null
  }
}

const load = (): readonly PathPoint[] => {
  if (current) return current
  // The path used to last for the tab only: adopt one left there.
  current = parsePath(
    readStored('localStorage') ?? readStored('sessionStorage'),
  )
  return current
}

const set = (next: readonly PathPoint[]) => {
  current = next
  try {
    window.localStorage.setItem(
      PATH_STORAGE_KEY,
      JSON.stringify(next.map(({ id, tier }) => ({ id, tier }))),
    )
    window.sessionStorage.removeItem(PATH_STORAGE_KEY)
  } catch {
    // Keep the in-memory copy; persistence is best effort.
  }
  for (const listener of listeners) listener()
}

export const sessionPathStore = {
  get: load,
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  add: (id: string, tier: Tier | null = null) =>
    set(addToPath(load(), id, tier, Date.now())),
  clear: () => {
    if (load().length) set([])
  },
  // Test helper: forget the cache so the next read hits storage again.
  reset: () => {
    current = null
    for (const listener of listeners) listener()
  },
}
