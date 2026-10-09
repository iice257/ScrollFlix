import { pickWeighted } from './moods/taste'

// TMDB ids that must never be the landing movie ("Marmaduke").
const EXCLUDED_LANDING_TMDB_IDS: readonly string[] = ['38579']

type WithId = { id: string }

// Movie ids are `${index}-${tmdbId}`; a bare index has no TMDB id.
const tmdbIdOf = (id: string) => id.slice(id.indexOf('-') + 1)

// What a shared link carries for a film: its TMDB id, which stays the same
// when the catalogue is reordered (the index part of the id does not).
export const filmLinkId = (id: string) => (id.includes('-') ? tmdbIdOf(id) : id)

export const matchesFilmLink = (movie: WithId, linked: string) =>
  movie.id === linked || filmLinkId(movie.id) === linked

// A random movie from the globe's visible set, for the first centred movie of
// a page load. `random` is injected so this stays deterministic under test.
export const pickLandingMovie = <T extends WithId>(
  visible: readonly T[],
  random: () => number,
  excludedTmdbIds: readonly string[] = EXCLUDED_LANDING_TMDB_IDS,
  // A relative chance per film, so what someone saved can tip the first pick.
  weightOf?: (movie: T) => number,
): T | null => {
  const eligible = visible.filter(
    (movie) =>
      !(movie.id.includes('-') && excludedTmdbIds.includes(tmdbIdOf(movie.id))),
  )
  const pool = eligible.length ? eligible : visible
  if (!pool.length) return null
  if (weightOf) return pickWeighted(pool, weightOf, random)
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
  return pool[index]
}
