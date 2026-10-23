// The film catalogue, v2: the only source of films. It is built nightly from
// TMDB (scripts/catalog/) and pulled into public/json/catalog at build time.
//
// Rows are compact arrays, most-voted first (see scripts/catalog/rows.mjs):
//   [tmdbId, title, year, rating x10, genre indices, country index,
//    poster path, backdrop path, colour, vote count, popularity x10, runtime]
// with genre and country names in the manifest. Overviews, taglines and IMDb
// ids sit in separate text chunks that load when a film is opened. Chunk
// names carry a content hash, so they are cached for good; only the manifest
// is revalidated.

export type TestMovie = {
  id: string
  rank: number
  title: string
  tagline: string
  overview: string
  genres: string[]
  year: string
  runtime: string
  runtimeMinutes: number | null
  rating: string
  ratingValue: number | null
  voteCount: number | null
  popularity: number | null
  weightedRating: number | null
  countries: string
  // TMDB poster sizes: a small one for the globe, a larger one for the
  // details card, and a 92px one for the index (drawn at about 42px).
  posterUrl: string
  posterDetailUrl?: string
  posterListUrl?: string
  // The TMDB file names without the size or ".jpg", so any size can be built.
  posterPath?: string
  backdropPath?: string | null
  // Average poster colour, shown while the poster loads.
  placeholderColor?: string
  // Position in the catalogue's lazily loaded overview/tagline chunks.
  textIndex?: number
  // Lower-case title without accents: what sorting and searching compare, so
  // neither pays for locale-aware string work per comparison.
  titleKey?: string
}

export type CatalogRow = [
  number,
  string,
  number,
  number,
  number[],
  number,
  string,
  string,
  string,
  number,
  number,
  number,
]
export type CatalogTables = { countries: string[]; genres: string[] }
export type CatalogManifestV2 = CatalogTables & {
  version: 2
  count: number
  chunks: string[]
  texts: string[]
  chunkSize: number
  textChunkSize: number
  generatedAt: string
}
export type MovieText = { overview: string; tagline: string; imdbId?: string }

const CATALOG_URL = '/json/catalog'
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p'
// Chunks of 2,000 films in vote order: the first one is the globe's top films.
const DEFAULT_CHUNK_SIZE = 2000

// Phones and weaker machines load the most-voted 20,000 films up front; the
// rest comes when the index, search or filters first open.
export const LIGHTWEIGHT_FILM_TARGET = 20_000

export const toTitleKey = (title: string) =>
  title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()

// Saved films, paths and links from before catalogue v2 hold ids shaped
// `${index}-${tmdbId}`. Every film's id is now `c${tmdbId}`.
export const migrateLegacyId = (id: string) => {
  const legacy = /^\d+-(\d+)$/.exec(id)
  return legacy ? `c${legacy[1]}` : id
}

export const withWeightedRatings = (movies: TestMovie[]): TestMovie[] => {
  const rated = movies.filter(
    (movie) =>
      movie.ratingValue !== null &&
      movie.voteCount !== null &&
      movie.voteCount > 0,
  )
  if (!rated.length)
    return movies.map((movie) => ({ ...movie, weightedRating: null }))

  const meanRating =
    rated.reduce((sum, movie) => sum + (movie.ratingValue ?? 0), 0) /
    rated.length
  const votes = rated.map((movie) => movie.voteCount ?? 0).sort((a, b) => a - b)
  const middle = Math.floor(votes.length / 2)
  const medianVotes =
    votes.length % 2 ? votes[middle] : (votes[middle - 1] + votes[middle]) / 2

  return movies.map((movie) => {
    const { ratingValue, voteCount } = movie
    if (ratingValue === null || voteCount === null || voteCount <= 0)
      return { ...movie, weightedRating: null }
    const total = voteCount + medianVotes
    return {
      ...movie,
      weightedRating:
        (voteCount / total) * ratingValue + (medianVotes / total) * meanRating,
    }
  })
}

