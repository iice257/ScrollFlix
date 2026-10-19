// The saved-film constellations and the session path as flat buffers for the
// globe's WebGL pass (infinite-movie-menu.tsx). Nothing here is projected: a
// link is only the two posters it joins and a parameter along the arc, and the
// vertex shader turns that into a point on the sphere every frame. So the
// buffers are rebuilt when the saved set or the path changes, never per frame.

import { buildConstellation } from './constellation'
import { PATH_INK, type PathPoint } from './session-path'

export const MAX_HEARTS = 24
// A link is ARC_STEPS + 1 vertices, from t = 0 to t = 1.
export const ARC_STEPS = 26
export const DRAW_IN_MS = 900
// Links are drawn this far above the globe's surface so they float over it.
export const LIFT = 1.018

// Per link vertex: instance index of each end, t along the arc (0..1), the
// style (see LINK_STYLE) and when the link started drawing in (seconds on the
// overlay clock, far in the past when it should simply be there).
export const LINK_STRIDE = 5
// Per point: instance index (and the far end of a glint's link), size in px,
// r, g, b (0..1), kind (POINT_KIND) and a stable 0..1 seed for the twinkle.
export const POINT_STRIDE = 8

export const LINK_STYLE = {
  saved: 0,
  plain: 1,
  frost: 2,
  amethyst: 3,
  jade: 4,
  gold: 5,
} as const
export const LINK_STYLE_COUNT = 6

export const POINT_KIND = {
  heart: 0,
  star: 1,
  tier: 2,
  here: 3,
  glint: 4,
} as const

const FINISHED = -1e4

export type Vec3 = readonly [number, number, number]

export type GeometryWorld = {
  // A poster's position on the globe, in a frame that turns with it (the
  // distances between posters never change as the globe spins).
  positionOf: (index: number) => Vec3
  // Saved films further apart than this stand alone.
  maxLinkLength: number
  // What `drawInStart` is measured from (Date.now() at the clock's zero).
  epochMs?: number
}

export type ConstellationGeometry = {
  links: Float32Array
  linkCount: number
  points: Float32Array
  pointCount: number
}

export type IndexOf = (id: string) => number | null

const parseInk = (ink: string) =>
  ink.split(',').map((part) => Number(part.trim()) / 255)

const ROSE = { dark: '255, 214, 226', light: '170, 50, 90' }
const LINE = { dark: '236, 243, 255', light: '46, 56, 112' }
const CORE = { dark: '255, 255, 255', light: '36, 44, 100' }
const TIERS = ['frost', 'amethyst', 'jade', 'gold'] as const

// The colour of each link style, in LINK_STYLE order, flat rgb (0..1).
export const linkInks = (light: boolean) => {
  const mode = light ? 'light' : 'dark'
  return [
    ...parseInk(ROSE[mode]),
    ...parseInk(LINE[mode]),
    ...TIERS.flatMap((tier) => parseInk(PATH_INK[tier][mode])),
  ]
}

// A stable 0..1 number for an id, so every star twinkles on its own beat.
const hashUnit = (id: string) => {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}

