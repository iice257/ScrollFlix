import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Dices,
  Info,
  Maximize2,
  Minimize2,
  Moon,
  Play,
  Search,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react'
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useMediaQuery } from '../../../hooks/use-media-query'
import { cn } from '../../../utils/tw'
import {
  InfiniteMovieMenu,
  type InfiniteMovieMenuItem,
} from './infinite-movie-menu'

type RawMovie = Record<string, unknown>

type PosterAvailability = {
  ids?: unknown[]
}

type TestMovie = {
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
  countries: string
  posterUrl: string
  // Catalogue films (beyond the local set) use TMDB-hosted posters: a larger
  // one for the details card, and an average colour while they load.
  posterDetailUrl?: string
  placeholderColor?: string
  // Position in the catalogue's lazily loaded overview/tagline chunks.
  textIndex?: number
}

type ViewMode = 'wall' | 'list' | 'genres'
type ListGrouping = 'year' | 'alpha' | 'rating'
type LoadState = 'loading' | 'ready' | 'error'
type ContentFilter = 'all' | 'movies' | 'series'
type RuntimeFilter =
  | 'movie30to60'
  | 'movie90to120'
  | 'movie150to180'
  | 'movie210plus'
  | 'seriesUnder25'
  | 'series40plus'
  | 'seriesSingleSeason'
  | 'seriesBinge'
  | 'seriesLong'
  | 'seriesLongRun'
type MoodFilter = 'fast' | 'dark' | 'funny' | 'romantic' | 'weird' | 'highRated'
type GenreSummary = {
  count: number
  genre: string
}
type DecisionFilterResult = {
  broadened: boolean
  movies: TestMovie[]
  strictCount: number
}
type PosterLoadState = 'loading' | 'loaded' | 'error'
type MotionPhase = 'enter' | 'exit'

const DATASET_FILE_COUNT = 5
const CATALOG_URL = '/json/catalog'
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p'
const GALLERY_WINDOW_SIZE = 900
const LEGACY_LOCAL_POSTER_COUNT = 216
const MIN_DECISION_FILTER_RESULTS = 24
const DETAILS_EXPAND_DRAG_PX = 42
const DETAILS_CLOSE_DRAG_PX = 68
const DETAILS_COMPACT_DRAG_PX = 38
const EXIT_ANIMATION_MS = 220
const SPIN_HINT_STORAGE_KEY = 'wtw:spin-hint-seen'
const THEME_STORAGE_KEY = 'wtw:theme'

type Theme = 'dark' | 'light'

const readTheme = (): Theme => {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light'
      ? 'light'
      : 'dark'
  } catch {
    return 'dark'
  }
}

