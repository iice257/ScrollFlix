// The parts of "variety" that are pure logic, so they can be tested without an
// audio device: a shuffle bag that never repeats, small human-sized random
// changes and pointer panning.

export type Random = () => number

// ------------------------------------------------------------------ the bag

export type Bag = {
  // The next index in 0..count-1. Every index is used once before any comes
  // round again, and the last index of one round is never the first of the next.
  next: (count: number) => number
  reset: () => void
}

const shuffle = (items: number[], random: Random) => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

export const createBag = (random: Random = Math.random): Bag => {
  let order: number[] = []
  let size = 0
  let last = -1
  return {
    next: (count) => {
      if (count <= 1) {
        last = 0
        return 0
      }
      if (size !== count || order.length === 0) {
        order = shuffle(
          Array.from({ length: count }, (_, i) => i),
          random,
        )
        size = count
        if (order[0] === last) {
          const swap = 1 + Math.floor(random() * (count - 1))
          ;[order[0], order[swap]] = [order[swap], order[0]]
        }
      }
      const pick = order.shift() as number
      last = pick
      return pick
    },
    reset: () => {
      order = []
      size = 0
      last = -1
    },
  }
}

// ------------------------------------------------------------- humanising

export type Humanize = {
  // Random pitch change either way, in semitones.
  semis: number
  // Random level change either way, in dB.
  gainDb: number
}

export const dbToGain = (db: number) => 10 ** (db / 20)
export const semisToRate = (semis: number) => 2 ** (semis / 12)

const between = (random: Random, low: number, high: number) =>
  low + random() * (high - low)

// How much quieter a cue that fires again very soon after itself should be, so
// a fast run of hovers or taps feels light rather than machine-gunned.
export const recencyDb = (sinceLastMs: number) => {
  if (sinceLastMs >= 400) return 0
  if (sinceLastMs <= 60) return -4
  return -4 * (1 - (sinceLastMs - 60) / 340)
}

export const humanize = (
  spec: Humanize,
  sinceLastMs: number,
  random: Random = Math.random,
) => {
  const semis = between(random, -spec.semis, spec.semis)
  const gainDb =
    between(random, -spec.gainDb, spec.gainDb) + recencyDb(sinceLastMs)
  return { semis, gainDb, rate: semisToRate(semis), gain: dbToGain(gainDb) }
}

// -1..1 from a pointer's x position, eased so the middle is calm and the
// edges are never fully hard-panned.
export const panFromPointer = (x: number, width: number, reach = 0.7) => {
  if (!Number.isFinite(x) || width <= 0) return 0
  const unit = Math.min(1, Math.max(-1, (x / width) * 2 - 1))
  return unit * reach
}
