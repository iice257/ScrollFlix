import { setDevSilence } from '../../../../audio/sound-engine'
import type { FoundPaths, Tier } from './shuffle-pro-logic'

// Dev mode exists only on local development. Every entry point checks
// `import.meta.env.DEV`, which Vite turns into a constant, so a production
// build drops the code and a saved flag does nothing there.
//
// While it is on: the interface sounds are muted (the Shuffle Pro Easter egg
// sounds still play), the streak chip shows, found paths never block a streak
// run, and the Amethyst streak is deterministic. Gold follows its normal unlock
// rule over the tiers seen during the dev session, which live in memory only,
// so dev mode never writes to the real collection.

const DEV_MODE_STORAGE_KEY = 'wtw:shuffle-pro:dev-mode'

let on: boolean | null = null
let seen: FoundPaths = {}
const listeners = new Set<() => void>()

const read = () => {
  if (!import.meta.env.DEV) return false
  if (on === null) {
    try {
      on = window.localStorage.getItem(DEV_MODE_STORAGE_KEY) === '1'
    } catch {
      on = false
    }
    setDevSilence(on)
  }
  return on
}

export const devModeStore = {
  get: read,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  set(next: boolean) {
    if (!import.meta.env.DEV) return
    on = next
    // Turning it off forgets what the dev session has seen.
    if (!next) seen = {}
    setDevSilence(next)
    try {
      window.localStorage.setItem(DEV_MODE_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Best effort.
    }
    for (const listener of listeners) listener()
  },
  getSeen: (): FoundPaths => seen,
  recordRun(tier: Tier) {
    seen = { ...seen, [tier]: true }
  },
}

// Applies a saved flag at start-up, so the sounds are muted from the first cue.
if (import.meta.env.DEV && typeof window !== 'undefined') read()
