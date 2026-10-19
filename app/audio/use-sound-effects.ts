import { useEffect, useRef } from 'react'
import { type Cue, playCue, unlockAudio } from './sound-engine'
import { trackPointer } from './sound-pointer'
import { isCategoryOn, soundStore } from './sound-settings'
import { createSpinTicker } from './sound-variety'

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
  useChangeCue(state.detailsOpen, (next): Cue => (next ? 'open' : 'close'))
  const trailLength = useRef(state.trailLength)
  useEffect(() => {
    const previous = trailLength.current
    trailLength.current = state.trailLength
    if (state.trailLength > previous) {
      // The path's length sets how far the click has stepped up.
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
    const stopTracking = trackPointer()
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
      stopTracking()
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointerover', onOver, true)
    }
  }, [])
}

// What the globe offers the ticker: its speed in rad/s right now.
export type SpinSource = { getSpinSpeed: () => number }

// Soft ticks while the globe turns, louder and higher the faster it goes. The
// frame loop only runs while interface sound is on, so it costs nothing
// otherwise. `muted` silences it while a Shuffle spin has its own sounds.
export const useSpinTicks = (
  source: { current: SpinSource | null },
  muted: boolean,
) => {
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ticker = createSpinTicker()
    let frame = 0
    let last = 0
    const loop = (now: number) => {
      frame = window.requestAnimationFrame(loop)
      const dt = now - last
      last = now
      if (mutedRef.current) {
        ticker.reset()
        return
      }
      const speed = source.current?.getSpinSpeed() ?? 0
      for (const tick of ticker.update(speed, dt)) {
        playCue('spinTick', 1, { gainDb: tick.gainDb, rate: tick.rate })
      }
    }
    const sync = () => {
      const on = isCategoryOn(soundStore.get(), 'ui')
      if (on && !frame) {
        last = performance.now()
        frame = window.requestAnimationFrame(loop)
      } else if (!on && frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
        ticker.reset()
      }
    }
    sync()
    const unsubscribe = soundStore.subscribe(sync)
    return () => {
      unsubscribe()
      window.cancelAnimationFrame(frame)
    }
  }, [source])
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
