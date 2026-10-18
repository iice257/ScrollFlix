// The catalogue row codec. A film becomes one compact array so 100,000 of
// them stay small on the wire:
//
//   [tmdbId, title, year, rating x10, genre indices, country index,
//    poster path, backdrop path, average colour, vote count,
//    popularity x10, runtime minutes]
//
// Genre and country names live once in the manifest. Paths have no leading
// slash and no ".jpg". A missing value is '' (a missing runtime is 0).
// Overviews, taglines and IMDb ids live in separate text chunks:
// [overview, tagline, imdbId].
import { createHash } from 'node:crypto'

const cleanText = (value) => String(value ?? '').trim()

// '/abc.jpg' -> 'abc'. Anything that is not a plain .jpg path cannot be
// rebuilt by the app, so it counts as missing.
const stripPath = (path) => {
  const match = /^\/?([\w-]+)\.jpg$/.exec(cleanText(path))
  return match ? match[1] : ''
}

// TMDB movie details (with external_ids appended) -> a film, or null when it
// cannot be shown: no poster, no release year, no title.
export const normaliseFilm = (details) => {
  if (!details || !Number.isFinite(Number(details.id))) return null
  const title = cleanText(details.title)
  const year = Number.parseInt(cleanText(details.release_date).slice(0, 4), 10)
  const posterPath = stripPath(details.poster_path)
  if (!title || !posterPath || !(year > 0)) return null
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
  return {
    id: Number(details.id),
    title,
    year,
    rating10: Math.max(0, Math.round(number(details.vote_average) * 10)),
    genres: (details.genres ?? [])
      .map((genre) => cleanText(genre?.name))
      .filter(Boolean),
    country: cleanText(details.production_countries?.[0]?.name),
    posterPath,
    backdropPath: stripPath(details.backdrop_path),
    voteCount: Math.max(0, Math.round(number(details.vote_count))),
    popularity10: Math.max(0, Math.round(number(details.popularity) * 10)),
    runtime: Math.max(0, Math.round(number(details.runtime))),
    overview: cleanText(details.overview),
    tagline: cleanText(details.tagline),
    imdbId: cleanText(details.external_ids?.imdb_id ?? details.imdb_id),
  }
}

// Most-voted first, ties by id: the order the default globe is built from.
export const compareFilms = (a, b) => b.voteCount - a.voteCount || a.id - b.id

// Names by how often they occur (most common first, then A to Z), so the
// indices in rows are small and stable.
const frequencyTable = (values) => {
  const counts = new Map()
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([name]) => name)
}

const contentHash = (content) =>
  createHash('sha1').update(content).digest('hex').slice(0, 8)

const slice = (items, size) => {
  const parts = []
  for (let start = 0; start < items.length; start += size) {
    parts.push(items.slice(start, start + size))
  }
  return parts
}

export const encodeChunks = (
  films,
  {
    rowsPerChunk = 2000,
    textRowsPerChunk = 500,
    generatedAt = new Date().toISOString(),
  } = {},
) => {
  const sorted = [...films].sort(compareFilms)
  const genres = frequencyTable(sorted.flatMap((film) => film.genres))
  const countries = frequencyTable(sorted.map((film) => film.country))
  const genreIndex = new Map(genres.map((name, index) => [name, index]))
  const countryIndex = new Map(countries.map((name, index) => [name, index]))

  const toRow = (film) => [
    film.id,
    film.title,
    film.year,
    film.rating10,
    film.genres.map((name) => genreIndex.get(name)),
    countryIndex.get(film.country) ?? -1,
    film.posterPath,
    film.backdropPath ?? '',
    film.avgColour ?? '',
    film.voteCount,
    film.popularity10,
    film.runtime || 0,
  ]
  const toText = (film) => [film.overview, film.tagline, film.imdbId]

  const files = new Map()
  const addFiles = (prefix, rows) =>
    slice(rows, prefix === 'films' ? rowsPerChunk : textRowsPerChunk).map(
      (part, index) => {
        const content = JSON.stringify(part)
        const name = `${prefix}-${index}.${contentHash(content)}.json`
        files.set(name, content)
        return name
      },
    )

  const chunks = addFiles('films', sorted.map(toRow))
  const texts = addFiles('text', sorted.map(toText))
  const manifest = {
    version: 2,
    count: sorted.length,
    chunks,
    texts,
    chunkSize: rowsPerChunk,
    textChunkSize: textRowsPerChunk,
    genres,
    countries,
    generatedAt,
  }
  return { manifest, files }
}

export const decodeRow = (row, manifest) => {
  const [
    id,
    title,
    year,
    rating10,
    genres,
    country,
    posterPath,
    backdropPath,
    avgColour,
    voteCount,
    popularity10,
    runtime,
  ] = row
  return {
    id,
    title,
    year,
    rating10,
    genres: genres.map((index) => manifest.genres[index]),
    country: manifest.countries[country] ?? '',
    posterPath,
    backdropPath,
    avgColour,
    voteCount,
    popularity10,
    runtime,
  }
}

export const decodeText = ([overview, tagline, imdbId]) => ({
  overview,
  tagline,
  imdbId,
})
