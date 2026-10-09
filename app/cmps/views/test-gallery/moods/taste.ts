import { MOOD_GENRES, MOOD_WORLDS, type MoodFilter } from './mood-worlds'

// What the saved films say about a person's taste, and a gentle nudge towards
// it. Nothing is stored beyond the saved list itself: the profile is worked
// out again whenever it is needed.

export type TasteMovie = {
  id: string
  genres: readonly string[]
  ratingValue: number | null
}

export type TasteProfile = {
  // How many saved films it was built from.
  size: number
  // Each genre's share of the saved films, scaled so the most common is 1.
  genres: Record<string, number>
  // The same for each mood world.
  moods: Record<MoodFilter, number>
}

// Fewer saved films than this say too little to lean on.
export const MIN_SAVED_FOR_TASTE = 3
// How much more likely a perfect match is than an unrelated film, at most.
export const MAX_TASTE_BOOST = 2

export const HIGH_RATED_MIN = 7.5

export const moodsOf = (movie: TasteMovie): MoodFilter[] => {
  const genres = new Set(movie.genres)
  const moods: MoodFilter[] = []
  for (const world of MOOD_WORLDS) {
    if (world.id === 'highRated') {
      if (movie.ratingValue !== null && movie.ratingValue >= HIGH_RATED_MIN) {
        moods.push(world.id)
      }
    } else if (MOOD_GENRES[world.id].some((genre) => genres.has(genre))) {
      moods.push(world.id)
    }
  }
  return moods
}

const scale = (counts: Record<string, number>) => {
  const peak = Math.max(0, ...Object.values(counts))
  const scaled: Record<string, number> = {}
  if (peak <= 0) return scaled
  for (const [key, count] of Object.entries(counts)) scaled[key] = count / peak
  return scaled
}

export const buildTasteProfile = (
  saved: readonly TasteMovie[],
): TasteProfile | null => {
  if (saved.length < MIN_SAVED_FOR_TASTE) return null
  const genreCounts: Record<string, number> = {}
  const moodCounts: Record<string, number> = {}
  for (const movie of saved) {
    for (const genre of new Set(movie.genres)) {
      genreCounts[genre] = (genreCounts[genre] ?? 0) + 1
    }
    for (const mood of moodsOf(movie)) {
      moodCounts[mood] = (moodCounts[mood] ?? 0) + 1
    }
  }
  const moodScale = scale(moodCounts)
  const moods = Object.fromEntries(
    MOOD_WORLDS.map((world) => [world.id, moodScale[world.id] ?? 0]),
  ) as Record<MoodFilter, number>
  return { size: saved.length, genres: scale(genreCounts), moods }
}

// 0 for a film with nothing in common with the profile, up to 1 for one that
// matches its strongest genres.
export const affinity = (movie: TasteMovie, profile: TasteProfile) => {
  const genres = [...new Set(movie.genres)]
  if (!genres.length) return 0
  const total = genres.reduce(
    (sum, genre) => sum + (profile.genres[genre] ?? 0),
    0,
  )
  return Math.min(1, total / Math.min(genres.length, 2))
}

// A relative chance for the shuffle: 1 for most films, up to 1 + the boost for
// the ones that fit the profile.
export const tasteWeight = (movie: TasteMovie, profile: TasteProfile | null) =>
  profile ? 1 + MAX_TASTE_BOOST * affinity(movie, profile) : 1

export const leadingMood = (
  profile: TasteProfile | null,
): MoodFilter | null => {
  if (!profile) return null
  let best: MoodFilter | null = null
  let bestScore = 0
  for (const world of MOOD_WORLDS) {
    const score = profile.moods[world.id]
    if (score > bestScore) {
      best = world.id
      bestScore = score
    }
  }
  return best
}

// The genres the saved films lean on most, strongest first.
export const topGenres = (profile: TasteProfile | null, count = 2) =>
  profile
    ? Object.entries(profile.genres)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, count)
        .map(([genre]) => genre)
    : []

// A weighted random choice. With every weight equal it is a plain random pick.
export const pickWeighted = <T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  random: () => number,
): T | null => {
  if (!items.length) return null
  const weights = items.map((item) => Math.max(0, weightOf(item)))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) {
    return items[
      Math.min(items.length - 1, Math.floor(random() * items.length))
    ]
  }
  let target = random() * total
  for (let index = 0; index < items.length; index += 1) {
    target -= weights[index]
    if (target < 0) return items[index]
  }
  return items[items.length - 1]
}
