// TMDB-shaped fixtures for the catalogue pipeline tests.
import { normaliseFilm } from '../rows.mjs'

export const details = (id, extra = {}) => ({
  id,
  title: `Film ${id}`,
  release_date: `${2000 + (id % 20)}-05-01`,
  vote_average: 7.1,
  vote_count: 1000 - (id % 500),
  popularity: 12.3,
  runtime: 100,
  genres: [{ id: 18, name: 'Drama' }],
  production_countries: [{ iso_3166_1: 'FR', name: 'France' }],
  poster_path: `/poster${id}.jpg`,
  backdrop_path: `/back${id}.jpg`,
  overview: `Overview ${id}`,
  tagline: `Tagline ${id}`,
  external_ids: { imdb_id: `tt${id}` },
  ...extra,
})

export const film = (id, extra = {}) => ({
  ...normaliseFilm(details(id)),
  avgColour: 'abcdef',
  ...extra,
})

// A fake TMDB client over a map of id -> details. `discoverFn` and
// `changesFn` can be supplied per test; every call is recorded.
export const fakeClient = ({
  movies = new Map(),
  discoverFn = () => ({ page: 1, total_pages: 1, total_results: 0, results: [] }),
  changesFn = () => ({ page: 1, total_pages: 1, results: [] }),
  failIds = new Set(),
} = {}) => {
  const calls = { discover: [], movie: [], changes: [] }
  let requests = 0
  let failures = 0
  return {
    calls,
    discover: async (params) => {
      requests += 1
      calls.discover.push(params)
      return discoverFn(params)
    },
    movie: async (id) => {
      requests += 1
      calls.movie.push(id)
      if (failIds.has(id)) {
        failures += 1
        throw new Error(`TMDB 500 /movie/${id}`)
      }
      return movies.get(id) ?? null
    },
    changes: async (start, end, page = 1) => {
      requests += 1
      calls.changes.push({ start, end, page })
      return changesFn(start, end, page)
    },
    stats: () => ({ requests, failures }),
  }
}
