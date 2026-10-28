import { useEffect, useRef, useState } from 'react'

// How long the first-load screen may sit with no progress before it admits the
// connection is poor and offers Skip.
export const SLOW_LOAD_MS = 6000

export type LoaderState = 'normal' | 'slow'

// 'slow' once `active` has gone SLOW_LOAD_MS without `progress` changing. Any
// movement restarts the clock; once slow it stays slow, so the screen does not
// flicker back and forth on a connection that trickles. Inactive resets it.
export const useLoaderState = (
  active: boolean,
  progress: number,
  slowAfterMs = SLOW_LOAD_MS,
): LoaderState => {
  const [slow, setSlow] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: progress restarts the clock
  useEffect(() => {
    if (!active) {
      setSlow(false)
      return
    }
    const timer = window.setTimeout(() => setSlow(true), slowAfterMs)
    return () => window.clearTimeout(timer)
  }, [active, progress, slowAfterMs])
  return slow ? 'slow' : 'normal'
}

// The Smart Loader's progress. The bar follows real milestones, each owning a
// band of the bar: the app starting, the catalogue's first chunk arriving
// (by bytes), the globe built with a placeholder in every slot, and the
// posters of the whole globe arriving. Whoever waits for the loader gets a
// complete globe: a poster that failed does not move the bar, so a dead
// connection looks stuck and the screen offers Skip.
export type LoadMilestones = {
  // 0..1 of the first catalogue chunk downloaded.
  catalog: number
  catalogDone: boolean
  globeBuilt: boolean
  // 0..1 of the globe's posters arrived.
  posters: number
}

const BOOT_END = 5
const CATALOG_END = 35
const GLOBE_END = 45

// Where the bar should be for these milestones, and the most it may creep
// to while the current one is still in progress.
export const loadTarget = (milestones: LoadMilestones) => {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  if (!milestones.catalogDone)
    return {
      target: BOOT_END + (CATALOG_END - BOOT_END) * clamp(milestones.catalog),
      ceiling: CATALOG_END - 1,
    }
  if (!milestones.globeBuilt)
    return { target: CATALOG_END, ceiling: GLOBE_END - 1 }
  return {
    target: GLOBE_END + (100 - GLOBE_END) * clamp(milestones.posters),
    ceiling: 99,
  }
}

// One step of the shown value: it catches up with real progress quickly,
// and while a milestone is still working it creeps toward that milestone's
// ceiling, slower the closer it gets, so the bar keeps moving early on and
// never claims work that has not happened. It never goes backwards.
export const nextShownProgress = (
  shown: number,
  target: number,
  ceiling: number,
) => {
  if (shown < target)
    return Math.min(target, shown + Math.max(0.6, (target - shown) * 0.3))
  if (shown < ceiling) return shown + (ceiling - shown) * 0.012
  return shown
}

const PROGRESS_TICK_MS = 80

// The Smart Loader's shown percentage (whole numbers), stepped on a short
// clock while `active`; 100 once `done`.
export const useSmartProgress = (
  active: boolean,
  milestones: LoadMilestones,
  done: boolean,
) => {
  const [shown, setShown] = useState(0)
  // Read by one steady clock, so frequent milestone updates never restart it.
  const goal = useRef(loadTarget(milestones))
  goal.current = loadTarget(milestones)
  useEffect(() => {
    if (done || !active) return
    const timer = window.setInterval(
      () =>
        setShown((value) =>
          nextShownProgress(value, goal.current.target, goal.current.ceiling),
        ),
      PROGRESS_TICK_MS,
    )
    return () => window.clearInterval(timer)
  }, [active, done])
  return done ? 100 : Math.floor(shown)
}
