import { useEffect, useRef } from 'react'
import { type Cue, playCue, unlockAudio } from './sound-engine'
import { soundStore } from './sound-settings'

// Plays a cue whenever `value` changes, never on the first render. Picking the
// cue from the new and old value keeps open and close audibly related.
const useChangeCue = <T>(
  value: T,
  cueFor: (next: T, previous: T) => Cue | null,
) => {
  const previous = useRef(value)
  const cueRef = useRef(cueFor)
  cueRef.current = cueFor
  useEffect(() => {
    if (Object.is(previous.current, value)) return
    const cue = cueRef.current(value, previous.current)
    previous.current = value
    if (cue) playCue(cue)
  }, [value])
}

const openClose = (next: boolean): Cue => (next ? 'open' : 'close')

type SoundEffectsState = {
  detailsOpen: boolean
  aboutOpen: boolean
  savedOpen: boolean
  filterOpen: boolean
  sortOpen: boolean
  watchOpen: boolean
  mode: string
  theme: string
  savedCount: number
}

// Maps page state to interface sounds. Each one is a no-op unless sound is on
// and its category allowed; the engine does the gating.
export const useSoundEffects = (state: SoundEffectsState) => {
  useChangeCue(
    state.detailsOpen,
    (open): Cue => (open ? 'detailsOpen' : 'detailsClose'),
  )
  useChangeCue(state.aboutOpen, openClose)
  useChangeCue(state.savedOpen, openClose)
  useChangeCue(state.filterOpen, openClose)
  useChangeCue(state.sortOpen, openClose)
  useChangeCue(state.watchOpen, openClose)
  useChangeCue(state.mode, () => 'nav')
  useChangeCue(state.theme, () => 'action')
  useChangeCue(state.savedCount, (next, previous): Cue | null =>
    next > previous ? 'heart' : null,
  )
}

// With sound on, the first real gesture anywhere unlocks audio (browsers only
// allow it from a gesture). With sound off nothing is created until the
// Easter egg paths unlock it themselves.
export const useAudioUnlockOnGesture = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return
    let done = false
    const unlock = () => {
      if (done || !soundStore.get().enabled) return
      done = true
      unlockAudio()
      remove()
    }
    const remove = () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return remove
  }, [])
}
