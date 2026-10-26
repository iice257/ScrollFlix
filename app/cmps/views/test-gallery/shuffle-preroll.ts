// Pre-rolls the next shuffle so its full-size poster is already loaded when
// the shuffle fires.
//
// Anything the browser downloads shows in DevTools' Network tab, so loading
// exactly one poster would reveal the next pick. Instead the pick and two
// decoys are preloaded together: the same call, the same arguments, the same
// priority, in a random order. The decoys are drawn from the same candidates
// the pick is, so the three are indistinguishable. Decoys are never shown and
// are never remembered, so they cannot become a later pick.
//
// The seed and the pick live only in this closure: nothing here is exported
// state, written to the DOM, URL, window, a log or analytics. The only way to
// learn the pick is `take()`, which hands it to the shuffle that is about to
// use it and forgets it.

export type PrerollOptions<T> = {
  // The films a shuffle could land on right now (the active filters applied).
  candidates: () => readonly T[]
  // Loads and decodes the film's full-size poster. Called with the film and
  // nothing else for the pick and for both decoys.
  preload: (film: T) => unknown
  // How one film is drawn from the pool. Pass the shuffle's own (weighted)
  // pick so the pick and the decoys follow the same odds. Default: uniform.
  choose?: (pool: readonly T[], random: () => number) => T | null
  // Test seam: a source of 32-bit entropy for the fresh seed.
  entropy?: () => number
}

export type ShufflePreroll<T> = {
  // Rolls a new pick (fresh seed) and preloads it with two decoys.
  prepare: () => void
  // The pre-rolled film if there is one and it is still allowed by
  // `isAllowed`, else null. Forgets it either way.
  take: (isAllowed?: (film: T) => boolean) => T | null
  // Drops the pick (the filters changed, the view closed).
  discard: () => void
}

const DECOY_COUNT = 2

const defaultEntropy = () => {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    const out = new Uint32Array(1)
    cryptoApi.getRandomValues(out)
    return out[0]
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0
}

// Small seeded generator (mulberry32).
const seededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const createShufflePreroll = <T>(
  options: PrerollOptions<T>,
): ShufflePreroll<T> => {
  const entropy = options.entropy ?? defaultEntropy
  // Private state: only the closure below can reach it.
  let pick: T | null = null

  const prepare = () => {
    const pool = options.candidates()
    if (!pool.length) {
      pick = null
      return
    }
    const random = seededRandom(entropy())
    const choose =
      options.choose ??
      ((films: readonly T[], roll: () => number) =>
        films[Math.floor(roll() * films.length)] ?? null)
    const draw = (taken: Set<T>) => {
      for (let tries = 0; tries < 8; tries += 1) {
        const film = choose(pool, random)
        if (film !== null && !taken.has(film)) {
          taken.add(film)
          return film
        }
      }
      // A small pool: take the first free film.
      for (const film of pool) {
        if (!taken.has(film)) {
          taken.add(film)
          return film
        }
      }
      return null
    }
    const taken = new Set<T>()
    const chosen = draw(taken)
    if (chosen === null) return
    const batch: T[] = [chosen]
    for (let i = 0; i < DECOY_COUNT; i += 1) {
      const decoy = draw(taken)
      if (decoy !== null) batch.push(decoy)
    }
    // Fisher-Yates: the pick's place in the batch carries no information.
    for (let i = batch.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      const swap = batch[i]
      batch[i] = batch[j]
      batch[j] = swap
    }
    pick = chosen
    for (const film of batch) {
      try {
        const result = options.preload(film)
        if (result && typeof (result as Promise<unknown>).catch === 'function')
          (result as Promise<unknown>).catch(() => undefined)
      } catch {
        // A failed preload only means the poster loads when it is needed.
      }
    }
  }

  const take = (isAllowed?: (film: T) => boolean) => {
    const film = pick
    pick = null
    if (film === null) return null
    return !isAllowed || isAllowed(film) ? film : null
  }

  const discard = () => {
    pick = null
  }

  return { prepare, take, discard }
}