export const buildConstellationGeometry = (
  savedIds: readonly string[],
  path: readonly PathPoint[],
  indexOf: IndexOf,
  light: boolean,
  world: GeometryWorld,
): ConstellationGeometry => {
  const mode = light ? 'light' : 'dark'
  const epochMs = world.epochMs ?? 0
  const linkData: number[] = []
  const pointData: number[] = []
  let linkCount = 0
  let pointCount = 0

  const addLink = (a: number, b: number, style: number, at: number) => {
    const start = at ? (at - epochMs) / 1000 : FINISHED
    for (let step = 0; step <= ARC_STEPS; step += 1) {
      linkData.push(a, b, step / ARC_STEPS, style, start)
    }
    linkCount += ARC_STEPS + 1
  }
  const addPoint = (
    index: number,
    other: number,
    size: number,
    ink: string,
    kind: number,
    id: string,
  ) => {
    pointData.push(index, other, size, ...parseInk(ink), kind, hashUnit(id))
    pointCount += 1
  }

  // Saved films: thin links between the nearest ones, a heart on each.
  const saved: Array<{ id: string; index: number }> = []
  const seen = new Set<string>()
  for (const id of savedIds.slice(0, MAX_HEARTS)) {
    if (seen.has(id)) continue
    seen.add(id)
    const index = indexOf(id)
    if (index !== null) saved.push({ id, index })
  }
  if (saved.length) {
    const links = buildConstellation(
      saved.map(({ id, index }) => {
        const [x, y, z] = world.positionOf(index)
        return { id, x, y, z, r: 0, depth: 0 }
      }),
      world.maxLinkLength,
    )
    for (const [from, to] of links) {
      addLink(saved[from].index, saved[to].index, LINK_STYLE.saved, 0)
    }
    for (const { id, index } of saved) {
      addPoint(index, index, 6, ROSE[mode], POINT_KIND.heart, id)
    }
  }

  // The session path: a link from each stop to the next, a point on each film
  // and a ring on the newest.
  if (path.length >= 2) {
    let previous: { id: string; index: number } | null = null
    let last: { id: string; index: number } | null = null
    for (const entry of path) {
      const index = indexOf(entry.id)
      if (index === null) {
        previous = null
        continue
      }
      const here = { id: entry.id, index }
      if (previous && previous.id !== here.id) {
        addLink(
          previous.index,
          index,
          entry.tier ? LINK_STYLE[entry.tier] : LINK_STYLE.plain,
          entry.at,
        )
        if (entry.tier) {
          // A glint rides the coloured link.
          addPoint(
            previous.index,
            index,
            8,
            PATH_INK[entry.tier][mode],
            POINT_KIND.glint,
            `${previous.id}>${entry.id}`,
          )
        }
      }
      previous = here
      last = here
    }
    const drawn = new Set<string>()
    for (const entry of path) {
      if (drawn.has(entry.id)) continue
      const index = indexOf(entry.id)
      if (index === null) continue
      drawn.add(entry.id)
      if (entry.tier) {
        addPoint(
          index,
          index,
          12,
          PATH_INK[entry.tier][mode],
          POINT_KIND.tier,
          entry.id,
        )
      } else {
        addPoint(index, index, 5, CORE[mode], POINT_KIND.star, entry.id)
      }
    }
    if (last) {
      addPoint(last.index, last.index, 13, LINE[mode], POINT_KIND.here, last.id)
    }
  }

  return {
    links: new Float32Array(linkData),
    linkCount,
    points: new Float32Array(pointData),
    pointCount,
  }
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a === b || (a.length === b.length && a.every((id, at) => id === b[at]))

const samePath = (a: readonly PathPoint[], b: readonly PathPoint[]) =>
  a === b ||
  (a.length === b.length &&
    a.every(
      (entry, at) =>
        entry.id === b[at].id &&
        entry.tier === b[at].tier &&
        entry.at === b[at].at,
    ))

// Remembers the last geometry and hands it back while the inputs are equal, so
// a new array with the same films in it costs nothing.
export const createGeometryCache = () => {
  let inputs: {
    savedIds: readonly string[]
    path: readonly PathPoint[]
    indexOf: IndexOf
    light: boolean
    world: GeometryWorld
  } | null = null
  let geometry: ConstellationGeometry | null = null

  return {
    get: (
      savedIds: readonly string[],
      path: readonly PathPoint[],
      indexOf: IndexOf,
      light: boolean,
      world: GeometryWorld,
    ) => {
      if (
        geometry &&
        inputs &&
        inputs.light === light &&
        inputs.indexOf === indexOf &&
        inputs.world === world &&
        sameIds(inputs.savedIds, savedIds) &&
        samePath(inputs.path, path)
      ) {
        return geometry
      }
      inputs = { savedIds, path, indexOf, light, world }
      geometry = buildConstellationGeometry(
        savedIds,
        path,
        indexOf,
        light,
        world,
      )
      return geometry
    },
  }
}