const readSpinHintSeen = () => {
  try {
    return window.localStorage.getItem(SPIN_HINT_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
const CONTENT_FILTERS: Array<{
  disabled?: boolean
  id: ContentFilter
  label: string
  meta?: string
}> = [
  { id: 'all', label: 'All' },
  { id: 'movies', label: 'Movies' },
  { disabled: true, id: 'series', label: 'Series', meta: 'Coming soon' },
]
const MOVIE_RUNTIME_FILTERS: Array<{
  disabled?: boolean
  id: RuntimeFilter
  label: string
  test: (runtimeMinutes: number | null) => boolean
}> = [
  {
    id: 'movie30to60',
    label: '30 mins to 1 hr',
    test: (runtimeMinutes) =>
      Boolean(runtimeMinutes && runtimeMinutes >= 30 && runtimeMinutes <= 60),
  },
  {
    id: 'movie90to120',
    label: '1 hr 30 mins to 2 hrs',
    test: (runtimeMinutes) =>
      Boolean(runtimeMinutes && runtimeMinutes >= 90 && runtimeMinutes <= 120),
  },
  {
    id: 'movie150to180',
    label: '2 hr 30 mins to 3 hrs',
    test: (runtimeMinutes) =>
      Boolean(runtimeMinutes && runtimeMinutes >= 150 && runtimeMinutes <= 180),
  },
  {
    id: 'movie210plus',
    label: '3 hr 30 mins and longer',
    test: (runtimeMinutes) => Boolean(runtimeMinutes && runtimeMinutes >= 210),
  },
]
const SERIES_RUNTIME_FILTERS: Array<{
  disabled?: boolean
  id: RuntimeFilter
  label: string
  test: (runtimeMinutes: number | null) => boolean
}> = [
  {
    disabled: true,
    id: 'seriesUnder25',
    label: 'Under 25 min / ep.',
    test: () => false,
  },
  {
    disabled: true,
    id: 'series40plus',
    label: '40 min+ / ep.',
    test: () => false,
  },
  {
    disabled: true,
    id: 'seriesSingleSeason',
    label: 'Single season',
    test: () => false,
  },
  {
    disabled: true,
    id: 'seriesBinge',
    label: 'Binge (2-3 seasons)',
    test: () => false,
  },
  {
    disabled: true,
    id: 'seriesLong',
    label: 'Long series (3+ seasons)',
    test: () => false,
  },
  {
    disabled: true,
    id: 'seriesLongRun',
    label: 'Long-run episodic',
    test: () => false,
  },
]
const RUNTIME_FILTERS = [...MOVIE_RUNTIME_FILTERS, ...SERIES_RUNTIME_FILTERS]
const MOOD_FILTERS: Array<{
  genres?: string[]
  id: MoodFilter
  label: string
  test?: (movie: TestMovie) => boolean
}> = [
  {
    genres: ['Action', 'Adventure', 'Thriller'],
    id: 'fast',
    label: 'Fast',
  },
  {
    genres: ['Crime', 'Horror', 'Mystery', 'Thriller', 'War'],
    id: 'dark',
    label: 'Dark',
  },
  {
    genres: ['Animation', 'Comedy', 'Family'],
    id: 'funny',
    label: 'Funny',
  },
  {
    genres: ['Romance'],
    id: 'romantic',
    label: 'Romantic',
  },
  {
    genres: ['Fantasy', 'Horror', 'Science Fiction'],
    id: 'weird',
    label: 'Weird',
  },
  {
    id: 'highRated',
    label: 'High-rated',
    test: (movie) => Boolean(movie.ratingValue && movie.ratingValue >= 7.5),
  },
]

const getText = (raw: RawMovie, key: string) => {
  const value = raw[key]
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

const getPositiveNumber = (raw: RawMovie, key: string) => {
  const value = Number(raw[key])
  return Number.isFinite(value) && value > 0 ? value : null
}

const splitList = (value: string, maxItems = Number.POSITIVE_INFINITY) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)

const seededRandom = (seed: number) => {
  const value = Math.sin(seed * 9301 + 49297) * 233280
  return value - Math.floor(value)
}

const getYearNumber = (movie: TestMovie) => {
  const year = Number(movie.year)
  return Number.isFinite(year) ? year : 0
}

const formatRuntime = (runtime: string, runtimeMinutes: number | null) => {
  if (runtimeMinutes) {
    const hours = Math.floor(runtimeMinutes / 60)
    const minutes = runtimeMinutes % 60
    return `${hours}:${String(minutes).padStart(2, '0')}`
  }

  const value = runtime.trim()
  if (!value || value === '0' || value === '0:00' || value === '0m') {
    return '-'
  }
  return value
}

const formatRuntimeLabel = (movie: TestMovie) => {
  if (movie.runtimeMinutes) {
    const hours = Math.floor(movie.runtimeMinutes / 60)
    const minutes = movie.runtimeMinutes % 60
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`
  }
  const runtime = formatRuntime(movie.runtime, movie.runtimeMinutes)
  return runtime === '-' ? null : runtime
}

const formatCompactMeta = (movie: TestMovie) =>
  [
    movie.year && movie.year !== '----' ? movie.year : null,
    movie.ratingValue ? `★ ${movie.rating}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

export const formatMovieMeta = (movie: TestMovie) =>
  `Year: ${movie.year && movie.year !== '----' ? movie.year : '-'} | Rating: ${
    movie.ratingValue ? movie.rating : '-'
  } | Hour: ${formatRuntime(movie.runtime, movie.runtimeMinutes)}`

const hasLatinLeadingTitle = (movie: TestMovie) =>
  /^[A-Za-z]/.test(movie.title.trim())

type MoviePosterProps = {
  movie: TestMovie
  loading?: 'eager' | 'lazy'
  size?: 'thumb' | 'detail'
}

const MoviePoster = ({
  movie,
  loading = 'lazy',
  size = 'thumb',
}: MoviePosterProps) => {
  const [loadState, setLoadState] = useState<PosterLoadState>('loading')

  return (
    <span
      className='warp-poster-frame'
      data-poster-state={loadState}
      style={
        movie.placeholderColor && loadState !== 'loaded'
          ? { backgroundColor: movie.placeholderColor }
          : undefined
      }
    >
      <img
        src={
          size === 'detail'
            ? (movie.posterDetailUrl ?? movie.posterUrl)
            : movie.posterUrl
        }
        alt=''
        // TMDB only sends CORS headers when asked and does not vary on it, so
        // a plain request would cache a copy the globe's WebGL cannot use.
        crossOrigin={movie.posterDetailUrl ? 'anonymous' : undefined}
        loading={loading}
        onError={() => setLoadState('error')}
        onLoad={() => setLoadState('loaded')}
      />
    </span>
  )
}

const useExitPresence = <T,>(
  isOpen: boolean,
  value: T | null = null,
  exitMs = EXIT_ANIMATION_MS,
) => {
  const [isPresent, setIsPresent] = useState(isOpen)
  const [motionPhase, setMotionPhase] = useState<MotionPhase>(
    isOpen ? 'enter' : 'exit',
  )
  const [presentValue, setPresentValue] = useState<T | null>(value)

  useEffect(() => {
    if (isOpen) {
      if (value !== null) setPresentValue(value)
      setIsPresent(true)
      setMotionPhase('enter')
      return
    }

    if (!isPresent) return

    setMotionPhase('exit')
    const timer = window.setTimeout(() => {
      setIsPresent(false)
      setPresentValue(null)
    }, exitMs)

    return () => window.clearTimeout(timer)
  }, [exitMs, isOpen, isPresent, value])

  return { isPresent, motionPhase, value: presentValue }
}

export const getGenreOverlap = (movie: TestMovie, selectedGenres: string[]) => {
  if (!selectedGenres.length) return 0
  const movieGenres = new Set(movie.genres)
  return selectedGenres.filter((genre) => movieGenres.has(genre)).length
}

export const filterMoviesByGenres = (
  movies: TestMovie[],
  selectedGenres: string[],
) => {
  if (!selectedGenres.length) return movies
  return movies.filter((movie) => getGenreOverlap(movie, selectedGenres) > 0)
}

export const filterMoviesByTitleSearch = (
  movies: TestMovie[],
  searchQuery: string,
) => {
  const query = searchQuery.trim().toLocaleLowerCase()
  if (!query) return movies

  return movies.filter((movie) =>
    movie.title.toLocaleLowerCase().includes(query),
  )
}

const movieHasAnyGenre = (movie: TestMovie, genres: string[]) => {
  const movieGenres = new Set(movie.genres)
  return genres.some((genre) => movieGenres.has(genre))
}

const matchesRuntimeFilter = (
  movie: TestMovie,
  runtimeFilter: RuntimeFilter | null,
) => {
  if (!runtimeFilter) return true
  return (
    RUNTIME_FILTERS.find((filter) => filter.id === runtimeFilter)?.test(
      movie.runtimeMinutes,
    ) ?? true
  )
}

const matchesAnyMoodFilter = (
  movie: TestMovie,
  selectedMoodFilters: MoodFilter[],
) => {
  if (!selectedMoodFilters.length) return true

  return selectedMoodFilters.some((filterId) => {
    const filter = MOOD_FILTERS.find((item) => item.id === filterId)
    if (!filter) return false
    if (filter.test?.(movie)) return true
    return filter.genres ? movieHasAnyGenre(movie, filter.genres) : false
  })
}

const matchesAnyDecisionFilter = (
  movie: TestMovie,
  selectedMoodFilters: MoodFilter[],
  runtimeFilter: RuntimeFilter | null,
) =>
  (runtimeFilter ? matchesRuntimeFilter(movie, runtimeFilter) : false) ||
  (selectedMoodFilters.length
    ? matchesAnyMoodFilter(movie, selectedMoodFilters)
    : false)

export const filterMoviesByDecisionFilters = (
  movies: TestMovie[],
  selectedMoodFilters: MoodFilter[],
  runtimeFilter: RuntimeFilter | null,
): DecisionFilterResult => {
  const hasFilters = Boolean(selectedMoodFilters.length || runtimeFilter)
  if (!hasFilters) {
    return { broadened: false, movies, strictCount: movies.length }
  }

  const strictMovies = movies.filter(
    (movie) =>
      matchesRuntimeFilter(movie, runtimeFilter) &&
      matchesAnyMoodFilter(movie, selectedMoodFilters),
  )

  if (strictMovies.length >= MIN_DECISION_FILTER_RESULTS) {
    return {
      broadened: false,
      movies: strictMovies,
      strictCount: strictMovies.length,
    }
  }

  const broadenedMovies = movies.filter((movie) =>
    matchesAnyDecisionFilter(movie, selectedMoodFilters, runtimeFilter),
  )

  return {
    broadened: broadenedMovies.length > strictMovies.length,
    movies: broadenedMovies.length ? broadenedMovies : strictMovies,
    strictCount: strictMovies.length,
  }
}

export const getGalleryWindow = (
  movies: TestMovie[],
  selectedGenres: string[],
  limit = GALLERY_WINDOW_SIZE,
) =>
  [...movies]
    .map((movie, index) => ({
      movie,
      overlap: getGenreOverlap(movie, selectedGenres),
      sort: seededRandom(index + movie.rank + selectedGenres.length * 97),
    }))
    .sort(
      (a, b) =>
        b.overlap - a.overlap || a.movie.rank - b.movie.rank || a.sort - b.sort,
    )
    .slice(0, limit)
    .map(({ movie }) => movie)

// Rank follows the dataset's vote order, so it stands in for popularity: a
// well-known 7.8 should beat an obscure 9.5 rated by a handful of people.
const similarityScore = (movie: TestMovie) =>
  (movie.ratingValue ?? 0) - movie.rank / 2500

// One pass over the catalogue, keeping only the best few, so it stays cheap
// with tens of thousands of films.
export const getSimilarMovies = (
  movie: TestMovie,
  movies: TestMovie[],
  limit = 6,
) => {
  const currentGenres = new Set(movie.genres)
  const best: Array<{ movie: TestMovie; overlap: number; score: number }> = []
  const isBetter = (
    a: { overlap: number; score: number },
    b: { overlap: number; score: number },
  ) => a.overlap > b.overlap || (a.overlap === b.overlap && a.score > b.score)

  for (const candidate of movies) {
    if (candidate.id === movie.id) continue
    let overlap = 0
    for (const genre of candidate.genres) {
      if (currentGenres.has(genre)) overlap += 1
    }
    if (!overlap) continue
    const entry = {
      movie: candidate,
      overlap,
      score: similarityScore(candidate),
    }
    if (best.length === limit && !isBetter(entry, best[limit - 1])) continue
    let position = best.length
    while (position > 0 && isBetter(entry, best[position - 1])) position -= 1
    best.splice(position, 0, entry)
    if (best.length > limit) best.pop()
  }
  return best.map((entry) => entry.movie)
}

export type SortDirection = 'asc' | 'desc'
// A rule without a direction is "pending": picked in the sort panel but not
// applied until the viewer chooses ascending or descending.
export type SortRule = { key: ListGrouping; direction: SortDirection | null }

export const DEFAULT_SORT_DIRECTION: Record<ListGrouping, SortDirection> = {
  alpha: 'asc',
  rating: 'desc',
  year: 'asc',
}

const compareMoviesByKey = (
  movieA: TestMovie,
  movieB: TestMovie,
  key: ListGrouping,
) => {
  if (key === 'alpha') return movieA.title.localeCompare(movieB.title)
  if (key === 'rating')
    return (movieA.ratingValue ?? -1) - (movieB.ratingValue ?? -1)
  return getYearNumber(movieA) - getYearNumber(movieB)
}

export const getActiveSortRules = (rules: SortRule[]) => {
  const active = rules.filter(
    (rule): rule is { key: ListGrouping; direction: SortDirection } =>
      rule.direction !== null,
  )
  return active.length
    ? active
    : [{ key: 'year' as const, direction: 'asc' as const }]
}

export const sortMoviesByRules = (movies: TestMovie[], rules: SortRule[]) => {
  const active = getActiveSortRules(rules)
  // Grouping by initial letter only lists titles that start with a letter.
  const sortableMovies =
    active[0].key === 'alpha' ? movies.filter(hasLatinLeadingTitle) : movies

  return [...sortableMovies].sort((movieA, movieB) => {
    for (const rule of active) {
      const order = compareMoviesByKey(movieA, movieB, rule.key)
      if (order) return rule.direction === 'desc' ? -order : order
    }
    return movieA.title.localeCompare(movieB.title)
  })
}

export const sortMoviesForList = (
  movies: TestMovie[],
  grouping: ListGrouping,
) =>
  sortMoviesByRules(movies, [
    { key: grouping, direction: DEFAULT_SORT_DIRECTION[grouping] },
  ])

// Ticking a key adds it as the next (pending) rule; unticking removes it.
// The last rule stays, and a pending rule promoted to first gets a default.
export const applySortToggle = (rules: SortRule[], key: ListGrouping) => {
  if (!rules.some((rule) => rule.key === key))
    return [...rules, { key, direction: null }]
  if (rules.length === 1) return rules
  return rules
    .filter((rule) => rule.key !== key)
    .map((rule, index) =>
      index === 0 && !rule.direction
        ? { ...rule, direction: DEFAULT_SORT_DIRECTION[rule.key] }
        : rule,
    )
}

// Choosing a direction sets it, adding the key in one click if needed.
export const applySortDirection = (
  rules: SortRule[],
  key: ListGrouping,
  direction: SortDirection,
) =>
  rules.some((rule) => rule.key === key)
    ? rules.map((rule) => (rule.key === key ? { ...rule, direction } : rule))
    : [...rules, { key, direction }]

// Appends in place: copying each group per film is quadratic at catalogue size.
const groupMoviesBy = (
  movies: TestMovie[],
  getKey: (movie: TestMovie) => string,
) =>
  movies.reduce<Record<string, TestMovie[]>>((groups, movie) => {
    const key = getKey(movie)
    const group = groups[key]
    if (group) group.push(movie)
    else groups[key] = [movie]
    return groups
  }, {})

export const groupMoviesByYear = (movies: TestMovie[]) =>
  groupMoviesBy(movies, (movie) => movie.year || '----')

export const groupMoviesAlphabetically = (movies: TestMovie[]) =>
  groupMoviesBy(movies, (movie) => {
    const letter = movie.title.charAt(0).toUpperCase() || '#'
    return /[A-Z]/.test(letter) ? letter : '#'
  })

const UNRATED_GROUP = 'Unrated'

const getRatingGroupKey = (movie: TestMovie) => {
  if (!movie.ratingValue) return UNRATED_GROUP
  const band = Math.floor(movie.ratingValue)
  return band >= 10 ? '10' : `${band}+`
}

export const groupMoviesByRating = (movies: TestMovie[]) =>
  groupMoviesBy(movies, getRatingGroupKey)

// Highest band first; "Unrated" (NaN) always last.
const compareRatingGroups = (groupA: string, groupB: string) =>
  (Number.parseFloat(groupB) || -1) - (Number.parseFloat(groupA) || -1)

const SORT_OPTIONS: Array<{
  key: ListGrouping
  label: string
  asc: string
  desc: string
}> = [
  { key: 'year', label: 'Year', asc: 'Oldest first', desc: 'Newest first' },
  { key: 'alpha', label: 'A–Z', asc: 'A to Z', desc: 'Z to A' },
  {
    key: 'rating',
    label: 'Rating',
    asc: 'Lowest first',
    desc: 'Highest first',
  },
]
const SORT_LABELS = Object.fromEntries(
  SORT_OPTIONS.map((option) => [option.key, option.label]),
) as Record<ListGrouping, string>

const getMovieListGroupKey = (movie: TestMovie, grouping: ListGrouping) => {
  if (grouping === 'rating') return getRatingGroupKey(movie)
  if (grouping === 'alpha') {
    const letter = movie.title.charAt(0).toUpperCase() || '#'
    return /[A-Z]/.test(letter) ? letter : '#'
  }

  return movie.year || '----'
}

const getGenreSummaries = (movies: TestMovie[]): GenreSummary[] => {
  const counts = movies.reduce<Record<string, number>>((summary, movie) => {
    movie.genres.forEach((genre) => {
      summary[genre] = (summary[genre] ?? 0) + 1
    })
    return summary
  }, {})

  return Object.entries(counts)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
}

export const resolveMoviePosterUrls = (
  movieId: string,
  catalogIndex: number,
  localPosterIds: ReadonlySet<string>,
) => {
  const posterUrl = localPosterIds.has(movieId)
    ? `/media/posters/${encodeURIComponent(movieId)}.jpg`
    : catalogIndex < LEGACY_LOCAL_POSTER_COUNT
      ? `/media/single/${catalogIndex}.jpg`
      : ''
  return { posterUrl }
}

const mapMovie = (
  raw: RawMovie,
  index: number,
  localPosterIds: ReadonlySet<string>,
): TestMovie => {
  const rating = getPositiveNumber(raw, 'vote_average')
  const runtimeMinutes = getPositiveNumber(raw, 'runtime_minutes')
  const year = getText(raw, 'release_year') || '----'
  const rawId = getText(raw, 'id')
  const title = getText(raw, 'title') || `Untitled ${index + 1}`
  const posterUrls = resolveMoviePosterUrls(rawId, index, localPosterIds)

  return {
    id: rawId ? `${index}-${rawId}` : String(index),
    rank: index + 1,
    title,
    tagline: getText(raw, 'tagline'),
    overview: getText(raw, 'overview'),
    genres: splitList(getText(raw, 'genres')),
    year,
    runtime: getText(raw, 'time_str') || '',
    runtimeMinutes,
    rating: rating ? rating.toFixed(1) : '',
    ratingValue: rating,
    countries: splitList(getText(raw, 'production_countries'), 1).join(', '),
    ...posterUrls,
  }
}

let cachedMovieDataset: TestMovie[] | null = null
let movieDatasetPromise: Promise<TestMovie[]> | null = null

const loadMovieDataset = () => {
  if (cachedMovieDataset) return Promise.resolve(cachedMovieDataset)

  const datasetRequest = Promise.all(
    Array.from({ length: DATASET_FILE_COUNT }, (_, index) =>
      fetch(`/json/${index}.json`).then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load movie data (${response.status})`)
        }
        return response.json() as Promise<RawMovie[]>
      }),
    ),
  )
  const posterManifestRequest = fetch('/media/posters/availability.json')
    .then(async (response) => {
      if (!response.ok) return new Set<string>()
      const availability = (await response.json()) as PosterAvailability
      return new Set(
        (availability.ids ?? [])
          .map((id) => String(id ?? '').trim())
          .filter(Boolean),
      )
    })
    .catch(() => new Set<string>())

  movieDatasetPromise ??= Promise.all([datasetRequest, posterManifestRequest])
    .then(([datasets, localPosterIds]) => {
      cachedMovieDataset = datasets
        .flat()
        .map((raw, index) => mapMovie(raw, index, localPosterIds))
        .filter((movie) => Boolean(movie.posterUrl))
      return cachedMovieDataset
    })
    .catch((error: unknown) => {
      movieDatasetPromise = null
      throw error
    })

  return movieDatasetPromise
}

// The wider catalogue (scripts/build-catalog.mjs): compact rows of
// [tmdbId, title, year, rating x10, genre indices, country index, poster path,
// colour], with the genre and country names in the manifest.
export type CatalogRow = [
  number,
  string,
  number,
  number,
  number[],
  number,
  string,
  string,
]
export type CatalogTables = { countries: string[]; genres: string[] }
type CatalogManifest = CatalogTables & {
  chunks: string[]
  count: number
  textChunkSize: number
}

export const mapCatalogRow = (
  [tmdbId, title, year, rating10, genres, country, poster, colour]: CatalogRow,
  textIndex: number,
  rank: number,
  tables: CatalogTables,
): TestMovie => {
  const rating = rating10 > 0 ? rating10 / 10 : null
  return {
    id: `c${tmdbId}`,
    rank,
    title,
    tagline: '',
    overview: '',
    genres: genres
      .map((genre) => tables.genres[genre])
      .filter((genre): genre is string => Boolean(genre)),
    year: year ? String(year) : '----',
    runtime: '',
    runtimeMinutes: null,
    rating: rating ? rating.toFixed(1) : '',
    ratingValue: rating,
    countries: tables.countries[country] ?? '',
    posterUrl: `${TMDB_IMAGE_URL}/w154/${poster}.jpg`,
    posterDetailUrl: `${TMDB_IMAGE_URL}/w342/${poster}.jpg`,
    placeholderColor: `#${colour}`,
    textIndex,
  }
}

const prefersSavedData = () =>
  Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData,
  )

let catalogManifestPromise: Promise<CatalogManifest> | null = null
const loadCatalogManifest = () => {
  catalogManifestPromise ??= fetch(`${CATALOG_URL}/manifest.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`Catalogue ${response.status}`)
      return response.json() as Promise<CatalogManifest>
    })
    .catch((error: unknown) => {
      catalogManifestPromise = null
      throw error
    })
  return catalogManifestPromise
}

let cachedCatalogMovies: TestMovie[] | null = null
let catalogMoviesPromise: Promise<TestMovie[]> | null = null

// Loaded after the globe is up; the local films keep their ranks and the
// catalogue follows them, so the default globe window never changes.
const loadCatalogMovies = (rankOffset: number) => {
  if (cachedCatalogMovies) return Promise.resolve(cachedCatalogMovies)
  catalogMoviesPromise ??= loadCatalogManifest()
    .then(async (manifest) => {
      const chunks = await Promise.all(
        manifest.chunks.map((chunk) =>
          fetch(`${CATALOG_URL}/${chunk}`).then((response) => {
            if (!response.ok) throw new Error(`Catalogue ${response.status}`)
            return response.json() as Promise<CatalogRow[]>
          }),
        ),
      )
      cachedCatalogMovies = chunks
        .flat()
        .map((row, index) =>
          mapCatalogRow(row, index, rankOffset + index + 1, manifest),
        )
      return cachedCatalogMovies
    })
    .catch((error: unknown) => {
      catalogMoviesPromise = null
      throw error
    })
  return catalogMoviesPromise
}

type MovieText = { overview: string; tagline: string }
const movieTextChunks = new Map<number, Promise<Array<[string, string]>>>()
const loadedMovieTexts = new Map<number, Array<[string, string]>>()

let knownTextChunkSize = 0

const getCachedMovieText = (movie: TestMovie): MovieText | null => {
  if (movie.textIndex === undefined) return movie
  if (!knownTextChunkSize) return null
  const chunk = Math.floor(movie.textIndex / knownTextChunkSize)
  const rows = loadedMovieTexts.get(chunk)
  if (!rows) return null
  const [overview, tagline] = rows[
    movie.textIndex - chunk * knownTextChunkSize
  ] ?? ['', '']
  return { overview, tagline }
}

const loadMovieText = async (movie: TestMovie): Promise<MovieText> => {
  const cached = getCachedMovieText(movie)
  if (cached || movie.textIndex === undefined) return cached ?? movie
  const { textChunkSize } = await loadCatalogManifest()
  knownTextChunkSize = textChunkSize
  const chunk = Math.floor(movie.textIndex / textChunkSize)
  let request = movieTextChunks.get(chunk)
  if (!request) {
    request = fetch(`${CATALOG_URL}/text-${chunk}.json`).then((response) => {
      if (!response.ok) throw new Error(`Overview ${response.status}`)
      return response.json() as Promise<Array<[string, string]>>
    })
    movieTextChunks.set(chunk, request)
    request.then(
      (rows) => loadedMovieTexts.set(chunk, rows),
      () => movieTextChunks.delete(chunk),
    )
  }
  const [overview, tagline] =
    (await request)[movie.textIndex - chunk * textChunkSize] ?? []
  return { overview: overview ?? '', tagline: tagline ?? '' }
}

// A catalogue film's overview and tagline, fetched when it is shown.
const useMovieText = (movie: TestMovie) => {
  const [text, setText] = useState<MovieText | null>(() =>
    getCachedMovieText(movie),
  )
  useEffect(() => {
    let cancelled = false
    setText(getCachedMovieText(movie))
    loadMovieText(movie)
      .then((nextText) => {
        if (!cancelled) setText(nextText)
      })
      .catch(() => {
        if (!cancelled) setText({ overview: '', tagline: '' })
      })
    return () => {
      cancelled = true
    }
  }, [movie])
  return text
}

// Keeps the previous array when the contents are the same objects, so a
// background append never hands the globe a "new" list and rebuilds it.
const useStableList = <T,>(list: T[]) => {
  const ref = useRef(list)
  const previous = ref.current
  if (
    previous !== list &&
    (previous.length !== list.length ||
      previous.some((item, index) => item !== list[index]))
  ) {
    ref.current = list
  }
  return ref.current
}

export const TestGalleryApp = () => {
  const [movies, setMovies] = useState<TestMovie[]>(() =>
    cachedMovieDataset
      ? [...cachedMovieDataset, ...(cachedCatalogMovies ?? [])]
      : [],
  )
  const [mode, setMode] = useState<ViewMode>('wall')
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { key: 'year', direction: 'asc' },
  ])
  const [sortOpen, setSortOpen] = useState(false)
  const [listRandomNonce, setListRandomNonce] = useState(0)
  const [activeMovieId, setActiveMovieId] = useState<string | null>(
    cachedMovieDataset?.[0]?.id ?? null,
  )
  const [detailsMovieId, setDetailsMovieId] = useState<string | null>(null)
  const [watchMovieId, setWatchMovieId] = useState<string | null>(null)
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [selectedMoodFilters, setSelectedMoodFilters] = useState<MoodFilter[]>(
    [],
  )
  const [selectedRuntimeFilter, setSelectedRuntimeFilter] =
    useState<RuntimeFilter | null>(null)
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all')
  const [listSearchQuery, setListSearchQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutMaximized, setAboutMaximized] = useState(false)
  const [initialGalleryReady, setInitialGalleryReady] = useState(false)
  const [galleryLoadPercent, setGalleryLoadPercent] = useState(0)
  const [loadState, setLoadState] = useState<LoadState>(
    cachedMovieDataset ? 'ready' : 'loading',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [timeLabel, setTimeLabel] = useState('')
  const [isGlobeMoving, setIsGlobeMoving] = useState(false)
  const [theme, setTheme] = useState<Theme>(readTheme)

  const changeTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
  }, [])
  const [spinRequest, setSpinRequest] = useState<{
    itemId: string
    nonce: number
  } | null>(null)
  const [spinHintSeen, setSpinHintSeen] = useState(readSpinHintSeen)

  const markSpinHintSeen = useCallback(() => {
    setSpinHintSeen((seen) => {
      if (seen) return seen
      try {
        window.localStorage.setItem(SPIN_HINT_STORAGE_KEY, '1')
      } catch {
        // Storage can be unavailable (private mode, blocked site data).
      }
      return true
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    loadMovieDataset()
      .then((nextMovies) => {
        if (cancelled) return
        setMovies((currentMovies) =>
          currentMovies.length >= nextMovies.length
            ? currentMovies
            : nextMovies,
        )
        setActiveMovieId(
          (currentMovieId) => currentMovieId ?? nextMovies[0]?.id ?? null,
        )
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setErrorMessage(
          error instanceof Error ? error.message : 'Could not load movie data',
        )
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const updateTime = () => {
      setTimeLabel(
        new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Africa/Lagos',
        }).format(new Date()),
      )
    }
    updateTime()
    const timer = window.setInterval(updateTime, 30000)
    return () => window.clearInterval(timer)
  }, [])

  // The wider catalogue streams in once the globe is showing, so it never
  // competes with the first posters. With Save-Data on, it waits until the
  // index, genres or filters are actually opened.
  const catalogWanted = !prefersSavedData() || mode !== 'wall' || filterOpen
  useEffect(() => {
    if (!initialGalleryReady || loadState !== 'ready' || !catalogWanted) return
    let cancelled = false
    const localMovies = cachedMovieDataset ?? []
    const rankOffset = localMovies.reduce(
      (highest, movie) => Math.max(highest, movie.rank),
      0,
    )
    const timer = window.setTimeout(() => {
      loadCatalogMovies(rankOffset)
        .then((catalogMovies) => {
          if (cancelled) return
          setMovies((currentMovies) =>
            currentMovies.length > localMovies.length
              ? currentMovies
              : [...currentMovies, ...catalogMovies],
          )
        })
        .catch(() => {
          // The local films still work on their own; the catalogue is extra.
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [catalogWanted, initialGalleryReady, loadState])

  const genreSummaries = useMemo(() => getGenreSummaries(movies), [movies])

  const genreFilteredMovies = useMemo(
    () => filterMoviesByGenres(movies, selectedGenres),
    [movies, selectedGenres],
  )

  const decisionFilterResult = useMemo(
    () =>
      filterMoviesByDecisionFilters(
        genreFilteredMovies,
        selectedMoodFilters,
        selectedRuntimeFilter,
      ),
    [genreFilteredMovies, selectedMoodFilters, selectedRuntimeFilter],
  )

  const filteredMovies = decisionFilterResult.movies
  const selectedFilterCount =
    selectedGenres.length +
    selectedMoodFilters.length +
    (selectedRuntimeFilter ? 1 : 0) +
    (contentFilter !== 'all' ? 1 : 0)

  const visibleMovies = useStableList(
    useMemo(
      () => getGalleryWindow(filteredMovies, selectedGenres),
      [filteredMovies, selectedGenres],
    ),
  )

  const handleGalleryReady = useCallback(() => {
    if (loadState === 'ready' && visibleMovies.length) {
      setGalleryLoadPercent(100)
      setInitialGalleryReady(true)
    }
  }, [loadState, visibleMovies.length])

  const handleGalleryLoadProgress = useCallback((percent: number) => {
    setGalleryLoadPercent(Math.round(percent))
    if (percent >= 100) setInitialGalleryReady(true)
  }, [])

  useEffect(() => {
    if (mode !== 'wall') return
    if (
      visibleMovies.length > 0 &&
      !visibleMovies.some((movie) => movie.id === activeMovieId)
    ) {
      setActiveMovieId(visibleMovies[0].id)
    }
  }, [activeMovieId, mode, visibleMovies])

  const searchableListMovies = useMemo(
    () => filterMoviesByTitleSearch(filteredMovies, listSearchQuery),
    [filteredMovies, listSearchQuery],
  )

  const listMovies = useMemo(
    () => sortMoviesByRules(searchableListMovies, sortRules),
    [searchableListMovies, sortRules],
  )

  useEffect(() => {
    if (mode !== 'list' || !listMovies.length) return
    if (!listMovies.some((movie) => movie.id === activeMovieId)) {
      setActiveMovieId(listMovies[0].id)
    }
  }, [activeMovieId, listMovies, mode])

  const activeMovie = useMemo(
    () =>
      movies.find((movie) => movie.id === activeMovieId) ??
      visibleMovies[0] ??
      null,
    [activeMovieId, movies, visibleMovies],
  )

  const detailsMovie = useMemo(
    () => movies.find((movie) => movie.id === detailsMovieId) ?? null,
    [detailsMovieId, movies],
  )

  const watchMovie = useMemo(
    () => movies.find((movie) => movie.id === watchMovieId) ?? null,
    [movies, watchMovieId],
  )
  const filterPresence = useExitPresence(filterOpen)
  const aboutPresence = useExitPresence(aboutOpen)
  const sortPresence = useExitPresence(sortOpen && mode === 'list')
  const watchPresence = useExitPresence(Boolean(watchMovie), watchMovie)
  const detailsPresence = useExitPresence(Boolean(detailsMovie), detailsMovie)

  const toggleGenre = useCallback((genre: string) => {
    setSelectedGenres((currentGenres) =>
      currentGenres.includes(genre)
        ? currentGenres.filter((currentGenre) => currentGenre !== genre)
        : [...currentGenres, genre],
    )
  }, [])

  const clearGenres = useCallback(() => setSelectedGenres([]), [])
  const clearAllFilters = useCallback(() => {
    setContentFilter('all')
    setSelectedGenres([])
    setSelectedMoodFilters([])
    setSelectedRuntimeFilter(null)
  }, [])

  const handleSelectMovie = useCallback((movie: TestMovie) => {
    setActiveMovieId(movie.id)
  }, [])

  const toggleMoodFilter = useCallback((moodFilter: MoodFilter) => {
    setSelectedMoodFilters((currentFilters) =>
      currentFilters.includes(moodFilter)
        ? currentFilters.filter((filter) => filter !== moodFilter)
        : [...currentFilters, moodFilter],
    )
  }, [])

  const toggleRuntimeFilter = useCallback((runtimeFilter: RuntimeFilter) => {
    setSelectedRuntimeFilter((currentFilter) =>
      currentFilter === runtimeFilter ? null : runtimeFilter,
    )
  }, [])

  const selectContentFilter = useCallback(
    (nextContentFilter: ContentFilter) => {
      if (nextContentFilter === 'series') return
      setContentFilter(nextContentFilter)
      setSelectedRuntimeFilter(null)
    },
    [],
  )

  const handleOpenMovie = useCallback((movie: TestMovie) => {
    setActiveMovieId(movie.id)
    setDetailsMovieId(movie.id)
    setWatchMovieId(null)
    setFilterOpen(false)
    setAboutOpen(false)
  }, [])

  const handleOpenWatchLinks = useCallback((movie: TestMovie) => {
    setActiveMovieId(movie.id)
    setWatchMovieId(movie.id)
    setAboutOpen(false)
    setFilterOpen(false)
  }, [])

  const handleShuffle = useCallback(() => {
    const candidates = visibleMovies.filter(
      (movie) => movie.id !== activeMovieId,
    )
    const movie = candidates[Math.floor(Math.random() * candidates.length)]
    if (!movie) return
    setFilterOpen(false)
    setAboutOpen(false)
    setSpinRequest({ itemId: movie.id, nonce: performance.now() })
  }, [activeMovieId, visibleMovies])

  const handlePickRandomMovie = useCallback((movie: TestMovie) => {
    setActiveMovieId(movie.id)
    setFilterOpen(false)
    setAboutOpen(false)
    setDetailsMovieId(null)
  }, [])

  useEffect(() => {
    if (
      !detailsMovieId &&
      !watchMovieId &&
      !aboutOpen &&
      !filterOpen &&
      !sortOpen
    )
      return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Close only the top-most layer: watch links, then details, then panels.
      if (watchMovieId) setWatchMovieId(null)
      else if (detailsMovieId) setDetailsMovieId(null)
      else if (aboutOpen) setAboutOpen(false)
      else if (sortOpen) setSortOpen(false)
      else setFilterOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [aboutOpen, detailsMovieId, filterOpen, sortOpen, watchMovieId])

  return (
    <main
      className='phantom-test-shell warp-shell min-h-dvh overflow-hidden bg-black text-white'
      data-details-open={detailsPresence.isPresent ? 'true' : 'false'}
      data-filter-open={filterPresence.isPresent ? 'true' : 'false'}
      data-gallery-ready={initialGalleryReady ? 'true' : 'false'}
      data-mode={mode}
      data-theme={theme}
    >
      {/* Stays mounted in other views so returning to the gallery is instant. */}
      <WarpWall
        activeMovieId={activeMovie?.id ?? null}
        isActive={mode === 'wall'}
        isDetailsOpen={Boolean(detailsMovieId)}
        loadState={loadState}
        movies={visibleMovies}
        onLoadProgress={handleGalleryLoadProgress}
        onMovingChange={setIsGlobeMoving}
        onOpenMovie={handleOpenMovie}
        onReady={handleGalleryReady}
        onSelectMovie={handleSelectMovie}
        onUserSpin={markSpinHintSeen}
        spinRequest={spinRequest}
      />

      {mode === 'list' ? (
        <WarpList
          activeMovieId={activeMovie?.id ?? null}
          errorMessage={errorMessage}
          grouping={getActiveSortRules(sortRules)[0].key}
          groupDirection={getActiveSortRules(sortRules)[0].direction}
          loadState={loadState}
          movies={listMovies}
          randomRequest={listRandomNonce}
          searchQuery={listSearchQuery}
          searchResultCount={searchableListMovies.length}
          totalMovieCount={movies.length}
          onOpenMovie={handleOpenMovie}
          onPickRandomMovie={handlePickRandomMovie}
          onSearchQueryChange={setListSearchQuery}
          onSelectMovie={handleSelectMovie}
        />
      ) : null}

      {mode === 'genres' ? (
        <GenresView
          genres={genreSummaries}
          resultCount={filteredMovies.length}
          selectedGenres={selectedGenres}
          onBackToGallery={() => setMode('list')}
          onClear={clearGenres}
          onToggleGenre={toggleGenre}
        />
      ) : null}

      <WarpChrome
        activeMovie={activeMovie}
        watchOpen={Boolean(watchMovieId)}
        mode={mode}
        movieCount={movies.length}
        selectedFilterCount={selectedFilterCount}
        timeLabel={timeLabel}
        onOpenActiveMovie={() => {
          if (activeMovie) handleOpenWatchLinks(activeMovie)
        }}
        onOpenGenres={() => {
          setMode('genres')
          setAboutOpen(false)
          setFilterOpen(false)
          setSortOpen(false)
        }}
        onResetGallery={() => {
          clearAllFilters()
          setDetailsMovieId(null)
          setWatchMovieId(null)
          setFilterOpen(false)
          setAboutOpen(false)
          setMode('wall')
        }}
        onModeChange={(nextMode) => {
          setAboutOpen(false)
          setFilterOpen(false)
          setSortOpen(false)
          setMode(nextMode)
        }}
        dockTop={
          mode === 'wall' ? (
            <>
              {initialGalleryReady && !spinHintSeen && !detailsMovieId ? (
                <div className='warp-spin-hint' role='note'>
                  <span className='warp-spin-hint-keys' aria-hidden='true'>
                    <kbd>↑</kbd>
                    <kbd>↓</kbd>
                  </span>
                  <span className='warp-spin-hint-pointer'>
                    Scroll or use the arrow keys to spin
                  </span>
                  <span className='warp-spin-hint-touch'>Drag to spin</span>
                  <button
                    type='button'
                    aria-label='Dismiss hint'
                    onClick={markSpinHintSeen}
                  >
                    <X aria-hidden='true' />
                  </button>
                </div>
              ) : null}
              {initialGalleryReady && activeMovie ? (
                <button
                  type='button'
                  className={cn(
                    'warp-title-card',
                    isGlobeMoving && 'is-moving',
                  )}
                  aria-label={`Open details for ${activeMovie.title}`}
                  onClick={() => handleOpenMovie(activeMovie)}
                >
                  <span className='warp-title-card-name'>
                    {activeMovie.title}
                  </span>
                  <span className='warp-title-card-meta'>
                    {formatMovieMeta(activeMovie)}
                  </span>
                </button>
              ) : null}
            </>
          ) : null
        }
        dockLead={
          mode === 'list' ? (
            <>
              <button
                type='button'
                className={cn('warp-sort-button', sortOpen && 'is-open')}
                aria-expanded={sortOpen}
                aria-label={`Sort: ${SORT_LABELS[getActiveSortRules(sortRules)[0].key]}`}
                onClick={() => {
                  setAboutOpen(false)
                  setSortOpen((isOpen) => !isOpen)
                }}
              >
                {sortOpen ? (
                  <X className='warp-sort-icon' aria-hidden='true' />
                ) : (
                  <ArrowUpDown className='warp-sort-icon' aria-hidden='true' />
                )}
                <span className='warp-sort-badge'>
                  {SORT_LABELS[getActiveSortRules(sortRules)[0].key]}
                  {getActiveSortRules(sortRules)[0].direction === 'asc' ? (
                    <ArrowUp aria-hidden='true' strokeWidth={2.8} />
                  ) : (
                    <ArrowDown aria-hidden='true' strokeWidth={2.8} />
                  )}
                  {getActiveSortRules(sortRules).length > 1 ? (
                    <small>+{getActiveSortRules(sortRules).length - 1}</small>
                  ) : null}
                </span>
              </button>
              <button
                type='button'
                className='warp-shuffle-button'
                aria-label='Jump to a random movie in the index'
                disabled={!listMovies.length}
                onClick={() => {
                  setSortOpen(false)
                  setListRandomNonce((nonce) => nonce + 1)
                }}
              >
                <Dices className='warp-shuffle-icon' aria-hidden='true' />
                <span className='warp-shuffle-label'>Shuffle</span>
              </button>
            </>
          ) : null
        }
        dockActions={
          <>
            {mode === 'wall' ? (
              <button
                type='button'
                className='warp-shuffle-button'
                aria-label='Shuffle to a random movie'
                disabled={!visibleMovies.length}
                onClick={handleShuffle}
              >
                <Dices className='warp-shuffle-icon' aria-hidden='true' />
                <span className='warp-shuffle-label'>Shuffle</span>
              </button>
            ) : null}
            {mode === 'wall' ? (
              <div
                className={cn(
                  'warp-filter-actions',
                  selectedFilterCount > 0 && 'has-clear',
                )}
              >
                {selectedFilterCount ? (
                  <button
                    type='button'
                    className='warp-filter-clear'
                    aria-label='Clear filters'
                    onClick={clearAllFilters}
                  >
                    Clear
                  </button>
                ) : null}
                <button
                  type='button'
                  className={cn('warp-filter-button', filterOpen && 'is-open')}
                  aria-expanded={filterOpen}
                  aria-label={filterOpen ? 'Close filters' : 'Open filters'}
                  onClick={() => {
                    setAboutOpen(false)
                    setFilterOpen((isOpen) => !isOpen)
                  }}
                >
                  {filterOpen ? (
                    <X className='warp-filter-icon' aria-hidden='true' />
                  ) : (
                    <SlidersHorizontal
                      className='warp-filter-icon'
                      aria-hidden='true'
                    />
                  )}
                  <span className='warp-filter-label'>
                    {filterOpen ? 'Close' : 'Filter'}
                  </span>
                  {selectedFilterCount ? (
                    <span className='warp-filter-count'>
                      {selectedFilterCount}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}
          </>
        }
      />

      <button
        type='button'
        className={cn('warp-info-button', aboutOpen && 'is-active')}
        aria-label='About ScrollFlix'
        aria-expanded={aboutOpen}
        onClick={() => {
          setAboutOpen((isOpen) => !isOpen)
          setFilterOpen(false)
        }}
      >
        <Info aria-hidden='true' />
      </button>

      {mode === 'wall' ? (
        <output
          className='warp-gallery-preloader'
          data-state={initialGalleryReady ? 'ready' : 'loading'}
          aria-hidden={initialGalleryReady ? 'true' : undefined}
          aria-live='polite'
        >
          <span>
            <strong>Building gallery</strong>
            <i>
              <b
                style={
                  {
                    '--gallery-load-percent': `${galleryLoadPercent}%`,
                  } as CSSProperties
                }
              />
            </i>
            <small>{galleryLoadPercent}%</small>
            <button
              type='button'
              className='warp-preloader-skip'
              onClick={() => setInitialGalleryReady(true)}
            >
              Skip
            </button>
            <em>Shows the globe now; posters keep sharpening as they load.</em>
          </span>
        </output>
      ) : null}

      {sortPresence.isPresent ? (
        <SortPanel
          motionPhase={sortPresence.motionPhase}
          rules={sortRules}
          onDirection={(key, direction) =>
            setSortRules((rules) => applySortDirection(rules, key, direction))
          }
          onReset={() => setSortRules([{ key: 'year', direction: 'asc' }])}
          onToggle={(key) =>
            setSortRules((rules) => applySortToggle(rules, key))
          }
        />
      ) : null}

      {filterPresence.isPresent ? (
        <FilterPanel
          broadened={decisionFilterResult.broadened}
          genres={genreSummaries}
          motionPhase={filterPresence.motionPhase}
          resultCount={filteredMovies.length}
          contentFilter={contentFilter}
          runtimeFilter={selectedRuntimeFilter}
          selectedGenres={selectedGenres}
          selectedMoodFilters={selectedMoodFilters}
          strictResultCount={decisionFilterResult.strictCount}
          onClear={clearAllFilters}
          onSelectContentFilter={selectContentFilter}
          onToggleRuntimeFilter={toggleRuntimeFilter}
          onToggleGenre={toggleGenre}
          onToggleMoodFilter={toggleMoodFilter}
        />
      ) : null}

      {aboutPresence.isPresent ? (
        <AboutDrawer
          theme={theme}
          onThemeChange={changeTheme}
          genreCount={genreSummaries.length}
          globeCount={visibleMovies.length}
          maximized={aboutMaximized}
          movieCount={movies.length}
          motionPhase={aboutPresence.motionPhase}
          onClose={() => setAboutOpen(false)}
          onToggleMaximized={() =>
            setAboutMaximized((isMaximized) => !isMaximized)
          }
        />
      ) : null}

      {watchPresence.isPresent && watchPresence.value ? (
        <WatchLinksDialog
          motionPhase={watchPresence.motionPhase}
          movie={watchPresence.value}
          onClose={() => setWatchMovieId(null)}
          onOpenAbout={() => {
            setWatchMovieId(null)
            setAboutOpen(true)
          }}
        />
      ) : null}

      {detailsPresence.isPresent && detailsPresence.value ? (
        <MovieDetailsCard
          movies={movies}
          motionPhase={detailsPresence.motionPhase}
          movie={detailsPresence.value}
          onClose={() => setDetailsMovieId(null)}
          onOpenMovie={handleOpenMovie}
          onWatch={handleOpenWatchLinks}
          onSelectGenre={(genre) => {
            setSelectedGenres([genre])
            setDetailsMovieId(null)
            setMode('wall')
          }}
        />
      ) : null}
    </main>
  )
}

type WarpWallProps = {
  activeMovieId: string | null
  isActive: boolean
  isDetailsOpen: boolean
  loadState: LoadState
  movies: TestMovie[]
  onLoadProgress: (percent: number) => void
  onMovingChange: (moving: boolean) => void
  onOpenMovie: (movie: TestMovie) => void
  onReady: () => void
  onSelectMovie: (movie: TestMovie) => void
  onUserSpin: () => void
  spinRequest: { itemId: string; nonce: number } | null
}

const WarpWall = ({
  activeMovieId,
  isActive,
  isDetailsOpen,
  loadState,
  movies,
  onLoadProgress,
  onMovingChange,
  onOpenMovie,
  onReady,
  onSelectMovie,
  onUserSpin,
  spinRequest,
}: WarpWallProps) => {
  const menuItems = useMemo<InfiniteMovieMenuItem<TestMovie>[]>(
    () =>
      movies.map((movie) => ({
        id: movie.id,
        image: movie.posterUrl,
        placeholderColor: movie.placeholderColor,
        title: movie.title,
        description:
          movie.genres.slice(0, 2).join(' | ') || movie.overview || 'Movie',
        meta: formatMovieMeta(movie),
        payload: movie,
      })),
    [movies],
  )

  const handleActiveItemChange = useCallback(
    (item: (typeof menuItems)[number]) => onSelectMovie(item.payload),
    [onSelectMovie],
  )

  const handleOpenItem = useCallback(
    (item: (typeof menuItems)[number]) => onOpenMovie(item.payload),
    [onOpenMovie],
  )

  if (loadState === 'error') {
    return (
      <section className='warp-message'>
        Movie data could not load. Refresh and try again.
      </section>
    )
  }

  return (
    <section
      className='warp-wall'
      aria-label='Warp Wall movie gallery'
      data-active={isActive}
      inert={!isActive}
    >
      <InfiniteMovieMenu
        activeId={activeMovieId}
        isActive={isActive}
        isDetailsOpen={isDetailsOpen}
        items={menuItems}
        loadState={loadState}
        onLoadProgress={onLoadProgress}
        onMovingChange={onMovingChange}
        onOpenItem={handleOpenItem}
        onReady={onReady}
        onUserSpin={onUserSpin}
        scale={0.9}
        spinRequest={spinRequest}
        onActiveItemChange={handleActiveItemChange}
      />
    </section>
  )
}

type WarpListProps = {
  activeMovieId: string | null
  errorMessage: string
  grouping: ListGrouping
  groupDirection: SortDirection
  loadState: LoadState
  movies: TestMovie[]
  // Bumped by the dock's Shuffle to pick and scroll to a random movie.
  randomRequest: number
  searchQuery: string
  searchResultCount: number
  totalMovieCount: number
  onOpenMovie: (movie: TestMovie) => void
  onPickRandomMovie: (movie: TestMovie) => void
  onSearchQueryChange: (searchQuery: string) => void
  onSelectMovie: (movie: TestMovie) => void
}

// The index can hold tens of thousands of films, so rows render in chunks as
// they near the viewport. A chunk not yet rendered keeps its estimated height
// (--warp-list-row-estimate) so the scrollbar and group heights stay right.
const LIST_CHUNK_SIZE = 40
const LIST_EAGER_ROWS = 80

const chunkRows = <T,>(rows: T[]) => {
  const chunks: T[][] = []
  for (let start = 0; start < rows.length; start += LIST_CHUNK_SIZE) {
    chunks.push(rows.slice(start, start + LIST_CHUNK_SIZE))
  }
  return chunks
}

type ListRowChunkProps<T> = {
  count: number
  eager: boolean
  forceVisible: boolean
  rows: T[]
  // Rows are only built once the chunk renders, so hovering or re-sorting
  // never creates elements for the thousands of rows still off screen.
  renderRow: (row: T) => ReactNode
}

const ListRowChunk = <T,>({
  count,
  eager,
  forceVisible,
  rows,
  renderRow,
}: ListRowChunkProps<T>) => {
  const placeholderRef = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(eager || forceVisible)
  const shouldRender = isVisible || eager || forceVisible

  useEffect(() => {
    if (shouldRender) return
    const placeholder = placeholderRef.current
    if (!placeholder || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        setIsVisible(true)
      },
      { root: placeholder.closest('.warp-list'), rootMargin: '1200px 0px' },
    )
    observer.observe(placeholder)
    return () => observer.disconnect()
  }, [shouldRender])

  if (shouldRender) return rows.map(renderRow)
  return (
    <div
      ref={placeholderRef}
      className='warp-list-chunk-placeholder'
      aria-hidden='true'
      style={{ '--chunk-row-count': count } as CSSProperties}
    />
  )
}

type ListRowProps = {
  isActive: boolean
  isCollapsed: boolean
  isRandomPulse: boolean
  movie: TestMovie
  onOpenMovie: (movie: TestMovie) => void
  onSelectMovie: (movie: TestMovie) => void
}

// Memoised so hovering a row re-renders only the rows whose state changed.
const ListRow = memo(
  ({
    isActive,
    isCollapsed,
    isRandomPulse,
    movie,
    onOpenMovie,
    onSelectMovie,
  }: ListRowProps) => (
    <button
      type='button'
      data-movie-id={movie.id}
      className={cn(
        'warp-list-row',
        isActive && 'is-active',
        isRandomPulse && 'is-random-pulse',
      )}
      tabIndex={isCollapsed ? -1 : undefined}
      onClick={() => onOpenMovie(movie)}
      onFocus={() => onSelectMovie(movie)}
      onMouseEnter={() => onSelectMovie(movie)}
    >
      <span className='warp-list-row-poster' aria-hidden='true'>
        <MoviePoster movie={movie} />
      </span>
      <span className='warp-list-row-main'>
        <span className='warp-list-row-title'>{movie.title}</span>
        <span className='warp-list-row-meta'>{formatMovieMeta(movie)}</span>
      </span>
      <span className='warp-list-row-genres'>
        {(movie.genres.length ? movie.genres : ['Movie'])
          .slice(0, 3)
          .map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
      </span>
    </button>
  ),
)
const WarpList = ({
  activeMovieId,
  errorMessage,
  grouping,
  groupDirection,
  loadState,
  movies,
  randomRequest,
  searchQuery,
  searchResultCount,
  totalMovieCount,
  onOpenMovie,
  onPickRandomMovie,
  onSearchQueryChange,
  onSelectMovie,
}: WarpListProps) => {
  const [randomPulseId, setRandomPulseId] = useState<string | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  )
  const pulseTimerRef = useRef<number | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const groupedMovies = useMemo(() => {
    const groups =
      grouping === 'alpha'
        ? groupMoviesAlphabetically(movies)
        : grouping === 'rating'
          ? groupMoviesByRating(movies)
          : groupMoviesByYear(movies)
    const sign = groupDirection === 'desc' ? -1 : 1
    return Object.entries(groups).sort(([groupA], [groupB]) => {
      if (grouping === 'rating') {
        // Bands run high to low by default; Unrated always stays last.
        if (groupA === UNRATED_GROUP || groupB === UNRATED_GROUP)
          return compareRatingGroups(groupA, groupB)
        return -sign * compareRatingGroups(groupA, groupB)
      }
      return (
        sign *
        (grouping === 'alpha'
          ? groupA.localeCompare(groupB)
          : Number(groupA) - Number(groupB))
      )
    })
  }, [groupDirection, grouping, movies])

  // The first screenful renders straight away; the rest as it scrolls near.
  const eagerChunkKeys = useMemo(() => {
    const keys = new Set<string>()
    let rows = 0
    for (const [group, groupMovies] of groupedMovies) {
      for (
        let chunk = 0;
        chunk * LIST_CHUNK_SIZE < groupMovies.length;
        chunk++
      ) {
        if (rows >= LIST_EAGER_ROWS) return keys
        keys.add(`${group}:${chunk}`)
        rows += Math.min(
          LIST_CHUNK_SIZE,
          groupMovies.length - chunk * LIST_CHUNK_SIZE,
        )
      }
    }
    return keys
  }, [groupedMovies])

  // A new primary sort key starts with every group expanded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on grouping change only
  useEffect(() => {
    setCollapsedGroups(new Set())
  }, [grouping])

  useEffect(
    () => () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!isSearchOpen) return
    searchInputRef.current?.focus()
  }, [isSearchOpen])

  const clearSearch = () => {
    setCollapsedGroups(new Set())
    onSearchQueryChange('')
    searchInputRef.current?.focus()
  }

  const handleSearchQueryChange = (nextSearchQuery: string) => {
    setCollapsedGroups(new Set())
    onSearchQueryChange(nextSearchQuery)
  }

  const toggleCollapsedGroup = (group: string) => {
    setCollapsedGroups((currentGroups) => {
      const nextGroups = new Set(currentGroups)
      if (nextGroups.has(group)) {
        nextGroups.delete(group)
      } else {
        nextGroups.add(group)
      }
      return nextGroups
    })
  }

  const handlePickRandomMovie = () => {
    const movie = movies[Math.floor(Math.random() * Math.max(movies.length, 1))]
    if (!movie) return

    const movieGroup = getMovieListGroupKey(movie, grouping)
    setCollapsedGroups((currentGroups) => {
      if (!currentGroups.has(movieGroup)) return currentGroups
      const nextGroups = new Set(currentGroups)
      nextGroups.delete(movieGroup)
      return nextGroups
    })
    onPickRandomMovie(movie)
    setRandomPulseId(movie.id)
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current)
    pulseTimerRef.current = window.setTimeout(() => {
      setRandomPulseId(null)
      pulseTimerRef.current = null
    }, 1100)

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const scroller = document.querySelector<HTMLElement>('.warp-list')
        const row = document.querySelector<HTMLElement>(
          `[data-movie-id="${movie.id}"]`,
        )
        if (!scroller || !row) return

        const startTop = scroller.scrollTop
        const maxTop = Math.max(
          0,
          scroller.scrollHeight - scroller.clientHeight,
        )
        const targetTop = Math.max(
          0,
          Math.min(
            maxTop,
            row.offsetTop - scroller.clientHeight / 2 + row.clientHeight / 2,
          ),
        )
        const duration = 520
        const startTime = performance.now()
        const animateScroll = (time: number) => {
          const progress = Math.min(1, (time - startTime) / duration)
          const eased = 1 - (1 - progress) ** 3
          scroller.scrollTop = startTop + (targetTop - startTop) * eased
          if (progress < 1) window.requestAnimationFrame(animateScroll)
        }

        window.requestAnimationFrame(animateScroll)
      })
    })
  }

  const randomRequestRef = useRef(randomRequest)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new request picks
  useEffect(() => {
    if (randomRequest === randomRequestRef.current) return
    randomRequestRef.current = randomRequest
    handlePickRandomMovie()
  }, [randomRequest])

  return (
    <section className='warp-list' aria-label='Movie list view'>
      <header className='warp-list-heading'>
        <div className='warp-list-title'>
          <h1>Movie Index</h1>
          <p>
            {loadState !== 'ready'
              ? loadState
              : searchQuery.trim()
                ? `${searchResultCount.toLocaleString()} title matches`
                : `${totalMovieCount.toLocaleString()} movies in index`}
          </p>
        </div>
        <form
          className={cn(
            'warp-list-search',
            (isSearchOpen || searchQuery) && 'is-open',
          )}
          onSubmit={(event) => event.preventDefault()}
        >
          <Search aria-hidden='true' size={15} strokeWidth={2.6} />
          <label className='sr-only' htmlFor='warp-list-search'>
            Search movie titles
          </label>
          <input
            ref={searchInputRef}
            id='warp-list-search'
            type='search'
            value={searchQuery}
            placeholder='Search titles'
            aria-label='Search movie titles'
            onChange={(event) => handleSearchQueryChange(event.target.value)}
            onFocus={() => setIsSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              if (searchQuery) {
                handleSearchQueryChange('')
                return
              }
              setIsSearchOpen(false)
            }}
          />
          {searchQuery ? (
            <button
              type='button'
              className='warp-list-search-clear'
              aria-label='Clear title search'
              onClick={clearSearch}
            >
              <X aria-hidden='true' size={14} strokeWidth={3} />
            </button>
          ) : null}
        </form>
        <div className='warp-list-tools'>
          <button
            type='button'
            className='warp-list-search-toggle'
            aria-label={
              isSearchOpen ? 'Close title search' : 'Open title search'
            }
            aria-expanded={isSearchOpen}
            onClick={() => setIsSearchOpen((isOpen) => !isOpen)}
          >
            <Search aria-hidden='true' size={17} strokeWidth={2.7} />
          </button>
        </div>
      </header>

      {loadState === 'error' ? (
        <p className='warp-list-error'>{errorMessage}</p>
      ) : null}

      {loadState === 'ready' && !movies.length ? (
        <div className='warp-list-empty'>
          <h2>No title matches</h2>
          <p>
            Try a shorter title search or clear the current filters to widen the
            index.
          </p>
          {searchQuery ? (
            <button type='button' onClick={clearSearch}>
              Clear search
            </button>
          ) : null}
        </div>
      ) : (
        <div className='warp-list-groups'>
          {groupedMovies.map(([group, groupMovies]) => {
            const isCollapsed = collapsedGroups.has(group)
            return (
              <section
                className={cn('warp-list-group', isCollapsed && 'is-collapsed')}
                key={group}
              >
                <button
                  type='button'
                  className='warp-list-group-heading'
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCollapsedGroup(group)}
                >
                  <span>
                    <h2>{group}</h2>
                    <small>
                      {groupMovies.length}{' '}
                      {groupMovies.length === 1 ? 'title' : 'titles'}
                    </small>
                  </span>
                  {isCollapsed ? (
                    <ChevronRight
                      aria-hidden='true'
                      size={18}
                      strokeWidth={2.8}
                    />
                  ) : (
                    <ChevronDown
                      aria-hidden='true'
                      size={18}
                      strokeWidth={2.8}
                    />
                  )}
                </button>
                <div
                  className='warp-list-rows'
                  aria-hidden={isCollapsed || undefined}
                  style={
                    { '--group-row-count': groupMovies.length } as CSSProperties
                  }
                >
                  {chunkRows(groupMovies).map((chunk, chunkIndex) => (
                    <ListRowChunk
                      key={chunk[0]?.id ?? chunkIndex}
                      count={chunk.length}
                      eager={eagerChunkKeys.has(`${group}:${chunkIndex}`)}
                      forceVisible={chunk.some(
                        (movie) => movie.id === randomPulseId,
                      )}
                      rows={chunk}
                      renderRow={(movie) => (
                        <ListRow
                          key={movie.id}
                          isActive={activeMovieId === movie.id}
                          isCollapsed={isCollapsed}
                          isRandomPulse={randomPulseId === movie.id}
                          movie={movie}
                          onOpenMovie={onOpenMovie}
                          onSelectMovie={onSelectMovie}
                        />
                      )}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}

type WarpChromeProps = {
  activeMovie: TestMovie | null
  watchOpen: boolean
  dockActions: ReactNode
  dockLead?: ReactNode
  dockTop: ReactNode
  mode: ViewMode
  movieCount: number
  selectedFilterCount: number
  timeLabel: string
  onOpenActiveMovie: () => void
  onOpenGenres: () => void
  onResetGallery: () => void
  onModeChange: (mode: ViewMode) => void
}

const WarpChrome = ({
  activeMovie,
  watchOpen,
  dockActions,
  dockLead,
  dockTop,
  mode,
  movieCount,
  selectedFilterCount,
  timeLabel,
  onOpenActiveMovie,
  onOpenGenres,
  onResetGallery,
  onModeChange,
}: WarpChromeProps) => (
  <>
    <header className='warp-topbar'>
      <button
        type='button'
        className='warp-mark'
        aria-label='Reset gallery'
        onClick={onResetGallery}
      >
        <span className='sr-only'>Reset gallery</span>
        <svg viewBox='0 0 64 78' aria-hidden='true'>
          <path d='M33.5 4.5c8.2 1.4 17.8 14.4 21.3 28.1 3.7 14.1-.9 30.2-9.8 35.7-2.9 1.8-5.3-3.9-8.5-2.5-4.4 2-7 7.1-10.8 5.9-3.5-1.1-3.2-7.2-6.3-8.7-4.1-2-8.9 2.7-10.4-.6C4.7 53.8 5.7 35.6 11.5 23 16.6 11.8 25.3 3.1 33.5 4.5Z' />
          <path d='M24.2 31.7c.5-4.1 3.3-7.2 7-7.7 5.2-.7 10.3 4.5 11.2 11.4' />
        </svg>
        <span className='warp-brand-name'>ScrollFlix</span>
      </button>
      <p className='warp-manifesto'>
        ScrollFlix is a movie-led discovery wall built for indecisive nights.
      </p>
      <div className='warp-clock'>
        <strong>{timeLabel || '--:--'} WAT</strong>
        <span>Lagos, NG</span>
      </div>
      <button
        type='button'
        className='warp-cta'
        disabled={!activeMovie}
        onClick={onOpenActiveMovie}
      >
        Let&apos;s Watch
      </button>
    </header>

    <div className='warp-active-peek' aria-live='polite'>
      <span>{activeMovie?.title ?? 'Loading'}</span>
      <span>
        {activeMovie
          ? `${formatMovieMeta(activeMovie)} | ${movieCount} indexed`
          : `${movieCount} loading`}
      </span>
    </div>

    <div className='warp-dock'>
      {dockTop}
      <div className='warp-dock-row'>
        <nav className='warp-mode-toggle' aria-label='View mode'>
          <button
            type='button'
            aria-label='Gallery'
            aria-pressed={mode === 'wall'}
            onClick={() => onModeChange('wall')}
          >
            <span className='warp-grid-icon' />
            <span className='warp-mode-label'>Gallery</span>
          </button>
          <button
            type='button'
            aria-label='Movie index'
            aria-pressed={mode === 'list' || mode === 'genres'}
            onClick={() => onModeChange('list')}
          >
            <span className='warp-list-icon' />
            <span className='warp-mode-label'>Index</span>
          </button>
        </nav>

        {dockLead}
        {/* Gallery: Watch opens the watch options for the current film. Index:
            Genres, which reads Back while the genres page is open. About lives
            on the i button. */}
        <nav className='warp-main-nav' aria-label='Gallery navigation'>
          {mode === 'wall' ? (
            <button
              type='button'
              className={cn(watchOpen && 'is-active')}
              aria-expanded={watchOpen}
              disabled={!activeMovie}
              onClick={onOpenActiveMovie}
            >
              Watch
            </button>
          ) : (
            <button
              type='button'
              className={cn(mode === 'genres' && 'is-active')}
              aria-pressed={mode === 'genres'}
              onClick={
                mode === 'genres' ? () => onModeChange('list') : onOpenGenres
              }
            >
              {mode === 'genres' ? 'Back' : 'Genres'}
              {mode !== 'genres' && selectedFilterCount ? (
                <span>{selectedFilterCount}</span>
              ) : null}
            </button>
          )}
        </nav>
        {dockActions}
      </div>
    </div>
  </>
)

type SortPanelProps = {
  motionPhase: MotionPhase
  rules: SortRule[]
  onDirection: (key: ListGrouping, direction: SortDirection) => void
  onReset: () => void
  onToggle: (key: ListGrouping) => void
}

const SortPanel = ({
  motionPhase,
  rules,
  onDirection,
  onReset,
  onToggle,
}: SortPanelProps) => {
  const pending = rules.find((rule) => !rule.direction)
  const isDefault =
    rules.length === 1 &&
    rules[0].key === 'year' &&
    rules[0].direction === 'asc'

  return (
    <section
      className='warp-sort-panel'
      data-motion={motionPhase}
      aria-label='Sort the index'
    >
      <header className='warp-sort-panel-heading'>
        <p>Sort</p>
        <button type='button' onClick={onReset} disabled={isDefault}>
          Reset
        </button>
      </header>
      <ul className='warp-sort-rows'>
        {SORT_OPTIONS.map((option) => {
          const position = rules.findIndex((rule) => rule.key === option.key)
          const rule = rules[position]
          const selected = position >= 0
          const isOnlyRule = selected && rules.length === 1
          return (
            <li
              key={option.key}
              className={cn(
                'warp-sort-row',
                selected && 'is-selected',
                selected && !rule.direction && 'is-pending',
              )}
            >
              <button
                type='button'
                className='warp-sort-name'
                aria-pressed={selected}
                disabled={isOnlyRule}
                onClick={() => onToggle(option.key)}
              >
                {isOnlyRule ? null : (
                  <span className='warp-sort-check' aria-hidden='true'>
                    {selected ? <Check strokeWidth={3.2} /> : null}
                  </span>
                )}
                <span className='warp-sort-label'>{option.label}</span>
                {selected && rules.length > 1 ? (
                  <span
                    className='warp-sort-order'
                    aria-label={`Sort order ${position + 1}`}
                  >
                    {position + 1}
                  </span>
                ) : null}
              </button>
              <fieldset className='warp-sort-directions'>
                <legend className='sr-only'>{`${option.label} direction`}</legend>
                {(['asc', 'desc'] as const).map((direction) => (
                  <button
                    type='button'
                    key={direction}
                    className={cn(
                      'warp-sort-direction',
                      rule?.direction === direction && 'is-active',
                    )}
                    aria-pressed={rule?.direction === direction}
                    aria-label={`${option.label}: ${option[direction]}`}
                    title={option[direction]}
                    onClick={() => onDirection(option.key, direction)}
                  >
                    {direction === 'asc' ? (
                      <ArrowUp aria-hidden='true' strokeWidth={2.6} />
                    ) : (
                      <ArrowDown aria-hidden='true' strokeWidth={2.6} />
                    )}
                  </button>
                ))}
              </fieldset>
            </li>
          )
        })}
      </ul>
      <p className='warp-sort-hint'>
        {pending
          ? `Pick a direction for ${SORT_LABELS[pending.key]} to apply it.`
          : 'The first key groups the index; tick more to break ties.'}
      </p>
    </section>
  )
}

type FilterPanelProps = {
  broadened: boolean
  contentFilter: ContentFilter
  genres: GenreSummary[]
  motionPhase: MotionPhase
  resultCount: number
  runtimeFilter: RuntimeFilter | null
  selectedGenres: string[]
  selectedMoodFilters: MoodFilter[]
  strictResultCount: number
  onClear: () => void
  onSelectContentFilter: (contentFilter: ContentFilter) => void
  onToggleRuntimeFilter: (runtimeFilter: RuntimeFilter) => void
  onToggleGenre: (genre: string) => void
  onToggleMoodFilter: (moodFilter: MoodFilter) => void
}

const FilterPanel = ({
  broadened,
  contentFilter,
  genres,
  motionPhase,
  resultCount,
  runtimeFilter,
  selectedGenres,
  selectedMoodFilters,
  strictResultCount,
  onClear,
  onSelectContentFilter,
  onToggleRuntimeFilter,
  onToggleGenre,
  onToggleMoodFilter,
}: FilterPanelProps) => (
  <aside className='warp-filter-panel' data-motion={motionPhase}>
    <div className='warp-filter-panel-heading'>
      <p>Add filters</p>
      <span>
        {resultCount} {broadened ? 'broadened' : 'matches'}
      </span>
    </div>
    <div className='warp-content-filter' aria-label='Content type'>
      {CONTENT_FILTERS.map((filter) => (
        <button
          type='button'
          className={cn(
            contentFilter === filter.id &&
              (filter.id !== 'all' ||
                (!selectedGenres.length &&
                  !selectedMoodFilters.length &&
                  !runtimeFilter)) &&
              'is-active',
            filter.disabled && 'is-disabled',
          )}
          key={filter.id}
          aria-disabled={filter.disabled || undefined}
          aria-pressed={contentFilter === filter.id}
          disabled={filter.disabled}
          title={filter.disabled ? filter.meta : undefined}
          onClick={() =>
            filter.id === 'all' ? onClear() : onSelectContentFilter(filter.id)
          }
        >
          <span>{filter.label}</span>
          {filter.meta ? (
            <span className='warp-soon-tag' aria-label={filter.meta}>
              Soon
            </span>
          ) : null}
        </button>
      ))}
    </div>
    {broadened ? (
      <p className='warp-filter-note'>
        Broadened from {strictResultCount} exact matches to keep the wall full.
      </p>
    ) : null}
    <div className='warp-filter-panel-section'>
      <p>{contentFilter === 'series' ? 'Episode runtime' : 'Movie runtime'}</p>
      {(contentFilter === 'series'
        ? SERIES_RUNTIME_FILTERS
        : MOVIE_RUNTIME_FILTERS
      ).map((filter) => (
        <button
          type='button'
          className={cn(
            runtimeFilter === filter.id && 'is-active',
            filter.disabled && 'is-disabled',
          )}
          disabled={filter.disabled}
          key={filter.id}
          aria-pressed={runtimeFilter === filter.id}
          onClick={() => onToggleRuntimeFilter(filter.id)}
        >
          <span>{filter.label}</span>
        </button>
      ))}
    </div>
    <div className='warp-filter-panel-section'>
      <p>Mood</p>
      {MOOD_FILTERS.map((filter) => (
        <button
          type='button'
          className={cn(selectedMoodFilters.includes(filter.id) && 'is-active')}
          key={filter.id}
          aria-pressed={selectedMoodFilters.includes(filter.id)}
          onClick={() => onToggleMoodFilter(filter.id)}
        >
          <span>{filter.label}</span>
        </button>
      ))}
    </div>
    <div className='warp-filter-panel-section'>
      <p>Genres</p>
      {genres.map(({ genre, count }) => (
        <button
          type='button'
          className={cn(selectedGenres.includes(genre) && 'is-active')}
          key={genre}
          aria-pressed={selectedGenres.includes(genre)}
          onClick={() => onToggleGenre(genre)}
        >
          <span>{genre}</span>
          <span>{count}</span>
        </button>
      ))}
    </div>
  </aside>
)

type GenresViewProps = {
  genres: GenreSummary[]
  resultCount: number
  selectedGenres: string[]
  onBackToGallery: () => void
  onClear: () => void
  onToggleGenre: (genre: string) => void
}

const GenresView = ({
  genres,
  resultCount,
  selectedGenres,
  onBackToGallery,
  onClear,
  onToggleGenre,
}: GenresViewProps) => (
  <section className='warp-genres-view' aria-label='Genre curation'>
    <header>
      <div>
        <h1>Genres</h1>
        <p>
          Select one or more lanes. The gallery ranks exact overlap first, then
          keeps the wall full from the wider matching set.
        </p>
      </div>
      <div className='warp-genres-actions'>
        <button
          type='button'
          className='is-danger'
          onClick={onClear}
          disabled={!selectedGenres.length}
        >
          Clear
        </button>
        <button type='button' onClick={onBackToGallery}>
          Back
        </button>
      </div>
    </header>
    <div className='warp-genres-summary'>
      <span>{selectedGenres.length || 'All'} selected</span>
      <span>{resultCount} matching movies</span>
    </div>
    <div className='warp-genres-grid'>
      {genres.map(({ genre, count }) => (
        <button
          type='button'
          key={genre}
          className={cn(selectedGenres.includes(genre) && 'is-active')}
          aria-pressed={selectedGenres.includes(genre)}
          onClick={() => onToggleGenre(genre)}
        >
          <span>{genre}</span>
          <span>{count}</span>
        </button>
      ))}
    </div>
  </section>
)

type AboutDrawerProps = {
  theme: Theme
  onThemeChange: (theme: Theme) => void
  genreCount: number
  globeCount: number
  maximized: boolean
  motionPhase: MotionPhase
  movieCount: number
  onClose: () => void
  onToggleMaximized: () => void
}

// Pointer and touch wording differ; 'pointer' rows are hidden on touch screens.
const ABOUT_CONTROLS: Array<{
  keys: string[]
  touchKeys?: string[]
  action: string
  pointerOnly?: boolean
}> = [
  { keys: ['Click'], touchKeys: ['Tap'], action: 'Open a poster' },
  { keys: ['Hold', 'Drag'], action: 'Spin the globe' },
  {
    keys: ['Scroll', '↑ ↓ ← →'],
    action: 'Spin without grabbing',
    pointerOnly: true,
  },
  { keys: ['Shuffle'], action: 'Land on a random film' },
]

const AboutControls = () => (
  <ul className='warp-about-controls'>
    {ABOUT_CONTROLS.map((control) => (
      <li
        key={control.action}
        className={cn(control.pointerOnly && 'is-pointer-only')}
      >
        <span className='warp-about-keys'>
          {control.keys.map((key) => (
            <kbd key={key} className={cn(control.touchKeys && 'is-pointer')}>
              {key}
            </kbd>
          ))}
          {control.touchKeys?.map((key) => (
            <kbd key={key} className='is-touch'>
              {key}
            </kbd>
          ))}
        </span>
        <span>{control.action}</span>
      </li>
    ))}
  </ul>
)

// A small diagram of the globe: tap opens a poster, hold/drag and scroll spin.
const AboutGlobeDiagram = () => (
  <svg
    className='warp-about-diagram'
    viewBox='24 14 192 192'
    role='img'
    aria-label='Diagram of the poster globe: the poster in front is in focus, and the globe spins around it'
  >
    <defs>
      <radialGradient id='warp-about-globe' cx='50%' cy='45%' r='60%'>
        <stop offset='0%' stopColor='currentColor' stopOpacity='0.16' />
        <stop offset='100%' stopColor='currentColor' stopOpacity='0.02' />
      </radialGradient>
    </defs>
    <circle cx='120' cy='110' r='86' fill='url(#warp-about-globe)' />
    <circle cx='120' cy='110' r='86' className='warp-about-diagram-line' />
    <ellipse
      cx='120'
      cy='110'
      rx='86'
      ry='30'
      className='warp-about-diagram-faint'
    />
    <ellipse
      cx='120'
      cy='110'
      rx='34'
      ry='86'
      className='warp-about-diagram-faint'
    />
    {[
      [78, 70, 0.55],
      [104, 58, 0.75],
      [138, 64, 0.7],
      [70, 108, 0.6],
      [150, 104, 0.8],
      [92, 142, 0.55],
      [132, 146, 0.65],
    ].map(([x, y, opacity]) => (
      <rect
        key={`${x}-${y}`}
        x={x}
        y={y}
        width='16'
        height='23'
        rx='4'
        className='warp-about-diagram-poster'
        opacity={opacity}
      />
    ))}
    {/* The poster in focus, with a tap ring. */}
    <rect
      x='110'
      y='96'
      width='22'
      height='32'
      rx='5'
      className='warp-about-diagram-focus'
    />
    <circle cx='121' cy='112' r='22' className='warp-about-diagram-ring' />
    {/* Spin arrow around the globe. */}
    <path
      d='M 40 72 A 92 92 0 0 1 178 34'
      className='warp-about-diagram-arrow'
      markerEnd='url(#warp-about-arrowhead)'
    />
    <marker
      id='warp-about-arrowhead'
      viewBox='0 0 10 10'
      refX='6'
      refY='5'
      markerWidth='6'
      markerHeight='6'
      orient='auto-start-reverse'
    >
      <path d='M 0 0 L 10 5 L 0 10 z' className='warp-about-diagram-head' />
    </marker>
  </svg>
)

const AboutDrawer = ({
  theme,
  onThemeChange,
  genreCount,
  globeCount,
  maximized,
  motionPhase,
  movieCount,
  onClose,
  onToggleMaximized,
}: AboutDrawerProps) =>
  maximized ? (
    <section
      className='warp-about-page'
      data-motion={motionPhase}
      aria-label='About ScrollFlix'
    >
      <header className='warp-about-hero'>
        <div className='warp-about-mosaic' aria-hidden='true' />
        <div className='warp-about-hero-copy'>
          <p className='warp-about-eyebrow'>About</p>
          <h2>ScrollFlix</h2>
          <p>
            {movieCount.toLocaleString()} films on a globe of posters, for the
            nights you can&apos;t decide. Spin it, filter it, or let Shuffle
            pick, then open a film to see what it is and where it&apos;s
            showing.
          </p>
        </div>
        <div className='warp-about-page-actions'>
          <button type='button' onClick={onToggleMaximized}>
            <Minimize2 aria-hidden='true' />
            Minimize
          </button>
          <button
            type='button'
            className='warp-about-page-close'
            aria-label='Close about'
            onClick={onClose}
          >
            <X aria-hidden='true' />
          </button>
        </div>
      </header>

      <div className='warp-about-sections'>
        <section className='warp-about-section is-wide'>
          <h3>How it works</h3>
          <div className='warp-about-how'>
            <AboutGlobeDiagram />
            <AboutControls />
          </div>
        </section>

        <section className='warp-about-section'>
          <h3>In the catalogue</h3>
          <dl className='warp-about-stats'>
            <div>
              <dt>Films in the index</dt>
              <dd>{movieCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Posters on the globe</dt>
              <dd>{globeCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Genres</dt>
              <dd>{genreCount}</dd>
            </div>
          </dl>
          <p>
            The globe shows up to 900 posters at a time and shrinks to stay
            dense when filters narrow it down. The index always lists every
            match.
          </p>
        </section>

        <section className='warp-about-section'>
          <h3>Where the data comes from</h3>
          <p>
            Titles, years, ratings, genres and summaries come from the Full TMDB
            Movies Dataset on Kaggle, used under the Open Data Commons
            Attribution License. Posters are TMDB artwork: the most popular
            films&apos; are prepared and served from this site, and the rest
            load from TMDB&apos;s image service. Some details are incomplete or
            out of date (most films have no runtime yet), so treat ratings and
            runtimes as a guide.
          </p>
          <p className='warp-about-fineprint'>
            This product uses the TMDB API but is not endorsed or certified by
            TMDB.
          </p>
        </section>

        <section className='warp-about-section'>
          <h3>Watch links</h3>
          <p>
            Let&apos;s Watch lists the usual places to stream, rent or find a
            trailer. Availability isn&apos;t checked per film yet, so those
            options stay disabled until it is, rather than sending you to a dead
            end.
          </p>
        </section>

        <section className='warp-about-section'>
          <h3>Credits</h3>
          <p>
            Built by ICE (Kingsley Aremu). ScrollFlix grew out of a fork of
            Nothing to Watch, whose Voroforce engine still lives in the
            repository.
          </p>
          <p className='warp-about-fineprint'>
            Code: MIT. Shaders: CC BY-NC-SA 3.0. Film data: ODC-By 1.0.
          </p>
        </section>
      </div>
    </section>
  ) : (
    <aside
      className='warp-about-drawer'
      data-motion={motionPhase}
      aria-label='About ScrollFlix'
    >
      <header className='warp-about-drawer-heading'>
        <div>
          <h2>ScrollFlix</h2>
          <p>
            {movieCount.toLocaleString()} films on a globe you can spin, filter
            and shuffle.
          </p>
        </div>
        <button
          type='button'
          className='warp-about-drawer-close'
          aria-label='Close about'
          onClick={onClose}
        >
          <X aria-hidden='true' />
        </button>
      </header>
      <AboutControls />
      <fieldset className='warp-about-setting'>
        <legend>Appearance</legend>
        <div className='warp-theme-switch'>
          {(['dark', 'light'] as const).map((option) => (
            <button
              type='button'
              key={option}
              aria-pressed={theme === option}
              className={cn(theme === option && 'is-active')}
              onClick={() => onThemeChange(option)}
            >
              {option === 'dark' ? (
                <Moon aria-hidden='true' />
              ) : (
                <Sun aria-hidden='true' />
              )}
              {option === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </fieldset>
      <p className='warp-about-fineprint'>
        Film data from TMDB via Kaggle (ODC-By). Not endorsed by TMDB.
      </p>
      <button
        type='button'
        className='warp-about-more'
        onClick={onToggleMaximized}
      >
        More about ScrollFlix
        <Maximize2 aria-hidden='true' />
      </button>
    </aside>
  )

const WATCH_LINKS = [
  { label: 'Netflix', meta: 'Subscription' },
  { label: 'Prime Video', meta: 'Rent or buy' },
  { label: 'Apple TV', meta: 'Rent or buy' },
  { label: 'YouTube', meta: 'Trailer' },
]

type WatchLinksDialogProps = {
  motionPhase: MotionPhase
  movie: TestMovie
  onClose: () => void
  onOpenAbout: () => void
}

const WatchLinksDialog = ({
  motionPhase,
  movie,
  onClose,
  onOpenAbout,
}: WatchLinksDialogProps) => (
  <section
    className='warp-watch-layer'
    data-motion={motionPhase}
    aria-label={`${movie.title} watch links`}
  >
    <button
      type='button'
      className='warp-watch-backdrop'
      aria-label='Close watch links'
      onClick={onClose}
    />
    <dialog
      className='warp-watch-card'
      aria-label={`${movie.title} watch options`}
      aria-modal='true'
      open
    >
      <button
        type='button'
        className='warp-watch-close'
        aria-label='Close watch links'
        onClick={onClose}
      >
        Close
      </button>
      <p className='warp-watch-kicker'>Watch options</p>
      <h2>{movie.title}</h2>
      <p className='warp-watch-meta'>{formatMovieMeta(movie)}</p>
      <div className='warp-watch-links'>
        {WATCH_LINKS.map((link) => (
          <button type='button' key={link.label} disabled>
            <span>{link.label}</span>
            <span>{link.meta}</span>
          </button>
        ))}
      </div>
      <button type='button' className='warp-watch-about' onClick={onOpenAbout}>
        <Info aria-hidden='true' />
        About ScrollFlix and where these links come from
      </button>
    </dialog>
  </section>
)

type MovieDetailsCardProps = {
  movies: TestMovie[]
  motionPhase: MotionPhase
  movie: TestMovie
  onClose: () => void
  onOpenMovie: (movie: TestMovie) => void
  onSelectGenre: (genre: string) => void
  onWatch: (movie: TestMovie) => void
}

const MovieDetailsCard = ({
  movies,
  motionPhase,
  movie,
  onClose,
  onOpenMovie,
  onSelectGenre,
  onWatch,
}: MovieDetailsCardProps) => {
  // Wide screens get a centred panel with everything visible; small screens
  // keep the draggable bottom sheet with a More/Less toggle.
  const isWide = useMediaQuery('(min-width: 901px)')
  const [isExpanded, setIsExpanded] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartYRef = useRef<number | null>(null)
  const dragPointerIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (movie.id) {
      setIsExpanded(false)
      setDragOffset(0)
    }
  }, [movie.id])

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    dragStartYRef.current = event.clientY
    dragPointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) return
    const startY = dragStartYRef.current
    if (startY === null) return

    const nextOffset = Math.max(-120, Math.min(140, event.clientY - startY))
    setDragOffset(nextOffset)
  }

  const finishDrag = (clientY: number) => {
    const startY = dragStartYRef.current
    if (startY === null) return

    const deltaY = clientY - startY
    dragStartYRef.current = null
    dragPointerIdRef.current = null
    setDragOffset(0)

    if (deltaY < -DETAILS_EXPAND_DRAG_PX) {
      setIsExpanded(true)
      return
    }

    if (isExpanded && deltaY > DETAILS_COMPACT_DRAG_PX) {
      setIsExpanded(false)
      return
    }

    if (deltaY > DETAILS_CLOSE_DRAG_PX) {
      onClose()
    }
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) return
    finishDrag(event.clientY)
  }

  const showFullContent = isWide || isExpanded
  const stats = [
    movie.year && movie.year !== '----' ? movie.year : null,
    movie.ratingValue ? `★ ${movie.rating}` : null,
    formatRuntimeLabel(movie),
    movie.countries || null,
  ].filter((stat): stat is string => Boolean(stat))
  const detailsStyle = {
    '--details-drag-y': `${dragOffset}px`,
    // CSS images are fetched without CORS, so catalogue films use a size the
    // globe never requests (it is blurred anyway); see MoviePoster.
    '--details-backdrop': `url(${JSON.stringify(
      movie.posterDetailUrl
        ? movie.posterUrl.replace('/w154/', '/w92/')
        : movie.posterUrl,
    )})`,
  } as CSSProperties
  const movieText = useMovieText(movie)
  const similarMovies = useMemo(
    () => getSimilarMovies(movie, movies),
    [movie, movies],
  )

  return (
    <section
      className='warp-details-layer'
      data-motion={motionPhase}
      aria-label={`${movie.title} details`}
    >
      <button
        type='button'
        className='warp-details-backdrop'
        aria-label='Close details'
        onClick={onClose}
      />
      <dialog
        open
        className={cn(
          'warp-details-card',
          isExpanded && 'is-expanded',
          dragOffset !== 0 && 'is-dragging',
        )}
        style={detailsStyle}
        aria-modal='true'
        data-snap={isExpanded ? 'expanded' : 'compact'}
      >
        <span className='warp-details-ambient' aria-hidden='true' />
        <button
          type='button'
          className='warp-details-close'
          aria-label='Close details'
          onClick={onClose}
        >
          <X aria-hidden='true' size={17} strokeWidth={3} />
        </button>
        {isWide ? null : (
          <div
            className='warp-details-grip-zone'
            onPointerCancel={handleDragEnd}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
          >
            <span className='warp-details-handle' />
          </div>
        )}
        <div className='warp-details-poster'>
          <MoviePoster loading='eager' movie={movie} size='detail' />
        </div>
        <div className='warp-details-copy'>
          <div className='warp-details-copy-scroll'>
            {stats.length ? (
              <ul className='warp-details-stats' aria-label='Movie facts'>
                {stats.map((stat) => (
                  <li key={stat}>{stat}</li>
                ))}
              </ul>
            ) : null}
            <h2>{movie.title}</h2>
            {movieText?.tagline ? (
              <p className='warp-details-tagline'>{movieText.tagline}</p>
            ) : null}
            <p
              className='warp-details-overview'
              aria-busy={movieText ? undefined : true}
            >
              {movieText
                ? movieText.overview || 'No overview available yet.'
                : 'Loading the overview…'}
            </p>
            <div className='warp-details-genres'>
              {movie.genres.map((genre) => (
                <button
                  type='button'
                  key={genre}
                  onClick={() => onSelectGenre(genre)}
                >
                  {genre}
                </button>
              ))}
            </div>
            <div className='warp-details-actions'>
              <button
                type='button'
                className='warp-details-watch'
                onClick={() => onWatch(movie)}
              >
                <Play aria-hidden='true' size={15} strokeWidth={2.6} />
                Where to watch
              </button>
            </div>
            {showFullContent ? (
              <div className='warp-details-expanded-content'>
                {similarMovies.length ? (
                  <section
                    className='warp-details-similar'
                    aria-label='Similar movies'
                  >
                    <header>
                      <h3>Similar movies</h3>
                      <span>{movie.genres.slice(0, 2).join(' | ')}</span>
                    </header>
                    <div className='warp-details-similar-list'>
                      {similarMovies.map((similarMovie) => (
                        <button
                          type='button'
                          key={similarMovie.id}
                          onClick={() => onOpenMovie(similarMovie)}
                        >
                          <span className='warp-details-similar-poster'>
                            <MoviePoster movie={similarMovie} />
                          </span>
                          <span className='warp-details-similar-copy'>
                            <strong>{similarMovie.title}</strong>
                            <span>{formatCompactMeta(similarMovie)}</span>
                            <em>
                              {getCachedMovieText(similarMovie)?.overview ||
                                similarMovie.genres.slice(0, 3).join(' · ') ||
                                'Movie'}
                            </em>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {isWide ? null : (
          <button
            type='button'
            className='warp-details-more'
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            <span>{isExpanded ? 'Less' : 'More'}</span>
            {isExpanded ? (
              <ChevronsUp aria-hidden='true' size={17} strokeWidth={2.8} />
            ) : (
              <ChevronsDown aria-hidden='true' size={17} strokeWidth={2.8} />
            )}
          </button>
        )}
      </dialog>
    </section>
  )
}
