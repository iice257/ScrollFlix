// A dev-only frame-time probe: the engine reports how long each drawn frame
// took to arrive, and the benchmark (`npm run perf`) or `?perf=1` reads the
// percentiles back. It is never created without `?perf=1`.

export type FrameStats = {
  frames: number
  p50: number
  p95: number
  p99: number
  longTasks: number
  // p95 of the main-thread time spent inside the engine's frame callback. The
  // frame interval is quantised by vsync, so this is what shows a feature's
  // own cost.
  workP95: number
}

export type PerfProbe = {
  frame: (ms: number, workMs?: number) => void
  reset: () => void
  stats: () => FrameStats
}

const WINDOW = 1_200

// Nearest-rank percentile of an ascending list.
const percentile = (sorted: readonly number[], p: number) =>
  sorted.length
    ? sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
    : 0

export const createPerfProbe = (): PerfProbe => {
  const times = new Float32Array(WINDOW)
  const work = new Float32Array(WINDOW)
  let count = 0
  let longTasks = 0

  try {
    if (typeof PerformanceObserver !== 'undefined') {
      new PerformanceObserver((list) => {
        longTasks += list.getEntries().length
      }).observe({ type: 'longtask', buffered: false })
    }
  } catch {
    // Long-task entries are not available in every browser.
  }

  return {
    frame: (ms, workMs = 0) => {
      times[count % WINDOW] = ms
      work[count % WINDOW] = workMs
      count += 1
    },
    reset: () => {
      count = 0
      longTasks = 0
    },
    stats: () => {
      const frames = Math.min(count, WINDOW)
      const sorted = Array.from(times.subarray(0, frames)).sort((a, b) => a - b)
      const worked = Array.from(work.subarray(0, frames)).sort((a, b) => a - b)
      return {
        frames,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        longTasks,
        workP95: percentile(worked, 95),
      }
    },
  }
}

declare global {
  interface Window {
    __scrollflixPerf?: PerfProbe
  }
}

let installed: PerfProbe | null = null

// The shared probe the engine reports into, or null outside `?perf=1`.
export const perfProbe = (): PerfProbe | null => installed

export const installPerfProbe = (): PerfProbe => {
  installed ??= createPerfProbe()
  window.__scrollflixPerf = installed
  return installed
}

// Feature flags for the benchmark: `?perf=1&constellations=0&path=1…` override
// the stored settings so each scenario runs the same build.
export const perfFlag = (name: string): boolean | null => {
  if (!installed) return null
  const value = new URLSearchParams(window.location.search).get(name)
  return value === '1' ? true : value === '0' ? false : null
}
