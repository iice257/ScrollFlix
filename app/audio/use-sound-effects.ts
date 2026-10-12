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

type SoundEffectsState = {
  savedCount: number
  detailsOpen: boolean
  // How many films the session path has.
  trailLength: number
}

// Maps page state to the few interface sounds. Each one is a no-op unless
// sound is on and its category allowed; the engine does the gating.
export const useSoundEffects = (state: SoundEffectsState) => {
  useChangeCue(state.savedCount, (next, previous): Cue | null =>
    next > previous ? 'heart' : null,
  )
  useChangeCue(state.detailsOpen, (next): Cue | null =>
    next ? 'open' : 'close',
  )
  const trailLength = useRef(state.trailLength)
  useEffect(() => {
    const previous = trailLength.current
    trailLength.current = state.trailLength
    if (state.trailLength > previous) {
      playCue('trailPoint', ((state.trailLength - 1) % 8) / 7)
    }
  }, [state.trailLength])
}

const INTERACTIVE = 'button, a[href], [role="button"], [role="tab"], summary'

// The small sounds of using the page with a pointer: a faint tick as the
// mouse crosses a control, a knock when anything is pressed, and a grab when
// the globe is taken hold of. Touch gets the knock and the grab, no hover.
export const useInterfaceSounds = () => {
  useEffect(() => {
    if (typeof document === 'undefined') return
    let hovered: Element | null = null
    const onDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target instanceof HTMLCanvasElement) {
        playCue('grab')
        return
      }
      if (target.closest(INTERACTIVE)) playCue('tap')
    }
    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest(INTERACTIVE)
      if (control === hovered) return
      hovered = control
      if (control && !control.hasAttribute('disabled')) playCue('hover')
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointerover', onOver, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointerover', onOver, true)
    }
  }, [])
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
