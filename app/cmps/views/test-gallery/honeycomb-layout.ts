export type HoneycombVec3 = [number, number, number]

const DEFAULT_POINT_COUNT = 750
const DEFAULT_RADIUS = 2.58
const RELAXATION_PASSES = 48
const RELAXATION_STRENGTH = 0.025

const createSeedPositions = (count: number, radius: number) => {
  const positions: HoneycombVec3[] = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  for (let index = 0; index < count; index += 1) {
    const y = 1 - ((index + 0.5) / Math.max(1, count)) * 2
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = index * goldenAngle
    positions.push([
      radius * Math.cos(theta) * ringRadius,
      radius * y,
      radius * Math.sin(theta) * ringRadius,
    ])
  }

  return positions
}

// Layouts are deterministic, so each (count, radius) is computed once per page.
const layoutCache = new Map<string, HoneycombVec3[]>()
const pendingLayouts = new Map<string, Promise<void>>()
const layoutKey = (count: number, radius: number) => `${count}:${radius}`

const runToEnd = <T>(steps: Generator<void, T>) => {
  let step = steps.next()
  while (!step.done) step = steps.next()
  return step.value
}

export const hasHoneycombLayout = (
  count = DEFAULT_POINT_COUNT,
  radius = DEFAULT_RADIUS,
) => layoutCache.has(layoutKey(count, radius))

export const createHoneycombSpherePositions = (
  count = DEFAULT_POINT_COUNT,
  radius = DEFAULT_RADIUS,
) => {
  const cacheKey = layoutKey(count, radius)
  const cached = layoutCache.get(cacheKey)
  if (cached) return cached
  const positions = runToEnd(relaxHoneycombPositions(count, radius))
  layoutCache.set(cacheKey, positions)
  return positions
}

// The longest the relaxation runs before handing the thread back.
const SLICE_MS = 6

// Solves a layout in short slices, so building a new globe never blocks
// input; createHoneycombSpherePositions then finds it ready.
export const prewarmHoneycombLayout = (
  count = DEFAULT_POINT_COUNT,
  radius = DEFAULT_RADIUS,
) => {
  const cacheKey = layoutKey(count, radius)
  if (layoutCache.has(cacheKey)) return Promise.resolve()
  const pending = pendingLayouts.get(cacheKey)
  if (pending) return pending
  const request = (async () => {
    const steps = relaxHoneycombPositions(count, radius)
    let sliceStart = performance.now()
    let step = steps.next()
    while (!step.done) {
      if (performance.now() - sliceStart > SLICE_MS) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        sliceStart = performance.now()
      }
      step = steps.next()
    }
    layoutCache.set(cacheKey, step.value)
  })().finally(() => pendingLayouts.delete(cacheKey))
  pendingLayouts.set(cacheKey, request)
  return request
}

// One relaxation pass per step, so callers can pause between passes.
function* relaxHoneycombPositions(
  count: number,
  radius: number,
): Generator<void, HoneycombVec3[]> {
  if (count <= 1) return createSeedPositions(Math.max(0, count), radius)

  let positions = createSeedPositions(count, radius)
  const targetSpacing =
    radius * Math.sqrt((8 * Math.PI) / (Math.sqrt(3) * count))
  const interactionDistance = targetSpacing * 1.04

  for (let pass = 0; pass < RELAXATION_PASSES; pass += 1) {
    const forces = Array.from({ length: count }, (): HoneycombVec3 => [0, 0, 0])

    // Only nearby points push each other, so bucket points into a grid of
    // interaction-sized cells and compare each with its 27 neighbouring cells
    // instead of every other point.
    const cellOf = (value: number) =>
      Math.floor((value + radius) / interactionDistance) + 1
    const cellsPerAxis = Math.ceil((2 * radius) / interactionDistance) + 3
    const cellKey = (x: number, y: number, z: number) =>
      (x * cellsPerAxis + y) * cellsPerAxis + z
    const buckets = new Map<number, number[]>()
    const pointCells = positions.map(([x, y, z], index) => {
      const cell: HoneycombVec3 = [cellOf(x), cellOf(y), cellOf(z)]
      const key = cellKey(cell[0], cell[1], cell[2])
      const bucket = buckets.get(key)
      if (bucket) bucket.push(index)
      else buckets.set(key, [index])
      return cell
    })

    for (let left = 0; left < count; left += 1) {
      const [cellX, cellY, cellZ] = pointCells[left]
      for (let offsetX = -1; offsetX <= 1; offsetX += 1)
        for (let offsetY = -1; offsetY <= 1; offsetY += 1)
          for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
            const neighbours = buckets.get(
              cellKey(cellX + offsetX, cellY + offsetY, cellZ + offsetZ),
            )
            if (!neighbours) continue
            for (const right of neighbours) {
              if (right <= left) continue
              const dx = positions[left][0] - positions[right][0]
              const dy = positions[left][1] - positions[right][1]
              const dz = positions[left][2] - positions[right][2]
              const distance = Math.hypot(dx, dy, dz)
              if (distance >= interactionDistance || distance < 0.000001)
                continue

              const pressure =
                ((interactionDistance - distance) / interactionDistance) *
                RELAXATION_STRENGTH
              const forceX = (dx / distance) * pressure
              const forceY = (dy / distance) * pressure
              const forceZ = (dz / distance) * pressure
              forces[left][0] += forceX
              forces[left][1] += forceY
              forces[left][2] += forceZ
              forces[right][0] -= forceX
              forces[right][1] -= forceY
              forces[right][2] -= forceZ
            }
          }
    }

    positions = positions.map((position, index) => {
      const force = forces[index]
      const radialForce =
        (force[0] * position[0] +
          force[1] * position[1] +
          force[2] * position[2]) /
        radius ** 2
      const x = position[0] + force[0] - position[0] * radialForce
      const y = position[1] + force[1] - position[1] * radialForce
      const z = position[2] + force[2] - position[2] * radialForce
      const length = Math.hypot(x, y, z) || 1
      return [
        (x / length) * radius,
        (y / length) * radius,
        (z / length) * radius,
      ]
    })
    yield
  }

  return positions
}
