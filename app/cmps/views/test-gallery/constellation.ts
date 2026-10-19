// Constellations: the saved films that are on the globe light up and are
// joined into a shape. This file is the geometry and the on/off setting; the
// drawing is in constellation-layer.tsx.

export type ConstellationStar = {
  id: string
  x: number
  y: number
  // For stars on a sphere: the depth, so distances are measured through 3D.
  z?: number
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
          (stars[index].z ?? 0) - (stars[next].z ?? 0),
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

// Whether the links between saved films are drawn (off until turned on). The
// session path has its own switch; both live in globe-lines.ts.
export {
  CONSTELLATIONS_STORAGE_KEY,
  constellationSetting,
} from './globe-lines'
