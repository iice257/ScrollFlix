// The golden hour: a rare, quiet event. For a couple of minutes the light
// turns golden and Gold is easier to find. It is never announced with a banner,
// only a slow change in the sky, and it does not come back for a day.

export const GOLDEN_HOUR_STORAGE_KEY = 'wtw:golden-hour:v1'

export const GOLDEN_HOUR = {
  durationMs: 150_000,
  // Quiet time after one, so it stays rare.
  minGapMs: 20 * 60 * 60 * 1000,
  // The chance a visit has one at all.
  visitChance: 0.3,
  // When it starts, counted from the globe being ready.
  startDelayMs: [40_000, 90_000] as const,
  // The chance a run becomes Gold before Gold has been unlocked, and after
  // Gold has been found. (Between the two Gold is already guaranteed.)
  lockedGoldChance: 0.2,
  foundGoldChance: 0.5,
} as const

export const shouldHaveGoldenHour = ({
  now,
  lastAt,
  random,
}: {
  now: number
  lastAt: number | null
  random: () => number
}) => {
  if (lastAt !== null && now - lastAt < GOLDEN_HOUR.minGapMs) return false
  return random() < GOLDEN_HOUR.visitChance
}

export const goldenHourDelay = (random: () => number) => {
  const [min, max] = GOLDEN_HOUR.startDelayMs
  return Math.round(min + random() * (max - min))
}

export const readGoldenHourLast = (): number | null => {
  try {
    const raw = window.localStorage.getItem(GOLDEN_HOUR_STORAGE_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

const writeGoldenHourLast = (at: number) => {
  try {
    window.localStorage.setItem(GOLDEN_HOUR_STORAGE_KEY, String(at))
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
}

// Whether the golden hour is on right now, as a tiny store the page and the
// run controller both read.
let active = false
const listeners = new Set<() => void>()

export const goldenHourStore = {
  get: () => active,
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  start: (now = Date.now()) => {
    if (active) return
    active = true
    writeGoldenHourLast(now)
    for (const listener of listeners) listener()
  },
  end: () => {
    if (!active) return
    active = false
    for (const listener of listeners) listener()
  },
}
