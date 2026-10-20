// The two kinds of line that can be drawn over the globe, each its own
// setting and both off until someone turns them on:
//   - favorite links: the lines joining the films you saved
//   - session path: the trail of films this visit has landed on

// The original single switch. It now belongs to the favorite links, and its
// stored value is carried over to the session path once (see below).
export const CONSTELLATIONS_STORAGE_KEY = 'wtw:constellations'
export const SESSION_PATH_LINES_STORAGE_KEY = 'wtw:session-path-lines'

export type FlagSetting = {
  get: () => boolean
  set: (next: boolean) => void
  subscribe: (listener: () => void) => () => void
  // Whether the person has ever chosen On or Off (here or, for the session
  // path, on the old single switch), as opposed to leaving the default.
  isStored: () => boolean
}

const readStored = (key: string): boolean | null => {
  try {
    const value = window.localStorage.getItem(key)
    if (value === '1') return true
    if (value === '0') return false
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return null
}

const writeStored = (key: string, value: boolean) => {
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Nothing to remember it with: it holds for this visit only.
  }
}

// An on/off setting kept in localStorage that defaults to off. With a
// `legacyKey`, an explicit value stored there is adopted (and written under
// `key`, so later changes to the old switch no longer move this one).
export const createFlagSetting = (
  key: string,
  legacyKey?: string,
): FlagSetting => {
  const listeners = new Set<() => void>()
  let enabled: boolean | null = null

  const initial = () => {
    const own = readStored(key)
    if (own !== null) return own
    const inherited = legacyKey ? readStored(legacyKey) : null
    if (inherited === null) return false
    writeStored(key, inherited)
    return inherited
  }

  return {
    get: () => {
      enabled ??= initial()
      return enabled
    },
    set: (next) => {
      enabled = next
      writeStored(key, next)
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    isStored: () =>
      readStored(key) !== null ||
      (legacyKey ? readStored(legacyKey) !== null : false),
  }
}

export const constellationSetting = createFlagSetting(
  CONSTELLATIONS_STORAGE_KEY,
)

export const sessionPathSetting = createFlagSetting(
  SESSION_PATH_LINES_STORAGE_KEY,
  CONSTELLATIONS_STORAGE_KEY,
)
