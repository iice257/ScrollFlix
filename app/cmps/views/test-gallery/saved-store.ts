// Saved movies (favourites): `wtw:saved:v1`, newest first. A future stats page
// reads this too. Ids that no longer exist in the catalogue are skipped by the
// reader, never rejected here.

export const SAVED_STORAGE_KEY = 'wtw:saved:v1'

export type SavedEntry = { id: string; savedAt: number }

const EMPTY: readonly SavedEntry[] = []

export const parseSaved = (raw: string | null): readonly SavedEntry[] => {
  if (!raw) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    const seen = new Set<string>()
    const entries: SavedEntry[] = []
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as SavedEntry).id === 'string' &&
        Number.isFinite((item as SavedEntry).savedAt) &&
        !seen.has((item as SavedEntry).id)
      ) {
        seen.add((item as SavedEntry).id)
        entries.push({
          id: (item as SavedEntry).id,
          savedAt: (item as SavedEntry).savedAt,
        })
      }
    }
    return entries.sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    return EMPTY
  }
}

export const addSaved = (
  entries: readonly SavedEntry[],
  id: string,
  now: number,
): readonly SavedEntry[] => [
  { id, savedAt: now },
  ...entries.filter((entry) => entry.id !== id),
]

export const removeSaved = (
  entries: readonly SavedEntry[],
  id: string,
): readonly SavedEntry[] => entries.filter((entry) => entry.id !== id)

let cache: readonly SavedEntry[] | null = null
const listeners = new Set<() => void>()

const load = (): readonly SavedEntry[] => {
  if (cache) return cache
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(SAVED_STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  cache = parseSaved(raw)
  return cache
}

const save = (entries: readonly SavedEntry[]) => {
  cache = entries
  try {
    window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Keep the in-memory list; persistence is best effort.
  }
  for (const listener of listeners) listener()
}

export const savedStore = {
  get: load,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  has: (id: string) => load().some((entry) => entry.id === id),
  // Saves or removes; returns whether the movie is now saved.
  toggle(id: string, now = Date.now()) {
    const current = load()
    const saved = current.some((entry) => entry.id === id)
    save(saved ? removeSaved(current, id) : addSaved(current, id, now))
    return !saved
  },
  remove(id: string) {
    save(removeSaved(load(), id))
  },
  // Test helper: forget the cache so the next read hits storage again.
  reset() {
    cache = null
    for (const listener of listeners) listener()
  },
}
