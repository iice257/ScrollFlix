// The rules behind the trailer player, kept apart from React so they can be
// tested on their own: which key to try next, which keys are known to be
// dead, and where the YouTube fallback points.

export const DEAD_TRAILERS_KEY = 'wtw:dead-trailers:v1'
const MAX_DEAD = 500

// YouTube IFrame API error codes that mean "this video will not play here":
// bad parameter (2), HTML5 trouble (5), not found (100), and embedding
// switched off (101, 150).
export const FATAL_PLAYER_ERRORS: ReadonlySet<number> = new Set([
  2, 5, 100, 101, 150,
])

// How long the player gets to say it is ready before the key is given up on.
export const READY_TIMEOUT_MS = 10_000

// The first key that has not failed, or null when every one has. `failed`
// holds keys that failed just now or were remembered as dead.
export const nextKey = (
  keys: readonly string[],
  failed: ReadonlySet<string>,
): string | null => keys.find((key) => !failed.has(key)) ?? null

const readList = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(DEAD_TRAILERS_KEY) ?? '[]',
    )
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : []
  } catch {
    return []
  }
}

// Keys that failed on this device before, so the button can skip them.
export const readDeadTrailers = (): Set<string> => new Set(readList())

// Remembers a dead key. The oldest entries drop off first once there are 500.
export const markTrailerDead = (key: string) => {
  try {
    const list = readList().filter((existing) => existing !== key)
    list.push(key)
    window.localStorage.setItem(
      DEAD_TRAILERS_KEY,
      JSON.stringify(list.slice(-MAX_DEAD)),
    )
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
}

// A YouTube search for the film's trailer: the way out when nothing plays here.
export const youtubeSearchUrl = (title: string, year?: string) => {
  const query = [title, /^\d{4}$/.test(year ?? '') ? year : '', 'trailer']
    .filter(Boolean)
    .join(' ')
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

export type TrailerButton =
  // Play in the sheet.
  | { kind: 'play' }
  // Every key is dead: skip the sheet and open YouTube.
  | { kind: 'youtube' }
  // No keys at all: no button.
  | { kind: 'none' }

export const trailerButtonFor = (
  keys: readonly string[] | undefined,
  dead: ReadonlySet<string>,
): TrailerButton => {
  if (!keys?.length) return { kind: 'none' }
  return nextKey(keys, dead) ? { kind: 'play' } : { kind: 'youtube' }
}
