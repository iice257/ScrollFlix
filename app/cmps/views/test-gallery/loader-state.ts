import { useEffect, useState } from 'react'

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
