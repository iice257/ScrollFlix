import { describe, expect, it } from 'vitest'
import {
  ARC_STEPS,
  LINK_STRIDE,
  POINT_KIND,
  POINT_STRIDE,
  buildConstellationGeometry,
  createGeometryCache,
  linkInks,
} from './constellation-geometry'
import { PATH_INK, type PathPoint } from './session-path'

// Eight posters on a ring of radius 10, 0.5 rad apart; film "fN" is instance N.
const ids = Array.from({ length: 8 }, (_, index) => `f${index}`)
const indexOf = (id: string) => {
  const index = ids.indexOf(id)
  return index < 0 ? null : index
}
const world = {
  positionOf: (index: number): [number, number, number] => [
    10 * Math.sin(index * 0.5),
    0,
    10 * Math.cos(index * 0.5),
  ],
  maxLinkLength: 6,
}

const step = (
  id: string,
  tier: PathPoint['tier'] = null,
  at = 0,
): PathPoint => ({
  id,
  tier,
  at,
})

describe('constellation geometry', () => {
  it('emits 27 vertices per path link', () => {
    const geometry = buildConstellationGeometry(
      [],
      [step('f0'), step('f1'), step('f2')],
      indexOf,
      false,
      world,
    )
    expect(ARC_STEPS + 1).toBe(27)
    expect(geometry.linkCount).toBe(54)
    expect(geometry.links).toHaveLength(54 * LINK_STRIDE)
    // Each link runs t = 0..1 between its two instance indices.
    expect(geometry.links[0]).toBe(0)
    expect(geometry.links[1]).toBe(1)
    expect(geometry.links[2]).toBe(0)
    expect(geometry.links[26 * LINK_STRIDE + 2]).toBe(1)
  })

  it('skips films not on the globe', () => {
    const geometry = buildConstellationGeometry(
      ['gone'],
      [step('f0'), step('gone'), step('f2')],
      indexOf,
      false,
      world,
    )
    // f0 -> gone is dropped, and gone -> f2 as well: nothing joins them.
    expect(geometry.linkCount).toBe(0)
    const indices = new Set<number>()
    for (let at = 0; at < geometry.pointCount; at += 1) {
      indices.add(geometry.points[at * POINT_STRIDE])
    }
    expect(indices.has(1)).toBe(false)
  })

  it('needs two path stops before it draws any of the path', () => {
    const geometry = buildConstellationGeometry(
      [],
      [step('f0', 'gold')],
      indexOf,
      false,
      world,
    )
    expect(geometry.linkCount).toBe(0)
    expect(geometry.pointCount).toBe(0)
  })

  it('joins nearby saved films with the minimum spanning tree', () => {
    const geometry = buildConstellationGeometry(
      ['f0', 'f1', 'f7'],
      [],
      indexOf,
      false,
      world,
    )
    // f0-f1 are 4.8 apart; f7 is 3.5 rad away, beyond the link limit of 6.
    expect(geometry.linkCount).toBe(27)
    const hearts = Array.from({ length: geometry.pointCount }, (_, at) => ({
      index: geometry.points[at * POINT_STRIDE],
      kind: geometry.points[at * POINT_STRIDE + 6],
    }))
    expect(hearts.map((point) => point.kind)).toEqual([
      POINT_KIND.heart,
      POINT_KIND.heart,
      POINT_KIND.heart,
    ])
    expect(hearts.map((point) => point.index)).toEqual([0, 1, 7])
  })

  it('keeps at most 24 hearts, newest first', () => {
    const many = Array.from(
      { length: 40 },
      (_, index) => `f${index % 8}x${index}`,
    )
    const lookup = (id: string) => (id.startsWith('f') ? Number(id[1]) : null)
    const geometry = buildConstellationGeometry(many, [], lookup, false, world)
    expect(geometry.pointCount).toBe(24)
  })

  it('marks the newest stop and rings it', () => {
    const geometry = buildConstellationGeometry(
      [],
      [step('f0'), step('f3'), step('f1', 'jade')],
      indexOf,
      false,
      world,
    )
    const kinds = Array.from(
      { length: geometry.pointCount },
      (_, at) => geometry.points[at * POINT_STRIDE + 6],
    )
    expect(kinds.filter((kind) => kind === POINT_KIND.here)).toHaveLength(1)
    // One glint rides the coloured link only.
    expect(kinds.filter((kind) => kind === POINT_KIND.glint)).toHaveLength(1)
    const here = kinds.indexOf(POINT_KIND.here)
    expect(geometry.points[here * POINT_STRIDE]).toBe(1)
  })

  it('light theme uses light ink', () => {
    const [r, g, b] = PATH_INK.amethyst.light.split(',').map(Number)
    const [dr, dg, db] = PATH_INK.amethyst.dark.split(',').map(Number)
    const path = [step('f0'), step('f1', 'amethyst')]
    const colourOf = (light: boolean) => {
      const geometry = buildConstellationGeometry(
        [],
        path,
        indexOf,
        light,
        world,
      )
      for (let at = 0; at < geometry.pointCount; at += 1) {
        const offset = at * POINT_STRIDE
        if (geometry.points[offset + 6] === POINT_KIND.tier) {
          return Array.from(geometry.points.subarray(offset + 3, offset + 6))
        }
      }
      return null
    }
    expect(colourOf(true)).toEqual([r / 255, g / 255, b / 255].map(Math.fround))
    expect(colourOf(false)).toEqual(
      [dr / 255, dg / 255, db / 255].map(Math.fround),
    )
    expect(linkInks(true)).not.toEqual(linkInks(false))
  })

  it('draws a new stop in, and leaves old ones whole', () => {
    const epochMs = 1_000_000
    const geometry = buildConstellationGeometry(
      [],
      [step('f0'), step('f1', 'gold', epochMs + 2_500), step('f2', 'gold', 0)],
      indexOf,
      false,
      { ...world, epochMs },
    )
    expect(geometry.links[4]).toBeCloseTo(2.5)
    expect(geometry.links[27 * LINK_STRIDE + 4]).toBeLessThan(-1_000)
  })
})

describe('geometry cache', () => {
  const saved = ['f0', 'f1']
  const path = [step('f0'), step('f1')]

  it('rebuilds only when inputs change', () => {
    const cache = createGeometryCache()
    const first = cache.get(saved, path, indexOf, false, world)
    // Equal contents in fresh arrays are the same inputs.
    expect(cache.get([...saved], [...path], indexOf, false, world)).toBe(first)
    expect(cache.get(saved, path, indexOf, true, world)).not.toBe(first)
    const light = cache.get(saved, path, indexOf, true, world)
    expect(cache.get(saved, path, indexOf, true, world)).toBe(light)
    const grown = cache.get(saved, [...path, step('f2')], indexOf, true, world)
    expect(grown).not.toBe(light)
    expect(grown.linkCount).toBeGreaterThan(light.linkCount)
  })

  it('rebuilds when a stop is upgraded in place', () => {
    const cache = createGeometryCache()
    const first = cache.get([], [step('f0'), step('f1')], indexOf, false, world)
    const upgraded = cache.get(
      [],
      [step('f0'), step('f1', 'jade')],
      indexOf,
      false,
      world,
    )
    expect(upgraded).not.toBe(first)
  })
})
