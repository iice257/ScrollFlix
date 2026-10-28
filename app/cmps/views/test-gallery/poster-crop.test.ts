import { describe, expect, it } from 'vitest'
import { POSTER_ASPECT, POSTER_CORNER_RADIUS } from './infinite-movie-menu'
import { letterboxRect } from './poster-decode'

describe('letterboxRect', () => {
  it('fills the cell for a 2:3 poster', () => {
    expect(letterboxRect(342, 513, 64, 96)).toEqual({
      x: 0,
      y: 0,
      w: 64,
      h: 96,
    })
  })
  it('treats near-2:3 sources as 2:3', () => {
    expect(letterboxRect(500, 750, 64, 96)).toEqual({
      x: 0,
      y: 0,
      w: 64,
      h: 96,
    })
    expect(letterboxRect(500, 740, 64, 96)).toEqual({
      x: 0,
      y: 0,
      w: 64,
      h: 96,
    })
  })
  it('letterboxes a wide source top and bottom, never cropping', () => {
    const box = letterboxRect(300, 300, 64, 96)
    expect(box.w).toBe(64)
    expect(box.h).toBeCloseTo(64)
    expect(box.y).toBeCloseTo(16)
    expect(box.y * 2 + box.h).toBeCloseTo(96)
  })
  it('pillarboxes a tall source left and right', () => {
    const box = letterboxRect(200, 600, 64, 96)
    expect(box.h).toBe(96)
    expect(box.w).toBeCloseTo(32)
    expect(box.x).toBeCloseTo(16)
  })
  it('falls back to the full cell for an empty source', () => {
    expect(letterboxRect(0, 0, 64, 96)).toEqual({ x: 0, y: 0, w: 64, h: 96 })
  })
})

describe('poster mask constants', () => {
  it('rounds the globe posters: radius 9% of the poster width, 2:3', () => {
    expect(POSTER_CORNER_RADIUS).toBe(0.09)
    expect(POSTER_CORNER_RADIUS).toBeLessThan(0.11)
    expect(POSTER_ASPECT).toBe(1.5)
  })
})