export const mapCatalogRow = (
  [
    tmdbId,
    title,
    year,
    rating10,
    genres,
    country,
    poster,
    backdrop,
    colour,
    voteCount,
    popularity10,
    runtime,
  ]: CatalogRow,
  textIndex: number,
  rank: number,
  tables: CatalogTables,
): TestMovie => {
  const rating = rating10 > 0 ? rating10 / 10 : null
  return {
    id: `c${tmdbId}`,
    rank,
    title,
    titleKey: toTitleKey(title),
    tagline: '',
    overview: '',
    genres: genres
      .map((genre) => tables.genres[genre])
      .filter((genre): genre is string => Boolean(genre)),
    year: year ? String(year) : '----',
    runtime: '',
    runtimeMinutes: runtime > 0 ? runtime : null,
    rating: rating ? rating.toFixed(1) : '',
    ratingValue: rating,
    voteCount,
    popularity: popularity10 / 10,
    weightedRating: null,
    countries: tables.countries[country] ?? '',
    posterUrl: `${TMDB_IMAGE_URL}/w154/${poster}.jpg`,
    posterDetailUrl: `${TMDB_IMAGE_URL}/w342/${poster}.jpg`,
    posterListUrl: `${TMDB_IMAGE_URL}/w92/${poster}.jpg`,
    posterPath: poster,
    backdropPath: backdrop || null,
    placeholderColor: colour ? `#${colour}` : undefined,
    textIndex,
  }
}

// The blurred card backdrop is a CSS image, which is fetched without CORS. A
// response cached from such a request carries no CORS headers, so the same URL
// then fails for WebGL and for the CORS-enabled index tiles (blank posters).
// It therefore uses a catalogue size nothing else requests.
export const POSTER_BACKDROP_SIZE = 'w185'
export const posterBackdropUrl = (
  movie: Pick<TestMovie, 'posterUrl' | 'posterDetailUrl'>,
) =>
  movie.posterDetailUrl
    ? movie.posterUrl.replace('/w154/', `/${POSTER_BACKDROP_SIZE}/`)
    : movie.posterUrl

export type DeviceSignals = {
  coarsePointer: boolean
  narrowViewport: boolean
  memoryGb?: number
  cores?: number
}

export const isLightweightDevice = ({
  coarsePointer,
  narrowViewport,
  memoryGb,
  cores,
}: DeviceSignals) =>
  (coarsePointer && narrowViewport) ||
  (memoryGb !== undefined && memoryGb <= 4) ||
  (cores !== undefined && cores <= 4)

let lightweightDevice: boolean | null = null
// Decided once, so rotating a phone or resizing a window never changes what
// is loaded.
export const detectLightweightDevice = () => {
  lightweightDevice ??= isLightweightDevice({
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    narrowViewport: window.matchMedia('(max-width: 900px)').matches,
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    cores: navigator.hardwareConcurrency,
  })
  return lightweightDevice
}

export const prefersSavedData = () =>
  Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData,
  )

