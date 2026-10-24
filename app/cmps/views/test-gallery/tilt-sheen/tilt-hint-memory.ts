// Remembers whether the "Tilt your phone" hint has done its job, so it does
// not nag on every card. Storage is injected so this stays testable, and every
// access is guarded: storage can be blocked or full.

export const TILT_HINT_KEY = 'wtw:tilt-hint'
// Without a confirmed tilt (iOS people who never tap it), stop after this many.
export const MAX_HINT_SHOWS = 2

export type TiltHintMemory = { shows: number; done: boolean }

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const EMPTY: TiltHintMemory = { shows: 0, done: false }

export const readTiltHint = (storage: StorageLike | null): TiltHintMemory => {
  if (!storage) return EMPTY
  try {
    const raw = storage.getItem(TILT_HINT_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<TiltHintMemory>
    return {
      shows:
        typeof parsed.shows === 'number' && parsed.shows > 0
          ? Math.floor(parsed.shows)
          : 0,
      done: parsed.done === true,
    }
  } catch {
    return EMPTY
  }
}

export const writeTiltHint = (
  storage: StorageLike | null,
  memory: TiltHintMemory,
) => {
  if (!storage) return
  try {
    storage.setItem(TILT_HINT_KEY, JSON.stringify(memory))
  } catch {
    // Private mode or a full quota: the hint just shows again next time.
  }
}

export const shouldShowTiltHint = (memory: TiltHintMemory) =>
  !memory.done && memory.shows < MAX_HINT_SHOWS

// One more showing, or the end of it once the tilt has been detected.
export const nextTiltHint = (
  memory: TiltHintMemory,
  event: 'shown' | 'detected',
): TiltHintMemory =>
  event === 'detected'
    ? { ...memory, done: true }
    : { ...memory, shows: memory.shows + 1 }

export const getSafeStorage = (): StorageLike | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
