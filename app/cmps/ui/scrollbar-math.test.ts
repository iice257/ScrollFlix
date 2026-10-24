import { describe, expect, it } from 'vitest'

import { MIN_THUMB, getScrollFromDrag, getThumbMetrics } from './scrollbar-math'

describe('getThumbMetrics', () => {
  it('draws nothing when the content fits', () => {
    expect(getThumbMetrics(400, 400, 0, 376).visible).toBe(false)
    expect(getThumbMetrics(400.5, 400, 0, 376).visible).toBe(false)
    expect(getThumbMetrics(300, 400, 0, 376).visible).toBe(false)
  })

  it('draws nothing for an empty box or track', () => {
    expect(getThumbMetrics(800, 0, 0, 376).visible).toBe(false)
    expect(getThumbMetrics(800, 400, 0, 0).visible).toBe(false)
  })

  it('sizes the thumb by the visible share of the content', () => {
    const { visible, size } = getThumbMetrics(800, 400, 0, 376)
    expect(visible).toBe(true)
    expect(size).toBe(188)
  })

  it('never goes shorter than the minimum', () => {
    const { size } = getThumbMetrics(100_000, 400, 0, 376)
    expect(size).toBe(MIN_THUMB)
  })

  it('keeps the minimum inside a track that is shorter than it', () => {
    expect(getThumbMetrics(100_000, 400, 0, 20).size).toBe(20)
  })

  it('starts at the top and ends flush with the bottom of the track', () => {
    const top = getThumbMetrics(800, 400, 0, 376)
    const bottom = getThumbMetrics(800, 400, 400, 376)
    expect(top.offset).toBe(0)
    expect(bottom.offset + bottom.size).toBe(376)
  })

  it('moves in proportion to the scroll position', () => {
    const mid = getThumbMetrics(800, 400, 200, 376)
    expect(mid.offset).toBe((376 - mid.size) / 2)
  })

  it('stays on the track when scrolled past the ends (overscroll)', () => {
    expect(getThumbMetrics(800, 400, -50, 376).offset).toBe(0)
    const past = getThumbMetrics(800, 400, 450, 376)
    expect(past.offset + past.size).toBe(376)
  })
})

describe('getScrollFromDrag', () => {
  it('maps the whole track travel onto the whole scroll range', () => {
    const { size } = getThumbMetrics(800, 400, 0, 376)
    expect(getScrollFromDrag(0, 376 - size, 800, 400, 376, size)).toBe(400)
    expect(getScrollFromDrag(400, -(376 - size), 800, 400, 376, size)).toBe(0)
  })

  it('clamps to the scroll range', () => {
    const { size } = getThumbMetrics(800, 400, 0, 376)
    expect(getScrollFromDrag(0, 10_000, 800, 400, 376, size)).toBe(400)
    expect(getScrollFromDrag(100, -10_000, 800, 400, 376, size)).toBe(0)
  })

  it('round-trips with the thumb position', () => {
    const scrollSize = 3000
    const clientSize = 500
    const track = 476
    const start = 700
    const a = getThumbMetrics(scrollSize, clientSize, start, track)
    const b = getThumbMetrics(scrollSize, clientSize, 1400, track)
    const dragged = getScrollFromDrag(
      start,
      b.offset - a.offset,
      scrollSize,
      clientSize,
      track,
      a.size,
    )
    expect(dragged).toBeCloseTo(1400, 5)
  })

  it('leaves the position alone when there is nothing to drag', () => {
    expect(getScrollFromDrag(0, 50, 400, 400, 376, 376)).toBe(0)
  })
})