// How many chunks to load: everything, or on a lightweight device that has
// not been asked for more, the most-voted 20,000 films.
export const getCatalogChunkCount = (
  manifest: Pick<CatalogManifestV2, 'chunks'> &
    Partial<Pick<CatalogManifestV2, 'chunkSize'>>,
  lightweight: boolean,
  full: boolean,
) => {
  if (!lightweight || full) return manifest.chunks.length
  const chunkSize = manifest.chunkSize || DEFAULT_CHUNK_SIZE
  return Math.min(
    manifest.chunks.length,
    Math.max(1, Math.ceil(LIGHTWEIGHT_FILM_TARGET / chunkSize)),
  )
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Catalogue ${response.status} (${url})`)
  return response.json() as Promise<T>
}

let manifestPromise: Promise<CatalogManifestV2> | null = null
export const loadCatalogManifest = () => {
  manifestPromise ??= fetchJson<CatalogManifestV2>(
    `${CATALOG_URL}/manifest.json`,
  ).catch((error: unknown) => {
    manifestPromise = null
    throw error
  })
  return manifestPromise
}

const chunkRequests = new Map<number, Promise<CatalogRow[]>>()
const loadChunk = (manifest: CatalogManifestV2, chunk: number) => {
  let request = chunkRequests.get(chunk)
  if (!request) {
    request = fetchJson<CatalogRow[]>(
      `${CATALOG_URL}/${manifest.chunks[chunk]}`,
    )
    chunkRequests.set(chunk, request)
    request.catch(() => chunkRequests.delete(chunk))
  }
  return request
}

const mapChunks = (
  manifest: CatalogManifestV2,
  chunks: CatalogRow[][],
): TestMovie[] => {
  const movies: TestMovie[] = []
  const chunkSize = manifest.chunkSize || DEFAULT_CHUNK_SIZE
  chunks.forEach((rows, chunk) => {
    rows.forEach((row, offset) => {
      const index = chunk * chunkSize + offset
      movies.push(mapCatalogRow(row, index, index + 1, manifest))
    })
  })
  return withWeightedRatings(movies)
}

let cachedFirstChunk: TestMovie[] | null = null
let firstChunkPromise: Promise<TestMovie[]> | null = null
export const getCachedFirstChunk = () => cachedFirstChunk

// The manifest and chunk 0: the 2,000 most-voted films, enough for the globe
// (it shows the top 900) and the first screen of everything else.
export const loadFirstChunk = () => {
  if (cachedFirstChunk) return Promise.resolve(cachedFirstChunk)
  firstChunkPromise ??= loadCatalogManifest()
    .then(async (manifest) => {
      const rows = await loadChunk(manifest, 0)
      cachedFirstChunk = mapChunks(manifest, [rows])
      return cachedFirstChunk
    })
    .catch((error: unknown) => {
      firstChunkPromise = null
      throw error
    })
  return firstChunkPromise
}

// What has been assembled so far, and how many chunks it spans.
let cachedAll: { chunkCount: number; movies: TestMovie[] } | null = null
const allRequests = new Map<number, Promise<TestMovie[]>>()
export const getCachedAllMovies = () => cachedAll?.movies ?? null

// Loaded after the globe is up. Films keep their ranks (the position in the
// vote-ordered catalogue), so the default globe window never changes when
// more arrive. Weighted ratings are relative to the whole set, so they are
// worked out again over everything loaded.
export const loadAllMovies = ({
  lightweight,
  full,
}: {
  lightweight: boolean
  full: boolean
}): Promise<TestMovie[]> =>
  loadCatalogManifest().then((manifest) => {
    const chunkCount = getCatalogChunkCount(manifest, lightweight, full)
    if (cachedAll && cachedAll.chunkCount >= chunkCount) {
      return cachedAll.movies
    }
    let request = allRequests.get(chunkCount)
    if (!request) {
      request = Promise.all(
        Array.from({ length: chunkCount }, (_, chunk) =>
          loadChunk(manifest, chunk),
        ),
      ).then((chunks) => {
        const movies = mapChunks(manifest, chunks)
        if (!cachedAll || cachedAll.chunkCount < chunkCount) {
          cachedAll = { chunkCount, movies }
        }
        return movies
      })
      allRequests.set(chunkCount, request)
      request.catch(() => allRequests.delete(chunkCount))
    }
    return request
  })

// Text rows: [overview, tagline, imdbId].
type TextRow = [string, string, string?]
const textChunkRequests = new Map<number, Promise<TextRow[]>>()
const loadedTextChunks = new Map<number, TextRow[]>()
let knownTextChunkSize = 0

const textFromRow = (row: TextRow | undefined): MovieText => ({
  overview: row?.[0] ?? '',
  tagline: row?.[1] ?? '',
  imdbId: row?.[2] ?? '',
})

export const getCachedMovieText = (movie: TestMovie): MovieText | null => {
  if (movie.textIndex === undefined) return movie
  if (!knownTextChunkSize) return null
  const chunk = Math.floor(movie.textIndex / knownTextChunkSize)
  const rows = loadedTextChunks.get(chunk)
  if (!rows) return null
  return textFromRow(rows[movie.textIndex - chunk * knownTextChunkSize])
}

// A film's overview, tagline and IMDb id, fetched when it is shown.
export const loadMovieText = async (movie: TestMovie): Promise<MovieText> => {
  const cached = getCachedMovieText(movie)
  if (cached || movie.textIndex === undefined) return cached ?? movie
  const manifest = await loadCatalogManifest()
  const { textChunkSize } = manifest
  knownTextChunkSize = textChunkSize
  const chunk = Math.floor(movie.textIndex / textChunkSize)
  let request = textChunkRequests.get(chunk)
  if (!request) {
    request = fetchJson<TextRow[]>(`${CATALOG_URL}/${manifest.texts[chunk]}`)
    textChunkRequests.set(chunk, request)
    request.then(
      (rows) => loadedTextChunks.set(chunk, rows),
      () => textChunkRequests.delete(chunk),
    )
  }
  return textFromRow((await request)[movie.textIndex - chunk * textChunkSize])
}
