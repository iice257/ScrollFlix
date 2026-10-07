import type { Tier } from './shuffle-pro-logic'

// Found Shuffle Pro paths persist across refreshes (a future stats page reads
// them). Streak counters deliberately do not: they live in memory only.

export const SHUFFLE_PRO_STORAGE_KEY = 'wtw:shuffle-pro:v1'

export type FoundEntry = { count: number; firstAt: number; lastAt: number }

export type ShuffleProData = {
  found: Partial<Record<Tier, FoundEntry>>
  totalRuns: number
}

const EMPTY: ShuffleProData = { found: {}, totalRuns: 0 }
const TIERS: readonly Tier[] = ['frost', 'amethyst', 'jade', 'gold']

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// Anything unreadable or from a different version falls back to empty.
export const parseShuffleProData = (raw: string | null): ShuffleProData => {
  if (!raw) return EMPTY
  try {
    const parsed = JSON.parse(raw) as {
      v?: unknown
      found?: Record<string, Partial<FoundEntry>>
      totalRuns?: unknown
    }
    if (parsed?.v !== 1 || typeof parsed.found !== 'object' || !parsed.found) {
      return EMPTY
    }
    const found: ShuffleProData['found'] = {}
    for (const tier of TIERS) {
      const entry = parsed.found[tier]
      if (
        entry &&
        isNumber(entry.count) &&
        isNumber(entry.firstAt) &&
        isNumber(entry.lastAt)
      ) {
        found[tier] = {
          count: Math.max(1, Math.floor(entry.count)),
          firstAt: entry.firstAt,
          lastAt: entry.lastAt,
        }
      }
    }
    return {
      found,
      totalRuns: isNumber(parsed.totalRuns)
        ? Math.max(0, Math.floor(parsed.totalRuns))
        : Object.values(found).reduce((sum, e) => sum + (e?.count ?? 0), 0),
    }
  } catch {
    return EMPTY
  }
}

export const recordRun = (
  data: ShuffleProData,
  tier: Tier,
  now: number,
): ShuffleProData => {
  const previous = data.found[tier]
  return {
    found: {
      ...data.found,
      [tier]: {
        count: (previous?.count ?? 0) + 1,
        firstAt: previous?.firstAt ?? now,
        lastAt: now,
      },
    },
    totalRuns: data.totalRuns + 1,
  }
}

let cache: ShuffleProData | null = null
const listeners = new Set<() => void>()

const load = (): ShuffleProData => {
  if (cache) return cache
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(SHUFFLE_PRO_STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  cache = parseShuffleProData(raw)
  return cache
}

const save = (data: ShuffleProData) => {
  cache = data
  try {
    window.localStorage.setItem(
      SHUFFLE_PRO_STORAGE_KEY,
      JSON.stringify({ v: 1, ...data }),
    )
  } catch {
    // Keep the in-memory copy; persistence is best effort.
  }
  for (const listener of listeners) listener()
}

export const shuffleProStore = {
  get: load,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  recordRun(tier: Tier, now = Date.now()) {
    save(recordRun(load(), tier, now))
  },
  reset() {
    save(EMPTY)
  },
}
