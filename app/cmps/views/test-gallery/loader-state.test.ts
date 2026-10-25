import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SLOW_LOAD_MS, useLoaderState } from './loader-state'

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
