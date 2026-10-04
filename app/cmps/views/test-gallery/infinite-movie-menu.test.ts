import { describe, expect, it } from 'vitest'
import { createHoneycombSpherePositions } from './honeycomb-layout'
import {
  type PickEllipse,
  createPickCandidate,
  ellipseIntersectsQuad,
  pickWinner,
  pointToQuadDistance,
} from './infinite-movie-menu'

describe('infinite movie menu geometry', () => {
  it('spaces all 750 honeycomb positions beyond the poster footprint', () => {
    const positions = createHoneycombSpherePositions(750)
    let minimumDistance = Number.POSITIVE_INFINITY
    const nearestDistances = positions.map(() => Number.POSITIVE_INFINITY)

    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        const dx = positions[left][0] - positions[right][0]
        const dy = positions[left][1] - positions[right][1]
        const dz = positions[left][2] - positions[right][2]
        const distance = Math.hypot(dx, dy, dz)
        minimumDistance = Math.min(minimumDistance, distance)
        nearestDistances[left] = Math.min(nearestDistances[left], distance)
        nearestDistances[right] = Math.min(nearestDistances[right], distance)
      }
    }

    const averageNearestDistance =
      nearestDistances.reduce((sum, distance) => sum + distance, 0) /
      nearestDistances.length
    const maximumNearestDeviation = Math.max(
      ...nearestDistances.map((distance) =>
        Math.abs(distance - averageNearestDistance),
      ),
    )

    expect(positions).toHaveLength(750)
    expect(minimumDistance).toBeGreaterThan(0.28)
    expect(maximumNearestDeviation / averageNearestDistance).toBeLessThan(0.08)
  })

  it('keeps posters clear of each other at the 900-poster cap', () => {
    const positions = createHoneycombSpherePositions(900)
    let minimumDistance = Number.POSITIVE_INFINITY
    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(
            positions[left][0] - positions[right][0],
            positions[left][1] - positions[right][1],
            positions[left][2] - positions[right][2],
          ),
        )
      }
    }
    // Posters are 0.18 world units tall at rest, so this leaves clear gaps.
    expect(minimumDistance).toBeGreaterThan(0.26)
  })
})

const square = (cx: number, cy: number, half: number) =>
  createPickCandidate(0, 0, [cx, cy], [half, 0], [0, half]).quad

describe('ellipse / quad intersection', () => {
  const ellipse: PickEllipse = { cx: 0, cy: 0, rx: 100, ry: 50 }

  it('accepts quads inside, enclosing, or overlapping the ellipse', () => {
    expect(ellipseIntersectsQuad(square(0, 0, 10), ellipse)).toBe(true)
    expect(ellipseIntersectsQuad(square(0, 0, 500), ellipse)).toBe(true)
    expect(ellipseIntersectsQuad(square(110, 0, 20), ellipse)).toBe(true)
  })

  it('accepts a quad whose edge only touches the ellipse', () => {
    // Left edge at x = 100 touches the ellipse's right extreme.
    expect(ellipseIntersectsQuad(square(110, 0, 10), ellipse)).toBe(true)
    expect(ellipseIntersectsQuad(square(0, 60, 10), ellipse)).toBe(true)
  })

  it('rejects quads fully outside the ellipse', () => {
    expect(ellipseIntersectsQuad(square(130, 0, 10), ellipse)).toBe(false)
    // Inside the bounding box but beyond the curved corner.
    expect(ellipseIntersectsQuad(square(95, 48, 5), ellipse)).toBe(false)
  })
})

describe('point to quad distance', () => {
  const quad = square(0, 0, 10)

  it('is zero inside or on the boundary', () => {
    expect(pointToQuadDistance([3, -4], quad)).toBe(0)
    expect(pointToQuadDistance([10, 0], quad)).toBe(0)
  })

  it('measures to the nearest edge', () => {
    expect(pointToQuadDistance([15, 2], quad)).toBeCloseTo(5)
    expect(pointToQuadDistance([-3, -18], quad)).toBeCloseTo(8)
  })

  it('measures to the nearest corner', () => {
    expect(pointToQuadDistance([13, 14], quad)).toBeCloseTo(5)
  })

  it('handles sheared quads', () => {
    const skew = createPickCandidate(0, 0, [0, 0], [10, 0], [5, 10]).quad
    expect(pointToQuadDistance([0, 0], skew)).toBe(0)
    expect(pointToQuadDistance([40, 0], skew)).toBeGreaterThan(0)
  })
})

describe('pickWinner', () => {
  const ellipse: PickEllipse = { cx: 0, cy: 0, rx: 200, ry: 200 }
  const make = (index: number, z: number, cx: number, cy: number, half = 10) =>
    createPickCandidate(index, z, [cx, cy], [half, 0], [0, half])

  it('(a) picks the front-most poster containing the point', () => {
    const winner = pickWinner(
      [make(0, 1, 0, 0), make(1, 5, 5, 0), make(2, 3, 0, 5)],
      [2, 2],
      ellipse,
    )
    expect(winner?.index).toBe(1)
  })

  it('(a) breaks exact z ties by lower index', () => {
    const winner = pickWinner(
      [make(7, 2, 0, 0), make(3, 2, 4, 0)],
      [2, 0],
      ellipse,
    )
    expect(winner?.index).toBe(3)
  })

  it('(a) works for a poster outside the ellipse that touches it', () => {
    const winner = pickWinner([make(4, 1, 205, 0)], [198 + 10, 0], ellipse)
    expect(winner?.index).toBe(4)
  })

  it('(b) picks the nearest poster for a point in a gap', () => {
    const winner = pickWinner(
      [make(0, 1, -30, 0), make(1, 1, 40, 0)],
      [0, 0],
      ellipse,
    )
    expect(winner?.index).toBe(0)
  })

  it('(b) treats distances within 0.5px as ties: larger z, then lower index', () => {
    // Gaps of 20 and 20.3 px from the point.
    const byZ = pickWinner(
      [make(0, 1, -30, 0), make(1, 2, 30.3, 0)],
      [0, 0],
      ellipse,
    )
    expect(byZ?.index).toBe(1)
    const byIndex = pickWinner(
      [make(5, 2, 30, 0), make(2, 2, -30.3, 0)],
      [0, 0],
      ellipse,
    )
    expect(byIndex?.index).toBe(2)
  })

  it('(b) prefers a clearly nearer poster over a front one', () => {
    const winner = pickWinner(
      [make(0, 9, -40, 0), make(1, 1, 25, 0)],
      [0, 0],
      ellipse,
    )
    expect(winner?.index).toBe(1)
  })

  it('(c) misses outside the ellipse when no quad contains the point', () => {
    expect(pickWinner([make(0, 1, 190, 0)], [250, 0], ellipse)).toBeNull()
    expect(pickWinner([], [0, 0], ellipse)).toBeNull()
  })

  it('is deterministic for the same snapshot and point', () => {
    const candidates = [
      make(0, 1, -30, 0),
      make(1, 1, 30, 0),
      make(2, 1, 0, 40),
    ]
    const first = pickWinner(candidates, [1, 1], ellipse)
    for (let i = 0; i < 20; i += 1) {
      expect(pickWinner(candidates, [1, 1], ellipse)).toBe(first)
    }
  })
})
