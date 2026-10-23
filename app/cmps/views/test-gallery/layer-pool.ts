// Hands out the layers of a texture array. When it is full, the layer that
// was visible longest ago is taken over; touching a key keeps its layer.
export const createLayerPool = (capacity: number) => {
  const holders = new Map<string, { layer: number; touched: number }>()
  const free: number[] = []
  for (let layer = capacity - 1; layer >= 0; layer -= 1) free.push(layer)

  return {
    // The key's layer (reusing the one it already holds). `evicted` is the key
    // that lost its layer to make room, if any.
    acquire(
      key: string,
      now: number,
    ): { layer: number; evicted: string | null } {
      const held = holders.get(key)
      if (held) {
        held.touched = now
        return { layer: held.layer, evicted: null }
      }
      if (capacity <= 0) return { layer: -1, evicted: null }
      const layer = free.pop()
      if (layer !== undefined) {
        holders.set(key, { layer, touched: now })
        return { layer, evicted: null }
      }
      let oldestKey: string | null = null
      let oldest = Number.POSITIVE_INFINITY
      for (const [heldKey, entry] of holders) {
        if (entry.touched < oldest) {
          oldest = entry.touched
          oldestKey = heldKey
        }
      }
      if (oldestKey === null) return { layer: -1, evicted: null }
      const taken = holders.get(oldestKey)
      holders.delete(oldestKey)
      const reused = taken?.layer ?? 0
      holders.set(key, { layer: reused, touched: now })
      return { layer: reused, evicted: oldestKey }
    },
    touch(key: string, now: number) {
      const held = holders.get(key)
      if (held) held.touched = now
    },
    layerOf(key: string): number | null {
      return holders.get(key)?.layer ?? null
    },
    release(key: string) {
      const held = holders.get(key)
      if (!held) return
      holders.delete(key)
      free.push(held.layer)
    },
    keys: () => holders.keys(),
    get size() {
      return holders.size
    },
  }
}

export type LayerPool = ReturnType<typeof createLayerPool>
