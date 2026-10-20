import { migrateLegacyId } from './catalog-loader'
import { pickWeighted } from './moods/taste'

// TMDB ids that must never be the landing movie ("Marmaduke").
const EXCLUDED_LANDING_TMDB_IDS: readonly string[] = ['38579']

type WithId = { id: string }

// Movie ids are `c${tmdbId}` (before catalogue v2 they were
// `${index}-${tmdbId}`; a bare TMDB id is also accepted).
const tmdbIdOf = (id: string) => migrateLegacyId(id).replace(/^c(?=\d)/, '')

// What a shared link carries for a film: its TMDB id, which stays the same
// when the catalogue is rebuilt.
export const filmLinkId = tmdbIdOf

// Links shared before catalogue v2 carry a bare TMDB id or an old full id;
// both still find the film.
export const matchesFilmLink = (movie: WithId, linked: string) =>
  movie.id === linked || filmLinkId(movie.id) === filmLinkId(linked)

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
    (movie) => !excludedTmdbIds.includes(tmdbIdOf(movie.id)),
  )
  const pool = eligible.length ? eligible : visible
  if (!pool.length) return null
  if (weightOf) return pickWeighted(pool, weightOf, random)
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
  return pool[index]
}
