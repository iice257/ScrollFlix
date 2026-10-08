// Background preparation for the premium reveal, started when a hold or a
// streak shows which path is coming. It is deliberately light and bounded:
//
//   - it only warms things that are cached afterwards (the fonts the share
//     card draws with and its module), so repeating it costs nothing;
//   - the work is split into idle-time steps and each one checks the abort
//     signal first;
//   - cancelling is instant and leaves nothing behind: no timers, no
//     listeners, no pending buffers.

import type { Tier } from './shuffle-pro-logic'

type Step = () => Promise<unknown> | undefined

const FONT_STEPS = [
  '950 52px "DM Sans"',
  '800 64px "DM Sans"',
  '700 40px "DM Sans"',
]

let current: AbortController | null = null

const whenIdle = (callback: () => void, signal: AbortSignal) => {
  if (signal.aborted) return
  const run = () => {
    if (!signal.aborted) callback()
  }
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 600 })
    signal.addEventListener('abort', () => window.cancelIdleCallback(id), {
      once: true,
    })
  } else {
    const id = window.setTimeout(run, 60)
    signal.addEventListener('abort', () => window.clearTimeout(id), {
      once: true,
    })
  }
}

// Runs the steps one at a time, each in its own idle slice.
const runSteps = (steps: Step[], signal: AbortSignal) => {
  const next = (index: number) => {
    if (signal.aborted || index >= steps.length) return
    whenIdle(() => {
      try {
        const result = steps[index]()
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          void (result as Promise<unknown>)
            .catch(() => {})
            .then(() => next(index + 1))
          return
        }
      } catch {
        // A failed warm-up just means the first use pays for it.
      }
      next(index + 1)
    }, signal)
  }
  next(0)
}

export const startTierPreload = (_tier: Tier) => {
  cancelTierPreload()
  if (typeof window === 'undefined') return
  const controller = new AbortController()
  current = controller
  const steps: Step[] = [
    ...FONT_STEPS.map((font) => () => document.fonts?.load(font)),
    () => import('../share/share-sheet'),
  ]
  runSteps(steps, controller.signal)
}

export const cancelTierPreload = () => {
  current?.abort()
  current = null
}
