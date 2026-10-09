// Constellations: the saved films that are on the globe light up and are
// joined into a shape. This file is the geometry and the on/off setting; the
// drawing is in constellation-layer.tsx.

export type ConstellationStar = {
  id: string
  x: number
  y: number
  // Half the poster's size on screen, so glows follow the globe's perspective.
  r: number
  // Closer to the viewer is larger.
  depth: number
}

export type ConstellationLink = readonly [from: number, to: number]

// The shortest set of links that joins the stars (a minimum spanning tree),
// leaving out links longer than `maxLength`: those stars simply stand apart,
// so the shape never stretches across the whole globe.
export const buildConstellation = (
  stars: readonly ConstellationStar[],
  maxLength: number,
): ConstellationLink[] => {
  const count = stars.length
  if (count < 2) return []
  const links: ConstellationLink[] = []
  const joined = new Array<boolean>(count).fill(false)
  const best = new Array<number>(count).fill(Number.POSITIVE_INFINITY)
  const from = new Array<number>(count).fill(-1)

  for (let start = 0; start < count; start += 1) {
    if (joined[start]) continue
    // Grow one tree from this star.
    best[start] = 0
    while (true) {
      let next = -1
      for (let index = 0; index < count; index += 1) {
        if (!joined[index] && best[index] < Number.POSITIVE_INFINITY) {
          if (next === -1 || best[index] < best[next]) next = index
        }
      }
      if (next === -1) break
      joined[next] = true
      if (from[next] >= 0 && best[next] <= maxLength) {
        links.push([from[next], next])
      }
      for (let index = 0; index < count; index += 1) {
        if (joined[index]) continue
        const distance = Math.hypot(
          stars[index].x - stars[next].x,
          stars[index].y - stars[next].y,
        )
        if (distance < best[index]) {
          best[index] = distance
          from[index] = next
        }
      }
    }
  }
  return links
}

// ---------------------------------------------------------------- setting

export const CONSTELLATIONS_STORAGE_KEY = 'wtw:constellations'

const listeners = new Set<() => void>()
let enabled: boolean | null = null

const read = () => {
  try {
    return window.localStorage.getItem(CONSTELLATIONS_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

export const constellationSetting = {
  get: () => {
    enabled ??= read()
    return enabled
  },
  set: (next: boolean) => {
    enabled = next
    try {
      window.localStorage.setItem(CONSTELLATIONS_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
    for (const listener of listeners) listener()
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
