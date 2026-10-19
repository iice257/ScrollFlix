import { MOOD_PATHS, type MoodPath, type Tier } from './shuffle-pro-logic'

// Found Shuffle Pro paths persist across refreshes (a future stats page reads
// them). Streak counters deliberately do not: they live in memory only.

export const SHUFFLE_PRO_STORAGE_KEY = 'wtw:shuffle-pro:v1'

export type FoundEntry = { count: number; firstAt: number; lastAt: number }

export type ShuffleProData = {
  found: Partial<Record<Tier, FoundEntry>>
  // The bonus paths only the mood page starts. Kept apart from `found`, so
  // they never count toward Gold.
  moodPaths: Partial<Record<MoodPath, FoundEntry>>
  totalRuns: number
  // The longest streak of shuffles reached, kept for the run recap.
  bestStreak: number
  // Off by default: a path stops starting runs once it has been found.
  repeatFound: boolean
}

const EMPTY: ShuffleProData = {
  found: {},
  moodPaths: {},
  totalRuns: 0,
  bestStreak: 0,
  repeatFound: false,
}
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
      moodPaths?: Record<string, Partial<FoundEntry>>
      totalRuns?: unknown
      bestStreak?: unknown
      repeatFound?: unknown
    }
    if (parsed?.v !== 1 || typeof parsed.found !== 'object' || !parsed.found) {
      return EMPTY
    }
    const readEntries = <Key extends string>(
      source: Record<string, Partial<FoundEntry>> | undefined,
      keys: readonly Key[],
    ) => {
      const entries: Partial<Record<Key, FoundEntry>> = {}
      for (const key of keys) {
        const entry = source?.[key]
        if (
          entry &&
          isNumber(entry.count) &&
          isNumber(entry.firstAt) &&
          isNumber(entry.lastAt)
        ) {
          entries[key] = {
            count: Math.max(1, Math.floor(entry.count)),
            firstAt: entry.firstAt,
            lastAt: entry.lastAt,
          }
        }
      }
      return entries
    }
    const found = readEntries(parsed.found, TIERS)
    const moodPaths = readEntries(parsed.moodPaths, MOOD_PATHS)
    return {
      found,
      moodPaths,
      totalRuns: isNumber(parsed.totalRuns)
        ? Math.max(0, Math.floor(parsed.totalRuns))
        : Object.values({ ...found, ...moodPaths }).reduce(
            (sum, e) => sum + (e?.count ?? 0),
            0,
          ),
      bestStreak: isNumber(parsed.bestStreak)
        ? Math.max(0, Math.floor(parsed.bestStreak))
        : 0,
      repeatFound: parsed.repeatFound === true,
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
    ...data,
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

export const recordMoodRun = (
  data: ShuffleProData,
  path: MoodPath,
  now: number,
): ShuffleProData => {
  const previous = data.moodPaths[path]
  return {
    ...data,
    moodPaths: {
      ...data.moodPaths,
      [path]: {
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
  recordMoodRun(path: MoodPath, now = Date.now()) {
    save(recordMoodRun(load(), path, now))
  },
  // Remembers the longest streak; only a new best is written.
  recordStreak(streak: number) {
    const data = load()
    if (streak > data.bestStreak) save({ ...data, bestStreak: streak })
  },
  setRepeatFound(repeatFound: boolean) {
    save({ ...load(), repeatFound })
  },
  // Clears what was found; the repeat setting is a preference and stays.
  reset() {
    save({ ...EMPTY, repeatFound: load().repeatFound })
  },
}
