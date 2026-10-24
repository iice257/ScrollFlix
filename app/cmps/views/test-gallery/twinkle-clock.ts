// The constellations twinkle a little. While the globe is drawing (moving) that
// comes free with every frame; while it rests, this asks for one more draw a
// few times a second, from a timer rather than a frame loop, and not at all
// under reduced motion. So an idle page does no per-frame work.

// The globe counts as drawing if it drew this recently.
const BUSY_MS = 100

export type TwinkleClockOptions = {
  idleFps?: number
  reducedMotion?: boolean
  // Asked for one extra draw (only ever while the globe is at rest).
  onTick: () => void
  now?: () => number
}

export const createTwinkleClock = ({
  idleFps = 15,
  reducedMotion = false,
  onTick,
  now = () => performance.now(),
}: TwinkleClockOptions) => {
  const interval = 1000 / idleFps
  let wanted = false
  let reduced = reducedMotion
  let disposed = false
  let lastDrew = Number.NEGATIVE_INFINITY
  let timer: ReturnType<typeof setTimeout> | null = null

  const running = () => wanted && !reduced && !disposed

  const stop = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const schedule = () => {
    if (timer !== null || !running()) return
    timer = setTimeout(() => {
      timer = null
      if (!running()) return
      const hidden = typeof document !== 'undefined' && document.hidden
      if (!hidden && now() - lastDrew > BUSY_MS) onTick()
      schedule()
    }, interval)
  }

  return {
    // The globe drew a frame.
    engineDrew: () => {
      lastDrew = now()
    },
    // Whether anything on screen twinkles at all.
    setWanted: (on: boolean) => {
      wanted = on
      if (running()) schedule()
      else stop()
    },
    setReducedMotion: (on: boolean) => {
      reduced = on
      if (running()) schedule()
      else stop()
    },
    dispose: () => {
      disposed = true
      stop()
    },
  }
}
