import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SLOW_LOAD_MS,
  loadTarget,
  nextShownProgress,
  useLoaderState,
  useSmartProgress,
} from './loader-state'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => vi.useRealTimers())

describe('useLoaderState', () => {
  it('turns slow after 6 s with no progress', () => {
    const { result } = renderHook(() => useLoaderState(true, 10))
    expect(result.current).toBe('normal')
    act(() => vi.advanceTimersByTime(SLOW_LOAD_MS - 1))
    expect(result.current).toBe('normal')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('slow')
  })

  it('restarts the clock whenever progress moves', () => {
    const { result, rerender } = renderHook(
      ({ progress }) => useLoaderState(true, progress),
      { initialProps: { progress: 10 } },
    )
    act(() => vi.advanceTimersByTime(SLOW_LOAD_MS - 100))
    rerender({ progress: 20 })
    act(() => vi.advanceTimersByTime(SLOW_LOAD_MS - 100))
    expect(result.current).toBe('normal')
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe('slow')
  })

  it('stays normal while inactive and resets when it stops', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useLoaderState(active, 0),
      { initialProps: { active: false } },
    )
    act(() => vi.advanceTimersByTime(SLOW_LOAD_MS * 2))
    expect(result.current).toBe('normal')
    rerender({ active: true })
    act(() => vi.advanceTimersByTime(SLOW_LOAD_MS))
    expect(result.current).toBe('slow')
    rerender({ active: false })
    expect(result.current).toBe('normal')
  })
})

describe('Smart Loader progress', () => {
  const base = {
    catalog: 0,
    catalogDone: false,
    globeBuilt: false,
    posters: 0,
  }

  it('gives each milestone its own band, in order', () => {
    const steps = [
      loadTarget(base),
      loadTarget({ ...base, catalog: 0.5 }),
      loadTarget({ ...base, catalog: 1, catalogDone: true }),
      loadTarget({ ...base, catalogDone: true, globeBuilt: true }),
      loadTarget({
        ...base,
        catalogDone: true,
        globeBuilt: true,
        posters: 0.5,
      }),
      loadTarget({ ...base, catalogDone: true, globeBuilt: true, posters: 1 }),
    ].map((step) => step.target)
    expect(steps).toEqual([...steps].sort((a, b) => a - b))
    expect(steps[0]).toBeGreaterThan(0)
    expect(steps[5]).toBe(100)
  })

  it('creeps while a milestone works, but never to its end', () => {
    const { target, ceiling } = loadTarget({ ...base, catalogDone: true })
    let shown = target
    for (let tick = 0; tick < 2000; tick += 1)
      shown = nextShownProgress(shown, target, ceiling)
    expect(shown).toBeGreaterThan(target)
    expect(shown).toBeLessThanOrEqual(ceiling)
    expect(shown).toBeLessThan(45)
  })

  it('catches up with real progress and never goes backwards', () => {
    let shown = 0
    const seen: number[] = []
    for (const target of [10, 40, 30, 80, 80, 100]) {
      for (let tick = 0; tick < 30; tick += 1) {
        shown = nextShownProgress(shown, target, 99)
        seen.push(shown)
      }
    }
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    expect(shown).toBeGreaterThanOrEqual(99)
  })

  it('moves early and slows near the end of a band', () => {
    const first = nextShownProgress(5, 5, 34) - 5
    const late = nextShownProgress(33, 5, 34) - 33
    expect(first).toBeGreaterThan(late)
  })
})

describe('useSmartProgress', () => {
  it('keeps stepping while milestones update faster than its clock', () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const milestones = (posters: number) => ({
      catalog: 1,
      catalogDone: true,
      globeBuilt: true,
      posters,
    })
    const { result, rerender } = renderHook(
      ({ posters }) => useSmartProgress(true, milestones(posters), false),
      { initialProps: { posters: 0 } },
    )
    for (let step = 1; step <= 40; step += 1) {
      rerender({ posters: step / 80 })
      act(() => vi.advanceTimersByTime(50))
    }
    expect(result.current).toBeGreaterThan(45)
  })

  it('shows 100 once done', () => {
    const { result } = renderHook(() =>
      useSmartProgress(
        false,
        { catalog: 0, catalogDone: false, globeBuilt: false, posters: 0 },
        true,
      ),
    )
    expect(result.current).toBe(100)
  })
})
