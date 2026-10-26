// The next shuffle's candidates, loaded ahead of time. A few films are drawn
// with the shuffle's own rules (any film on the globe but the current one,
// leaning toward saved taste) and their card poster is fetched at low
// priority. A shuffle then lands on a random one of those already loaded, so
// its card opens on a sharp poster, and draws a fresh one only when none is
// ready. Which film comes next stays a random choice among several, so the
// pool never commits to one pick ahead of time.

export type ShufflePool = {
  // Tops the pool up to its size with `draw` (null when nothing is left to
  // draw), preloading each new film.
  refill: (draw: () => string | null) => void
  // A film for the next shuffle: a loaded candidate if any, else any
  // candidate, else null. `allowed` drops films no longer on the globe.
  take: (
    currentId: string | null,
    allowed: (id: string) => boolean,
    random: () => number,
  ) => string | null
  clear: () => void
  // Candidate ids and whether each is loaded, for tests and debugging.
  peek: () => { id: string; loaded: boolean }[]
}

export const SHUFFLE_POOL_SIZE = 3

export const createShufflePool = (
  preload: (id: string) => Promise<unknown>,
  size = SHUFFLE_POOL_SIZE,
): ShufflePool => {
  const entries = new Map<string, { loaded: boolean }>()

  const refill = (draw: () => string | null) => {
    // A few extra draws, since one can repeat a film already in the pool.
    for (let tries = 0; entries.size < size && tries < size * 3; tries += 1) {
      const id = draw()
      if (id === null) return
      if (entries.has(id)) continue
      const entry = { loaded: false }
      entries.set(id, entry)
      preload(id).then(
        () => {
          entry.loaded = true
        },
        () => {
          // Never ready: a shuffle can still land on it, and loads it then.
        },
      )
    }
  }

  const take = (
    currentId: string | null,
    allowed: (id: string) => boolean,
    random: () => number,
  ) => {
    for (const id of [...entries.keys()])
      if (!allowed(id) || id === currentId) entries.delete(id)
    const ids = [...entries.keys()]
    const loaded = ids.filter((id) => entries.get(id)?.loaded)
    const from = loaded.length ? loaded : ids
    if (!from.length) return null
    const id =
      from[Math.min(from.length - 1, Math.floor(random() * from.length))]
    entries.delete(id)
    return id
  }

  return {
    refill,
    take,
    clear: () => entries.clear(),
    peek: () =>
      [...entries].map(([id, entry]) => ({ id, loaded: entry.loaded })),
  }
}
