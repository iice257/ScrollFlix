import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
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
  Fragment,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useMediaQuery } from '../../../hooks/use-media-query'
import { cn } from '../../../utils/tw'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip'
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
  voteCount: number | null
  popularity: number | null
  weightedRating: number | null
  countries: string
  posterUrl: string
  // Catalogue films (beyond the local set) use TMDB-hosted posters: a larger
  // one for the details card, and an average colour while they load.
  posterDetailUrl?: string
  // A 92px poster for the index, where it is drawn at about 42px.
  posterListUrl?: string
  placeholderColor?: string
  // Position in the catalogue's lazily loaded overview/tagline chunks.
  textIndex?: number
  // Lower-case title without accents: what sorting and searching compare, so
  // neither pays for locale-aware string work per comparison.
  titleKey?: string
}

export const toTitleKey = (title: string) =>
  title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()

const getTitleKey = (movie: TestMovie) =>
  movie.titleKey ?? toTitleKey(movie.title)

// Orders by code unit, which on lower-cased, accent-free titles matches the
// alphabet and costs a fraction of localeCompare.
const compareTitleKeys = (movieA: TestMovie, movieB: TestMovie) => {
  const keyA = getTitleKey(movieA)
  const keyB = getTitleKey(movieB)
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0
}

type ViewMode = 'wall' | 'list' | 'filters'
type ListGrouping =
  | 'alpha'
  | 'year'
  | 'rating'
  | 'runtime'
  | 'popularity'
  | 'votes'
type LoadState = 'loading' | 'ready' | 'error'
type ContentFilter = 'all' | 'movies' | 'series'
export type RuntimeFilter =
  | 'movieUnder90'
  | 'movie90to120'
  | 'movieOver120'
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
const FULLSCREEN_HINT_STORAGE_KEY = 'wtw:fullscreen-hint-seen'
const THEME_STORAGE_KEY = 'wtw:theme'

type Theme = 'dark' | 'light'
type ShuffleProVariant = 'standard' | 'rare' | 'max'
type ShuffleProPhase = 'spinning' | 'transition'

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

const readFullscreenHintSeen = () => {
  try {
    return window.localStorage.getItem(FULLSCREEN_HINT_STORAGE_KEY) === '1'
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
    id: 'movieUnder90',
    label: 'Under 1 hr 30',
    test: (runtimeMinutes) =>
      runtimeMinutes !== null && runtimeMinutes > 0 && runtimeMinutes < 90,
  },
  {
    id: 'movie90to120',
    label: '1 hr 30 to 2 hrs',
    test: (runtimeMinutes) =>
      runtimeMinutes !== null && runtimeMinutes >= 90 && runtimeMinutes <= 120,
  },
  {
    id: 'movieOver120',
    label: 'Over 2 hrs',
    test: (runtimeMinutes) => runtimeMinutes !== null && runtimeMinutes > 120,
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
const RATING_PRESETS = [6, 7, 8]

export type GalleryKeyState = {
  key: 'shuffle' | 'open'
  mode: string
  galleryReady: boolean
  overlayOpen: boolean
  detailsOpen?: boolean
  hasTarget: boolean
  repeat: boolean
  hasModifier: boolean
  activeElementKind: 'body' | 'canvas' | 'interactive'
}

// Space can reshuffle through a details card; other overlays own the shortcut.
export const shouldHandleGalleryKey = (state: GalleryKeyState) =>
  (state.mode === 'wall' ||
    (state.mode === 'list' && state.key === 'shuffle')) &&
  state.galleryReady &&
  !state.overlayOpen &&
  (!state.detailsOpen || state.key === 'shuffle') &&
  state.hasTarget &&
  !state.repeat &&
  !state.hasModifier &&
  (state.activeElementKind !== 'interactive' ||
    Boolean(state.detailsOpen && state.key === 'shuffle'))

const getActiveElementKind = (): GalleryKeyState['activeElementKind'] => {
  const element = document.activeElement
  if (!element || element === document.body) return 'body'
  if (element.classList.contains('warp-infinite-menu-canvas')) return 'canvas'
  return 'interactive'
}

export const getRuntimeBucket = (
  runtimeMinutes: number | null,
): RuntimeFilter | null =>
  MOVIE_RUNTIME_FILTERS.find((filter) => filter.test(runtimeMinutes))?.id ??
  null

export type YearFilter = { kind: 'year' | 'decade'; value: number }

export const matchesYearFilter = (
  movie: TestMovie,
  yearFilter: YearFilter | null,
) => {
  if (!yearFilter) return true
  const year = Number.parseInt(movie.year, 10)
  if (!Number.isFinite(year)) return false
  return yearFilter.kind === 'year'
    ? year === yearFilter.value
    : year >= yearFilter.value && year <= yearFilter.value + 9
}

export const matchesRatingMin = (
  movie: TestMovie,
  ratingMin: number | null,
) => {
  if (ratingMin === null) return true
  return movie.ratingValue !== null && movie.ratingValue >= ratingMin
}

export const filterMoviesByYearAndRating = (
  movies: TestMovie[],
  yearFilter: YearFilter | null,
  ratingMin: number | null,
) => {
  if (!yearFilter && ratingMin === null) return movies
  return movies.filter(
    (movie) =>
      matchesYearFilter(movie, yearFilter) &&
      matchesRatingMin(movie, ratingMin),
  )
}

const getDecadeSummaries = (movies: TestMovie[]) => {
  const decades = new Set<number>()
  for (const movie of movies) {
    const year = Number.parseInt(movie.year, 10)
    if (Number.isFinite(year)) decades.add(Math.floor(year / 10) * 10)
  }
  return [...decades].sort((a, b) => b - a)
}

const formatRatingMin = (value: number) => `${Number(value.toFixed(1))}+`
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
    test: (movie) => movie.ratingValue !== null && movie.ratingValue >= 7.5,
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

const getNonNegativeNumber = (raw: RawMovie, key: string) => {
  const value = raw[key]
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
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

const RATING_NOT_AVAILABLE = 'N/A'

const formatRating = (movie: TestMovie) =>
  movie.ratingValue === null ? RATING_NOT_AVAILABLE : movie.rating

const formatCompactMeta = (movie: TestMovie) =>
  [
    movie.year && movie.year !== '----' ? movie.year : null,
    `★ ${formatRating(movie)}`,
  ]
    .filter(Boolean)
    .join(' · ')

export const formatMovieMeta = (movie: TestMovie) =>
  `Year: ${movie.year && movie.year !== '----' ? movie.year : '-'} | Rating: ${formatRating(
    movie,
  )} | Hour: ${formatRuntime(movie.runtime, movie.runtimeMinutes)}`

const hasLatinLeadingTitle = (movie: TestMovie) =>
  /^[A-Za-z]/.test(movie.title.trim())

type MoviePosterProps = {
  movie: TestMovie
  loading?: 'eager' | 'lazy'
  size?: 'thumb' | 'list' | 'detail'
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
            : size === 'list'
              ? (movie.posterListUrl ?? movie.posterUrl)
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
  const query = toTitleKey(searchQuery.trim())
  if (!query) return movies

  return movies.filter((movie) => getTitleKey(movie).includes(query))
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
  popularity: 'desc',
  rating: 'desc',
  runtime: 'asc',
  votes: 'desc',
  year: 'desc',
}

// Numeric sort value per key; null means unknown and always sorts last.
const getSortValue = (movie: TestMovie, key: ListGrouping): number | null => {
  switch (key) {
    case 'year':
      return getYearNumber(movie) || null
    case 'rating':
      return movie.weightedRating
    case 'runtime':
      return movie.runtimeMinutes
    case 'popularity':
      return movie.popularity
    case 'votes':
      return movie.voteCount
    default:
      return null
  }
}

// Returns the order for the given direction; unknown values stay last.
const compareMoviesByRule = (
  movieA: TestMovie,
  movieB: TestMovie,
  key: ListGrouping,
  direction: SortDirection,
) => {
  const sign = direction === 'desc' ? -1 : 1
  if (key === 'alpha') return sign * compareTitleKeys(movieA, movieB)
  const valueA = getSortValue(movieA, key)
  const valueB = getSortValue(movieB, key)
  if (valueA === null || valueB === null) {
    return valueA === valueB ? 0 : valueA === null ? 1 : -1
  }
  return sign * (valueA - valueB)
}

export const getActiveSortRules = (rules: SortRule[]) => {
  const active = rules.filter(
    (rule): rule is { key: ListGrouping; direction: SortDirection } =>
      rule.direction !== null,
  )
  return active.length
    ? active
    : [{ key: 'alpha' as const, direction: 'asc' as const }]
}

export const sortMoviesByRules = (movies: TestMovie[], rules: SortRule[]) => {
  const active = getActiveSortRules(rules)
  // Grouping by initial letter only lists titles that start with a letter.
  const sortableMovies =
    active[0].key === 'alpha' ? movies.filter(hasLatinLeadingTitle) : movies

  return [...sortableMovies].sort((movieA, movieB) => {
    for (const rule of active) {
      const order = compareMoviesByRule(
        movieA,
        movieB,
        rule.key,
        rule.direction,
      )
      if (order) return order
    }
    return compareTitleKeys(movieA, movieB)
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

const UNKNOWN_GROUP = 'Unknown'
const UNRATED_GROUP = 'Unrated'

const RUNTIME_GROUPS = ['Under 1h 30', '1h 30–2h', 'Over 2h']
const POPULARITY_GROUPS = ['Rest', 'Top 50%', 'Top 25%', 'Top 10%']
const VOTES_GROUPS = ['Under 100', '100–1k', '1k–10k', '10k+']

const getRatingGroupKey = (movie: TestMovie) => {
  if (movie.weightedRating === null) return UNRATED_GROUP
  const band = Math.floor(movie.weightedRating)
  return band >= 10 ? '10' : `${band}+`
}

const getRuntimeGroupKey = (movie: TestMovie) => {
  const minutes = movie.runtimeMinutes
  if (minutes === null) return UNKNOWN_GROUP
  if (minutes < 90) return RUNTIME_GROUPS[0]
  return minutes < 120 ? RUNTIME_GROUPS[1] : RUNTIME_GROUPS[2]
}

const getVotesGroupKey = (movie: TestMovie) => {
  const votes = movie.voteCount
  if (votes === null) return UNKNOWN_GROUP
  if (votes >= 10000) return VOTES_GROUPS[3]
  if (votes >= 1000) return VOTES_GROUPS[2]
  return votes >= 100 ? VOTES_GROUPS[1] : VOTES_GROUPS[0]
}

// Percentile bucket by popularity rank among the movies passed in.
export const getPopularityGroups = (movies: TestMovie[]) => {
  const ranked = movies
    .filter((movie) => movie.popularity !== null)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
  const groups = new Map<string, string>()
  ranked.forEach((movie, index) => {
    const share = (index + 1) / ranked.length
    groups.set(
      movie.id,
      share <= 0.1
        ? 'Top 10%'
        : share <= 0.25
          ? 'Top 25%'
          : share <= 0.5
            ? 'Top 50%'
            : 'Rest',
    )
  })
  return groups
}

const getAlphaGroupKey = (movie: TestMovie) => {
  const letter = movie.title.charAt(0).toUpperCase() || '#'
  return /[A-Z]/.test(letter) ? letter : '#'
}

// Appends in place: copying each group per film is quadratic at catalogue size.
const groupBy = (movies: TestMovie[], getKey: (movie: TestMovie) => string) =>
  movies.reduce<Record<string, TestMovie[]>>((groups, movie) => {
    const key = getKey(movie)
    const group = groups[key]
    if (group) group.push(movie)
    else groups[key] = [movie]
    return groups
  }, {})

export const groupMoviesByYear = (movies: TestMovie[]) =>
  groupBy(movies, (movie) => movie.year || '----')

export const groupMoviesAlphabetically = (movies: TestMovie[]) =>
  groupBy(movies, getAlphaGroupKey)

export const groupMoviesByRating = (movies: TestMovie[]) =>
  groupBy(movies, getRatingGroupKey)

export const groupMoviesByRuntime = (movies: TestMovie[]) =>
  groupBy(movies, getRuntimeGroupKey)

export const groupMoviesByVotes = (movies: TestMovie[]) =>
  groupBy(movies, getVotesGroupKey)

export const groupMoviesByPopularity = (movies: TestMovie[]) => {
  const groups = getPopularityGroups(movies)
  return groupBy(movies, (movie) => groups.get(movie.id) ?? UNKNOWN_GROUP)
}

export const groupMoviesForList = (
  movies: TestMovie[],
  grouping: ListGrouping,
) => {
  switch (grouping) {
    case 'alpha':
      return groupMoviesAlphabetically(movies)
    case 'rating':
      return groupMoviesByRating(movies)
    case 'runtime':
      return groupMoviesByRuntime(movies)
    case 'popularity':
      return groupMoviesByPopularity(movies)
    case 'votes':
      return groupMoviesByVotes(movies)
    default:
      return groupMoviesByYear(movies)
  }
}

const isUnknownGroup = (group: string) =>
  group === UNKNOWN_GROUP || group === UNRATED_GROUP

// Position of a group in ascending order; unknown groups are handled apart.
const getGroupOrder = (group: string, grouping: ListGrouping) => {
  if (grouping === 'runtime') return RUNTIME_GROUPS.indexOf(group)
  if (grouping === 'popularity') return POPULARITY_GROUPS.indexOf(group)
  if (grouping === 'votes') return VOTES_GROUPS.indexOf(group)
  return Number.parseFloat(group)
}

// Group headers follow the sort direction; unknown groups always come last.
export const compareListGroups = (
  groupA: string,
  groupB: string,
  grouping: ListGrouping,
  direction: SortDirection,
) => {
  const unknownA = isUnknownGroup(groupA)
  const unknownB = isUnknownGroup(groupB)
  if (unknownA || unknownB) return Number(unknownA) - Number(unknownB)
  const sign = direction === 'desc' ? -1 : 1
  if (grouping === 'alpha') return sign * groupA.localeCompare(groupB)
  return (
    sign * (getGroupOrder(groupA, grouping) - getGroupOrder(groupB, grouping))
  )
}

const SORT_OPTIONS: Array<{
  key: ListGrouping
  label: string
  asc: string
  desc: string
}> = [
  { key: 'alpha', label: 'A–Z', asc: 'A to Z', desc: 'Z to A' },
  { key: 'year', label: 'Year', asc: 'Oldest first', desc: 'Newest first' },
  {
    key: 'rating',
    label: 'Rating',
    asc: 'Lowest first',
    desc: 'Highest first',
  },
  {
    key: 'runtime',
    label: 'Runtime',
    asc: 'Shortest first',
    desc: 'Longest first',
  },
  {
    key: 'popularity',
    label: 'Popularity',
    asc: 'Least popular',
    desc: 'Most popular',
  },
  {
    key: 'votes',
    label: 'Vote count',
    asc: 'Fewest votes',
    desc: 'Most votes',
  },
]
const SORT_LABELS = Object.fromEntries(
  SORT_OPTIONS.map((option) => [option.key, option.label]),
) as Record<ListGrouping, string>

// `popularityGroups` is needed only for popularity, where a movie's bucket
// depends on the whole list.
const getMovieListGroupKey = (
  movie: TestMovie,
  grouping: ListGrouping,
  popularityGroups?: Map<string, string>,
) => {
  switch (grouping) {
    case 'alpha':
      return getAlphaGroupKey(movie)
    case 'rating':
      return getRatingGroupKey(movie)
    case 'runtime':
      return getRuntimeGroupKey(movie)
    case 'votes':
      return getVotesGroupKey(movie)
    case 'popularity':
      return popularityGroups?.get(movie.id) ?? UNKNOWN_GROUP
    default:
      return movie.year || '----'
  }
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

export const mapMovie = (
  raw: RawMovie,
  index: number,
  localPosterIds: ReadonlySet<string>,
): TestMovie => {
  const rating = getPositiveNumber(raw, 'vote_average')
  const voteCount = getNonNegativeNumber(raw, 'vote_count')
  const popularity = getNonNegativeNumber(raw, 'popularity')
  const runtimeMinutes = getPositiveNumber(raw, 'runtime_minutes')
  const year = getText(raw, 'release_year') || '----'
  const rawId = getText(raw, 'id')
  const title = getText(raw, 'title') || `Untitled ${index + 1}`
  const posterUrls = resolveMoviePosterUrls(rawId, index, localPosterIds)

  return {
    id: rawId ? `${index}-${rawId}` : String(index),
    rank: index + 1,
    title,
    titleKey: toTitleKey(title),
    tagline: getText(raw, 'tagline'),
    overview: getText(raw, 'overview'),
    genres: splitList(getText(raw, 'genres')),
    year,
    runtime: getText(raw, 'time_str') || '',
    runtimeMinutes,
    rating: rating ? rating.toFixed(1) : '',
    ratingValue: rating,
    voteCount,
    popularity,
    weightedRating: null,
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
      cachedMovieDataset = withWeightedRatings(
        datasets
          .flat()
          .map((raw, index) => mapMovie(raw, index, localPosterIds)),
      ).filter((movie) => Boolean(movie.posterUrl))
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
// colour, vote count, popularity x10], with the genre and country names in the
// manifest.
export type CatalogRow = [
  number,
  string,
  number,
  number,
  number[],
  number,
  string,
  string,
  number,
  number,
]
export type CatalogTables = { countries: string[]; genres: string[] }
type CatalogManifest = CatalogTables & {
  chunks: string[]
  chunkSize: number
  count: number
  textChunkSize: number
}

// Phones and weaker machines load the most popular ~5,000 films; everything
// else gets the whole catalogue. Decided once, so rotating a phone or
// resizing a window never changes what is loaded.
export const MOBILE_FILM_TARGET = 5000
const DEFAULT_CATALOG_CHUNK_SIZE = 2000

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
const detectLightweightDevice = () => {
  lightweightDevice ??= isLightweightDevice({
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    narrowViewport: window.matchMedia('(max-width: 900px)').matches,
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    cores: navigator.hardwareConcurrency,
  })
  return lightweightDevice
}

// How many catalogue chunks a device needs, given the films it already has.
export const getCatalogChunkCount = (
  manifest: Pick<CatalogManifest, 'chunks'> &
    Partial<Pick<CatalogManifest, 'chunkSize'>>,
  localCount: number,
  lightweight: boolean,
) => {
  if (!lightweight) return manifest.chunks.length
  const chunkSize = manifest.chunkSize || DEFAULT_CATALOG_CHUNK_SIZE
  return Math.min(
    manifest.chunks.length,
    Math.max(1, Math.ceil((MOBILE_FILM_TARGET - localCount) / chunkSize)),
  )
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
    colour,
    voteCount,
    popularity10,
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
    runtimeMinutes: null,
    rating: rating ? rating.toFixed(1) : '',
    ratingValue: rating,
    voteCount,
    popularity: popularity10 / 10,
    weightedRating: null,
    countries: tables.countries[country] ?? '',
    posterUrl: `${TMDB_IMAGE_URL}/w154/${poster}.jpg`,
    posterDetailUrl: `${TMDB_IMAGE_URL}/w342/${poster}.jpg`,
    posterListUrl: `${TMDB_IMAGE_URL}/w92/${poster}.jpg`,
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

// The local films followed by everything loaded from the catalogue.
let cachedAllMovies: TestMovie[] | null = null
let allMoviesPromise: Promise<TestMovie[]> | null = null

// Loaded after the globe is up; the local films keep their ranks and the
// catalogue follows them, so the default globe window never changes.
const loadAllMovies = (localMovies: TestMovie[]) => {
  if (cachedAllMovies) return Promise.resolve(cachedAllMovies)
  const rankOffset = localMovies.reduce(
    (highest, movie) => Math.max(highest, movie.rank),
    0,
  )
  allMoviesPromise ??= loadCatalogManifest()
    .then(async (manifest) => {
      const chunkCount = getCatalogChunkCount(
        manifest,
        localMovies.length,
        detectLightweightDevice(),
      )
      const chunks = await Promise.all(
        manifest.chunks.slice(0, chunkCount).map((chunk) =>
          fetch(`${CATALOG_URL}/${chunk}`).then((response) => {
            if (!response.ok) throw new Error(`Catalogue ${response.status}`)
            return response.json() as Promise<CatalogRow[]>
          }),
        ),
      )
      // Weighted ratings are relative to the whole set, so they are worked
      // out again over local and catalogue films together.
      cachedAllMovies = withWeightedRatings([
        ...localMovies,
        ...chunks
          .flat()
          .map((row, index) =>
            mapCatalogRow(row, index, rankOffset + index + 1, manifest),
          ),
      ])
      return cachedAllMovies
    })
    .catch((error: unknown) => {
      allMoviesPromise = null
      throw error
    })
  return allMoviesPromise
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

// Keeps the previous array when it holds the same films in the same order, so
// a background append (which also refreshes weighted ratings on every film)
// never hands the globe a "new" list and rebuilds it.
const useStableList = (list: TestMovie[]) => {
  const ref = useRef(list)
  const previous = ref.current
  if (
    previous !== list &&
    (previous.length !== list.length ||
      previous.some((movie, index) => movie.id !== list[index].id))
  ) {
    ref.current = list
  }
  return ref.current
}

export const TestGalleryApp = () => {
  const isMobileViewport = useMediaQuery('(max-width: 900px)')
  const shellRef = useRef<HTMLElement | null>(null)
  const fullscreenHintTimerRef = useRef<number | null>(null)
  const fullscreenHintSeenRef = useRef<boolean | null>(null)
  if (fullscreenHintSeenRef.current === null)
    fullscreenHintSeenRef.current = readFullscreenHintSeen()
  const [isFullscreenActive, setIsFullscreenActive] = useState(false)
  const [showFullscreenHint, setShowFullscreenHint] = useState(false)
  const [proMaxActive, setProMaxActive] = useState(false)
  const [movies, setMovies] = useState<TestMovie[]>(
    cachedAllMovies ?? cachedMovieDataset ?? [],
  )
  const [mode, setMode] = useState<ViewMode>('wall')
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { key: 'alpha', direction: 'asc' },
  ])
  const [sortOpen, setSortOpen] = useState(false)
  const [listRandomNonce, setListRandomNonce] = useState(0)
  const reopenDetailsAfterListShuffleRef = useRef(false)
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
  const [selectedYear, setSelectedYear] = useState<YearFilter | null>(null)
  const [ratingMin, setRatingMin] = useState<number | null>(null)
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
  const [shuffleProPresentation, setShuffleProPresentation] = useState<{
    phase: ShuffleProPhase
    variant: ShuffleProVariant
  } | null>(null)
  const [premiumSuggestion, setPremiumSuggestion] = useState<{
    movieId: string
    variant: ShuffleProVariant
  } | null>(null)
  const shuffleStreakRef = useRef(0)
  const proComboStreakRef = useRef(0)
  const quickSpinStreakRef = useRef(0)
  const resetShuffleStreak = useCallback(() => {
    shuffleStreakRef.current = 0
    proComboStreakRef.current = 0
    quickSpinStreakRef.current = 0
  }, [])

  useEffect(() => {
    const syncFullscreen = () => {
      const active = document.fullscreenElement === shellRef.current
      setIsFullscreenActive(active)
      setProMaxActive(active && isMobileViewport)
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    syncFullscreen()
    return () =>
      document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [isMobileViewport])

  useEffect(
    () => () => {
      if (fullscreenHintTimerRef.current !== null)
        window.clearTimeout(fullscreenHintTimerRef.current)
    },
    [],
  )

  const promptFullscreenHint = useCallback(() => {
    if (
      !isMobileViewport ||
      isFullscreenActive ||
      fullscreenHintSeenRef.current
    ) {
      return
    }
    fullscreenHintSeenRef.current = true
    try {
      window.localStorage.setItem(FULLSCREEN_HINT_STORAGE_KEY, '1')
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
    setShowFullscreenHint(true)
    if (fullscreenHintTimerRef.current !== null)
      window.clearTimeout(fullscreenHintTimerRef.current)
    fullscreenHintTimerRef.current = window.setTimeout(
      () => setShowFullscreenHint(false),
      5000,
    )
  }, [isFullscreenActive, isMobileViewport])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await shellRef.current?.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      // Fullscreen is unavailable in embedded or permission-restricted contexts.
    }
    setShowFullscreenHint(false)
  }, [])

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
    shuffleProAutomatic?: boolean
    shuffleProAutomaticVariant?: ShuffleProVariant
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

  const handleUserSpin = useCallback(() => {
    markSpinHintSeen()
    promptFullscreenHint()
  }, [markSpinHintSeen, promptFullscreenHint])

  const maybePromptFullscreenHint = useCallback(
    (target: EventTarget | null) => {
      if (mode !== 'wall' || detailsMovieId) return
      if (
        target instanceof Element &&
        target.closest('.warp-fullscreen-control')
      ) {
        return
      }
      promptFullscreenHint()
    },
    [detailsMovieId, mode, promptFullscreenHint],
  )

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
    const timer = window.setTimeout(() => {
      loadAllMovies(localMovies)
        .then((allMovies) => {
          if (cancelled) return
          setMovies((currentMovies) =>
            currentMovies.length > localMovies.length
              ? currentMovies
              : allMovies,
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

  const decadeOptions = useMemo(() => getDecadeSummaries(movies), [movies])

  const baseMovies = useMemo(
    () => filterMoviesByYearAndRating(movies, selectedYear, ratingMin),
    [movies, selectedYear, ratingMin],
  )

  const genreFilteredMovies = useMemo(
    () => filterMoviesByGenres(baseMovies, selectedGenres),
    [baseMovies, selectedGenres],
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
    (selectedYear ? 1 : 0) +
    (ratingMin !== null ? 1 : 0) +
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

  // Sorting comes first: filtering keeps the order, so a keystroke in the
  // search box never re-sorts the whole catalogue, and the list follows the
  // typing a beat behind it instead of holding the input up.
  const sortedFilteredMovies = useMemo(
    () => sortMoviesByRules(filteredMovies, sortRules),
    [filteredMovies, sortRules],
  )
  const deferredSearchQuery = useDeferredValue(listSearchQuery)
  const listMovies = useMemo(
    () => filterMoviesByTitleSearch(sortedFilteredMovies, deferredSearchQuery),
    [sortedFilteredMovies, deferredSearchQuery],
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

  const clearAllFilters = useCallback(() => {
    setContentFilter('all')
    setSelectedYear(null)
    setRatingMin(null)
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

  const toggleYear = useCallback((next: YearFilter) => {
    setSelectedYear((current) =>
      current?.kind === next.kind && current.value === next.value ? null : next,
    )
  }, [])

  const toggleRatingMin = useCallback((min: number) => {
    setRatingMin((current) => (current === min ? null : min))
  }, [])

  // Entry points for applying a filter from elsewhere (e.g. the movie card).
  const applyYearFilter = useCallback((year: number) => {
    setSelectedYear({ kind: 'year', value: year })
  }, [])
  const applyRatingFilter = useCallback((min: number) => {
    setRatingMin(min)
  }, [])
  const applyRuntimeFilter = useCallback((id: RuntimeFilter) => {
    setSelectedRuntimeFilter(id)
  }, [])

  // Filters applied from the movie card: close the card and show the gallery.
  const handleApplyCardFilter = useCallback(
    (filter: MovieCardFilter) => {
      if (filter.kind === 'year') applyYearFilter(filter.year)
      else if (filter.kind === 'rating') applyRatingFilter(filter.min)
      else if (filter.kind === 'runtime') applyRuntimeFilter(filter.id)
      else setSelectedGenres([filter.genre])
      setDetailsMovieId(null)
      setMode('wall')
    },
    [applyRatingFilter, applyRuntimeFilter, applyYearFilter],
  )

  const selectContentFilter = useCallback(
    (nextContentFilter: ContentFilter) => {
      if (nextContentFilter === 'series') return
      setContentFilter(nextContentFilter)
      setSelectedRuntimeFilter(null)
    },
    [],
  )

  const filterSectionProps: FilterSectionsProps = {
    allActive: selectedFilterCount === 0,
    contentFilter,
    decades: decadeOptions,
    genres: genreSummaries,
    ratingMin,
    runtimeFilter: selectedRuntimeFilter,
    selectedGenres,
    selectedMoodFilters,
    selectedYear,
    onClear: clearAllFilters,
    onSelectContentFilter: selectContentFilter,
    onToggleGenre: toggleGenre,
    onToggleMoodFilter: toggleMoodFilter,
    onToggleRating: toggleRatingMin,
    onToggleRuntimeFilter: toggleRuntimeFilter,
    onToggleYear: toggleYear,
  }

  const handleOpenMovie = useCallback((movie: TestMovie) => {
    setActiveMovieId(movie.id)
    setDetailsMovieId(movie.id)
    setPremiumSuggestion((current) =>
      current?.movieId === movie.id ? current : null,
    )
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

  const handleShuffle = useCallback(
    (
      options: {
        premiumVariant?: ShuffleProVariant
        automatic?: boolean
        countAction?: boolean
      } = {},
    ) => {
      if (mode === 'list') {
        shuffleStreakRef.current = 0
        proComboStreakRef.current = 0
        quickSpinStreakRef.current = 0
        setSortOpen(false)
        reopenDetailsAfterListShuffleRef.current = Boolean(detailsMovieId)
        setListRandomNonce((nonce) => nonce + 1)
        setPremiumSuggestion(null)
        return
      }

      const candidates = visibleMovies.filter(
        (movie) => movie.id !== activeMovieId,
      )
      const movie = candidates[Math.floor(Math.random() * candidates.length)]
      if (!movie) return
      let premiumVariant = options.premiumVariant
      let shuffleProAutomatic = Boolean(options.automatic)
      const countAction = options.countAction !== false
      const nextStreak = countAction ? shuffleStreakRef.current + 1 : 0
      const nextCombo = countAction ? proComboStreakRef.current + 1 : 0
      quickSpinStreakRef.current = 0
      if (
        countAction &&
        proMaxActive &&
        !premiumVariant &&
        (nextStreak >= 5 || nextCombo >= 6)
      ) {
        premiumVariant = 'max'
        shuffleProAutomatic = true
        shuffleStreakRef.current = 0
        proComboStreakRef.current = 0
      } else if (
        countAction &&
        !premiumVariant &&
        nextCombo >= (proMaxActive ? 6 : 10)
      ) {
        premiumVariant = proMaxActive ? 'max' : 'rare'
        shuffleProAutomatic = true
        shuffleStreakRef.current = 0
        proComboStreakRef.current = 0
      } else if (!premiumVariant && nextStreak >= 10 && Math.random() < 0.05) {
        premiumVariant = 'rare'
        shuffleProAutomatic = true
        shuffleStreakRef.current = 0
      } else {
        if (countAction) {
          shuffleStreakRef.current = nextStreak
          proComboStreakRef.current = nextCombo
        }
      }
      setPremiumSuggestion(
        premiumVariant ? { movieId: movie.id, variant: premiumVariant } : null,
      )
      setDetailsMovieId(null)
      setFilterOpen(false)
      setAboutOpen(false)
      setSpinRequest({
        itemId: movie.id,
        nonce: performance.now(),
        shuffleProAutomatic,
        shuffleProAutomaticVariant: shuffleProAutomatic
          ? premiumVariant
          : undefined,
      })
    },
    [activeMovieId, detailsMovieId, mode, proMaxActive, visibleMovies],
  )

  const handleSpinGestureEnd = useCallback(
    (kind: 'quick' | 'hold' | null) => {
      shuffleStreakRef.current = 0
      if (!kind) {
        proComboStreakRef.current = 0
        quickSpinStreakRef.current = 0
        return
      }
      proComboStreakRef.current += 1
      if (kind === 'quick') quickSpinStreakRef.current += 1
      else quickSpinStreakRef.current = 0

      const quickSpinTarget = proMaxActive ? 3 : 5
      const comboTarget = proMaxActive ? 6 : 10
      if (
        quickSpinStreakRef.current >= quickSpinTarget ||
        proComboStreakRef.current >= comboTarget
      ) {
        const variant: ShuffleProVariant = proMaxActive ? 'max' : 'rare'
        proComboStreakRef.current = 0
        quickSpinStreakRef.current = 0
        shuffleStreakRef.current = 0
        handleShuffle({
          premiumVariant: variant,
          automatic: true,
          countAction: false,
        })
      }
    },
    [handleShuffle, proMaxActive],
  )

  const handleShuffleProPhase = useCallback(
    (phase: ShuffleProPhase | null, variant?: ShuffleProVariant) => {
      setShuffleProPresentation(phase && variant ? { phase, variant } : null)
    },
    [],
  )

  const handleShuffleProRelease = useCallback(
    (transitioned: boolean, variant: ShuffleProVariant) => {
      setShuffleProPresentation(null)
      handleShuffle(transitioned ? { premiumVariant: variant } : undefined)
    },
    [handleShuffle],
  )

  useEffect(() => {
    const resetStreakForOtherActions = (event: Event) => {
      if (event.type === 'pointerdown') {
        const target = event.target
        const pointerEvent = event as PointerEvent
        if (
          target instanceof Element &&
          target.closest('[data-shuffle-action]')
        ) {
          return
        }
        if (
          target instanceof Element &&
          target.closest('.warp-infinite-menu-canvas') &&
          (pointerEvent.pointerType !== 'mouse' || pointerEvent.button === 0)
        ) {
          return
        }
      }
      resetShuffleStreak()
    }

    document.addEventListener('pointerdown', resetStreakForOtherActions, true)
    document.addEventListener('wheel', resetStreakForOtherActions, true)
    return () => {
      document.removeEventListener(
        'pointerdown',
        resetStreakForOtherActions,
        true,
      )
      document.removeEventListener('wheel', resetStreakForOtherActions, true)
    }
  }, [resetShuffleStreak])

  const handlePickRandomMovie = useCallback((movie: TestMovie) => {
    setActiveMovieId(movie.id)
    setFilterOpen(false)
    setAboutOpen(false)
    setDetailsMovieId(
      reopenDetailsAfterListShuffleRef.current ? movie.id : null,
    )
    setPremiumSuggestion(null)
    reopenDetailsAfterListShuffleRef.current = false
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSpace = event.code === 'Space' || event.key === ' '
      const isEnter = event.key === 'Enter'
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('[data-shuffle-action]')
      ) {
        return
      }
      if (!isSpace && !isEnter) {
        shuffleStreakRef.current = 0
        return
      }
      const action = isSpace ? 'shuffle' : 'open'
      const allowed = shouldHandleGalleryKey({
        key: action,
        mode,
        galleryReady: initialGalleryReady,
        overlayOpen: Boolean(
          watchMovieId || aboutOpen || filterOpen || sortOpen,
        ),
        detailsOpen: Boolean(detailsMovieId),
        hasTarget:
          action === 'open'
            ? Boolean(activeMovie)
            : mode === 'list'
              ? listMovies.length > 0
              : visibleMovies.length > 0,
        repeat: event.repeat,
        hasModifier:
          event.ctrlKey || event.altKey || event.metaKey || event.shiftKey,
        activeElementKind: getActiveElementKind(),
      })
      if (!allowed) {
        shuffleStreakRef.current = 0
        return
      }
      if (action !== 'shuffle') shuffleStreakRef.current = 0
      event.preventDefault()
      if (action === 'shuffle') {
        handleShuffle()
      } else if (activeMovie) handleOpenMovie(activeMovie)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    aboutOpen,
    activeMovie,
    detailsMovieId,
    filterOpen,
    handleOpenMovie,
    handleShuffle,
    initialGalleryReady,
    listMovies.length,
    mode,
    sortOpen,
    visibleMovies.length,
    watchMovieId,
  ])

  return (
    <main
      ref={shellRef}
      className='phantom-test-shell warp-shell min-h-dvh overflow-hidden bg-black text-white'
      onPointerDownCapture={(event) => maybePromptFullscreenHint(event.target)}
      onClickCapture={(event) => maybePromptFullscreenHint(event.target)}
      onWheelCapture={(event) => maybePromptFullscreenHint(event.target)}
      onKeyDownCapture={(event) => {
        if (
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(
            event.key,
          )
        ) {
          maybePromptFullscreenHint(event.target)
        }
      }}
      data-details-open={detailsPresence.isPresent ? 'true' : 'false'}
      data-filter-open={filterPresence.isPresent ? 'true' : 'false'}
      data-gallery-ready={initialGalleryReady ? 'true' : 'false'}
      data-mode={mode}
      data-theme={theme}
      data-shuffle-pro-phase={shuffleProPresentation?.phase}
      data-shuffle-pro-variant={shuffleProPresentation?.variant}
      data-immersive={isFullscreenActive ? 'true' : 'false'}
    >
      {isMobileViewport && mode === 'wall' && !detailsMovieId ? (
        <div className='warp-fullscreen-control'>
          <button
            type='button'
            className='warp-fullscreen-button'
            aria-label={
              isFullscreenActive ? 'Exit full screen' : 'Go full screen'
            }
            aria-pressed={isFullscreenActive}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreenActive ? (
              <Minimize2 aria-hidden='true' size={18} />
            ) : (
              <Maximize2 aria-hidden='true' size={18} />
            )}
          </button>
          {showFullscreenHint ? (
            <span className='warp-fullscreen-tip' role='tooltip'>
              Go full screen for maximum immersion
            </span>
          ) : null}
        </div>
      ) : null}
      <output className='warp-shuffle-pro-announcement' aria-live='polite'>
        {shuffleProPresentation?.phase === 'transition'
          ? shuffleProPresentation.variant === 'rare'
            ? 'The stars have chosen your pick.'
            : shuffleProPresentation.variant === 'max'
              ? 'Release to reveal your Shuffle Pro Max pick.'
              : 'Release to reveal your Shuffle Pro pick.'
          : ''}
      </output>
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
        onUserSpin={handleUserSpin}
        spinRequest={spinRequest}
        onShuffleProPhase={handleShuffleProPhase}
        onShuffleProRelease={handleShuffleProRelease}
        onNonShuffleInteraction={resetShuffleStreak}
        onSpinGestureEnd={handleSpinGestureEnd}
        isShuffleProMax={proMaxActive}
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
          searchResultCount={listMovies.length}
          onOpenMovie={handleOpenMovie}
          onPickRandomMovie={handlePickRandomMovie}
          onSearchQueryChange={setListSearchQuery}
          onSelectMovie={handleSelectMovie}
        />
      ) : null}

      {mode === 'filters' ? (
        <FiltersView
          {...filterSectionProps}
          resultCount={filteredMovies.length}
          selectedFilterCount={selectedFilterCount}
        />
      ) : null}

      <WarpChrome
        activeMovie={activeMovie}
        watchOpen={Boolean(watchMovieId)}
        mode={mode}
        movieCount={movies.length}
        selectedFilterCount={selectedFilterCount}
        timeLabel={timeLabel}
        onClearFilters={clearAllFilters}
        onOpenActiveMovie={() => {
          if (activeMovie) handleOpenWatchLinks(activeMovie)
        }}
        onOpenFilters={() => {
          startTransition(() => setMode('filters'))
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
          // The index and filters pages build thousands of nodes, so they
          // render as an interruptible update; the wall is cheap and stays
          // immediate.
          if (nextMode === 'wall') setMode(nextMode)
          else startTransition(() => setMode(nextMode))
        }}
        dockTop={
          mode === 'wall' ? (
            <>
              {initialGalleryReady && !spinHintSeen && !detailsMovieId ? (
                <div
                  className='warp-spin-hint max-[900px]:hidden'
                  role='note'
                  aria-label='Use the up, down, left, and right arrow keys to scroll. Hit Spacebar to shuffle, Escape to cancel or return, and Enter to select.'
                >
                  <span className='warp-spin-hint-pointer'>
                    Use{' '}
                    <kbd
                      aria-label='Up arrow'
                      className='inline-grid align-middle'
                    >
                      <ArrowUp aria-hidden='true' size={12} strokeWidth={2.8} />
                    </kbd>{' '}
                    and{' '}
                    <kbd
                      aria-label='Down arrow'
                      className='inline-grid align-middle'
                    >
                      <ArrowDown
                        aria-hidden='true'
                        size={12}
                        strokeWidth={2.8}
                      />
                    </kbd>
                    ,{' '}
                    <kbd
                      aria-label='Left arrow'
                      className='inline-grid align-middle'
                    >
                      <ArrowLeft
                        aria-hidden='true'
                        size={12}
                        strokeWidth={2.8}
                      />
                    </kbd>{' '}
                    and{' '}
                    <kbd
                      aria-label='Right arrow'
                      className='inline-grid align-middle'
                    >
                      <ArrowRight
                        aria-hidden='true'
                        size={12}
                        strokeWidth={2.8}
                      />
                    </kbd>{' '}
                    to scroll. Hit{' '}
                    <kbd className='is-wide inline-grid align-middle'>
                      Spacebar
                    </kbd>{' '}
                    to shuffle,{' '}
                    <kbd className='inline-grid align-middle'>Esc</kbd> to
                    cancel/return and{' '}
                    <kbd className='inline-grid align-middle'>Enter</kbd> to
                    select.
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
                data-shuffle-action
                aria-label='Jump to a random movie in the index'
                disabled={!listMovies.length}
                onClick={() => handleShuffle()}
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
                data-shuffle-action
                aria-label='Shuffle to a random movie'
                disabled={!visibleMovies.length}
                onClick={() => handleShuffle()}
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
                    <>
                      <SlidersHorizontal
                        className='warp-filter-icon'
                        aria-hidden='true'
                      />
                      <span className='warp-filter-label'>Filters</span>
                      {selectedFilterCount ? (
                        <span className='warp-filter-count'>
                          {selectedFilterCount}
                        </span>
                      ) : null}
                    </>
                  )}
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
              Skip first time load
            </button>
            <em>Images will load in the background</em>
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
          onReset={() => setSortRules([{ key: 'alpha', direction: 'asc' }])}
          onToggle={(key) =>
            setSortRules((rules) => applySortToggle(rules, key))
          }
        />
      ) : null}

      {filterPresence.isPresent ? (
        <FilterPanel
          {...filterSectionProps}
          broadened={decisionFilterResult.broadened}
          motionPhase={filterPresence.motionPhase}
          resultCount={filteredMovies.length}
          strictResultCount={decisionFilterResult.strictCount}
        />
      ) : null}

      {aboutPresence.isPresent ? (
        <AboutDrawer
          movieCount={movies.length}
          theme={theme}
          onThemeChange={changeTheme}
          genreCount={genreSummaries.length}
          globeCount={visibleMovies.length}
          maximized={aboutMaximized}
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
          premiumVariant={
            premiumSuggestion?.movieId === detailsPresence.value.id
              ? premiumSuggestion.variant
              : null
          }
          onClose={() => {
            setDetailsMovieId(null)
            setPremiumSuggestion(null)
          }}
          onOpenMovie={handleOpenMovie}
          onWatch={handleOpenWatchLinks}
          onApplyFilter={handleApplyCardFilter}
          onNextSuggestion={handleShuffle}
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
  spinRequest: {
    itemId: string
    nonce: number
    shuffleProAutomatic?: boolean
    shuffleProAutomaticVariant?: ShuffleProVariant
  } | null
  onShuffleProPhase: (
    phase: ShuffleProPhase | null,
    variant?: ShuffleProVariant,
  ) => void
  onShuffleProRelease: (
    transitioned: boolean,
    variant: ShuffleProVariant,
  ) => void
  onNonShuffleInteraction: () => void
  onSpinGestureEnd: (kind: 'quick' | 'hold' | null) => void
  isShuffleProMax: boolean
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
  onShuffleProPhase,
  onShuffleProRelease,
  onNonShuffleInteraction,
  onSpinGestureEnd,
  isShuffleProMax,
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
        onShuffleProPhase={onShuffleProPhase}
        onShuffleProRelease={onShuffleProRelease}
        onNonShuffleInteraction={onNonShuffleInteraction}
        onSpinGestureEnd={onSpinGestureEnd}
        isShuffleProMax={isShuffleProMax}
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
  onOpenMovie: (movie: TestMovie) => void
  onPickRandomMovie: (movie: TestMovie) => void
  onSearchQueryChange: (searchQuery: string) => void
  onSelectMovie: (movie: TestMovie) => void
}

// The index can hold tens of thousands of films, so rows render in chunks as
// they near the viewport. A chunk not yet rendered keeps its estimated height
// (--warp-list-row-estimate) so the scrollbar and group heights stay right.
const LIST_CHUNK_SIZE = 20
const LIST_EAGER_ROWS = 40

const chunkRows = <T,>(rows: T[]) => {
  const chunks: T[][] = []
  for (let start = 0; start < rows.length; start += LIST_CHUNK_SIZE) {
    chunks.push(rows.slice(start, start + LIST_CHUNK_SIZE))
  }
  return chunks
}

type ListRowChunkProps = {
  // The film that is active or pulsing, only passed to the chunk holding it,
  // so a hover re-renders one chunk instead of every row on screen.
  activeMovieId: string | null
  eager: boolean
  forceVisible: boolean
  isCollapsed: boolean
  randomPulseId: string | null
  rows: TestMovie[]
  onHoverMovie: (movie: TestMovie) => void
  onOpenMovie: (movie: TestMovie) => void
  onSelectMovie: (movie: TestMovie) => void
}

// How far past the viewport a chunk keeps its rows. Beyond it the rows are
// dropped and the chunk keeps its measured height, so the DOM (and every
// hover, sort and search that touches it) stays a few hundred rows however
// far the index has been scrolled.
const LIST_CHUNK_MARGIN = '1600px 0px'
// Phones paint rows more slowly, so they keep fewer of them around.
const LIST_CHUNK_MARGIN_NARROW = '1000px 0px'

type ChunkWatcher = {
  callbacks: Map<Element, (isIntersecting: boolean) => void>
  observer: IntersectionObserver
}
const chunkWatchers = new WeakMap<Element, Map<string, ChunkWatcher>>()

// One observer per list and margin, however many chunks it holds: hundreds of
// observers made opening the index measurably slower on phones.
const watchChunk = (
  chunk: HTMLElement,
  root: Element,
  margin: string,
  onChange: (isIntersecting: boolean) => void,
) => {
  let byMargin = chunkWatchers.get(root)
  if (!byMargin) {
    byMargin = new Map()
    chunkWatchers.set(root, byMargin)
  }
  let watcher = byMargin.get(margin)
  if (!watcher) {
    const callbacks = new Map<Element, (isIntersecting: boolean) => void>()
    const observer = new IntersectionObserver(
      (entries) => {
        // Only the latest entry per chunk matters.
        const latest = new Map<Element, boolean>()
        for (const entry of entries)
          latest.set(entry.target, entry.isIntersecting)
        for (const [target, isIntersecting] of latest)
          callbacks.get(target)?.(isIntersecting)
      },
      { root, rootMargin: margin },
    )
    watcher = { callbacks, observer }
    byMargin.set(margin, watcher)
  }
  const { callbacks, observer } = watcher
  callbacks.set(chunk, onChange)
  observer.observe(chunk)
  return () => {
    callbacks.delete(chunk)
    observer.unobserve(chunk)
  }
}

const ListRowChunk = memo(
  ({
    activeMovieId,
    eager,
    forceVisible,
    isCollapsed,
    randomPulseId,
    rows,
    onHoverMovie,
    onOpenMovie,
    onSelectMovie,
  }: ListRowChunkProps) => {
    const chunkRef = useRef<HTMLDivElement | null>(null)
    const measuredHeight = useRef<number | null>(null)
    const [isNear, setIsNear] = useState(false)
    const shouldRender = eager || forceVisible || isNear

    // Kept in a ref so the observer callback sees whether rows are mounted.
    const renderedRef = useRef(shouldRender)
    renderedRef.current = shouldRender

    useEffect(() => {
      const chunk = chunkRef.current
      if (!chunk || eager) return
      if (typeof IntersectionObserver === 'undefined') {
        setIsNear(true)
        return
      }
      const root = chunk.closest('.warp-list')
      if (!root) {
        setIsNear(true)
        return
      }
      return watchChunk(
        chunk,
        root,
        window.matchMedia('(max-width: 900px)').matches
          ? LIST_CHUNK_MARGIN_NARROW
          : LIST_CHUNK_MARGIN,
        (isIntersecting) => {
          if (isIntersecting) {
            // Mounting a chunk is interruptible, so a fast flick never blocks.
            startTransition(() => setIsNear(true))
            return
          }
          if (renderedRef.current) measuredHeight.current = chunk.offsetHeight
          setIsNear(false)
        },
      )
    }, [eager])

    return (
      <div
        ref={chunkRef}
        className={cn(
          'warp-list-chunk',
          !shouldRender && 'warp-list-chunk-placeholder',
        )}
        aria-hidden={shouldRender ? undefined : true}
        style={
          shouldRender
            ? undefined
            : ({
                '--chunk-row-count': rows.length,
                ...(measuredHeight.current
                  ? { height: measuredHeight.current }
                  : null),
              } as CSSProperties)
        }
      >
        {shouldRender
          ? rows.map((movie) => (
              <ListRow
                key={movie.id}
                isActive={activeMovieId === movie.id}
                isCollapsed={isCollapsed}
                isRandomPulse={randomPulseId === movie.id}
                movie={movie}
                onHoverMovie={onHoverMovie}
                onOpenMovie={onOpenMovie}
                onSelectMovie={onSelectMovie}
              />
            ))
          : null}
      </div>
    )
  },
)

type ListRowProps = {
  isActive: boolean
  isCollapsed: boolean
  isRandomPulse: boolean
  movie: TestMovie
  onHoverMovie: (movie: TestMovie) => void
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
    onHoverMovie,
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
      onMouseEnter={() => onHoverMovie(movie)}
    >
      <span className='warp-list-row-poster' aria-hidden='true'>
        <MoviePoster movie={movie} size='list' />
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

  // Rows pass under a resting cursor while the list scrolls, and each one
  // would otherwise become the active film and re-render the app. Hover only
  // counts once the list has settled, and renders as an interruptible update.
  const isScrollingRef = useRef(false)
  const scrollTimerRef = useRef<number | null>(null)
  const handleScroll = () => {
    isScrollingRef.current = true
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = window.setTimeout(() => {
      isScrollingRef.current = false
    }, 160)
  }
  const handleHoverMovie = useCallback(
    (movie: TestMovie) => {
      if (isScrollingRef.current) return
      startTransition(() => onSelectMovie(movie))
    },
    [onSelectMovie],
  )
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const groupedMovies = useMemo(
    () =>
      Object.entries(groupMoviesForList(movies, grouping)).sort(
        ([groupA], [groupB]) =>
          compareListGroups(groupA, groupB, grouping, groupDirection),
      ),
    [groupDirection, grouping, movies],
  )
  const popularityGroups = useMemo(
    () => (grouping === 'popularity' ? getPopularityGroups(movies) : undefined),
    [grouping, movies],
  )

  // Chunked once per list, so a chunk's rows stay the same array between
  // renders and its memo holds.
  const groupedChunks = useMemo(
    () =>
      groupedMovies.map(([group, groupMovies]) => ({
        group,
        count: groupMovies.length,
        chunks: chunkRows(groupMovies),
      })),
    [groupedMovies],
  )
  const chunkKeyByMovieId = useMemo(() => {
    const keys = new Map<string, string>()
    for (const { group, chunks } of groupedChunks) {
      chunks.forEach((chunk, chunkIndex) => {
        const key = `${group}:${chunkIndex}`
        for (const movie of chunk) keys.set(movie.id, key)
      })
    }
    return keys
  }, [groupedChunks])
  const activeChunkKey = activeMovieId
    ? chunkKeyByMovieId.get(activeMovieId)
    : undefined
  const pulseChunkKey = randomPulseId
    ? chunkKeyByMovieId.get(randomPulseId)
    : undefined

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
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current)
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

    const movieGroup = getMovieListGroupKey(movie, grouping, popularityGroups)
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
    <section
      className='warp-list'
      aria-label='Movie list view'
      onScroll={handleScroll}
    >
      <header className='warp-list-heading'>
        <div className='warp-list-title'>
          <h1>Movie Index</h1>
          <p>
            {loadState !== 'ready'
              ? loadState
              : searchQuery.trim()
                ? `${searchResultCount.toLocaleString()} title matches`
                : `${movies.length.toLocaleString()} movies to choose from`}
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
          {groupedChunks.map(({ group, count, chunks }) => {
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
                    <h2>
                      {group === 'Rest'
                        ? 'The rest'
                        : group === '2023'
                          ? '2023+'
                          : group}
                    </h2>
                    <small>
                      {count} {count === 1 ? 'title' : 'titles'}
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
                  style={{ '--group-row-count': count } as CSSProperties}
                >
                  {chunks.map((chunk, chunkIndex) => {
                    const chunkKey = `${group}:${chunkIndex}`
                    return (
                      <ListRowChunk
                        key={chunk[0]?.id ?? chunkIndex}
                        activeMovieId={
                          activeChunkKey === chunkKey ? activeMovieId : null
                        }
                        eager={eagerChunkKeys.has(chunkKey)}
                        forceVisible={pulseChunkKey === chunkKey}
                        isCollapsed={isCollapsed}
                        randomPulseId={
                          pulseChunkKey === chunkKey ? randomPulseId : null
                        }
                        rows={chunk}
                        onHoverMovie={handleHoverMovie}
                        onOpenMovie={onOpenMovie}
                        onSelectMovie={onSelectMovie}
                      />
                    )
                  })}
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
  onClearFilters: () => void
  onOpenFilters: () => void
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
  onClearFilters,
  onOpenFilters,
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
        disabled={mode !== 'filters' && !activeMovie}
        onClick={
          mode === 'filters' ? () => onModeChange('wall') : onOpenActiveMovie
        }
      >
        {mode === 'filters' ? 'Home' : "Let's Watch"}
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
            aria-pressed={mode === 'list' || mode === 'filters'}
            onClick={() => onModeChange('list')}
          >
            <span className='warp-list-icon' />
            <span className='warp-mode-label'>Index</span>
          </button>
        </nav>

        {dockLead}
        {/* Gallery: Watch opens the watch options for the current film. Index:
            Filters, which reads Back while the filters page is open. About lives
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
            <>
              <button
                type='button'
                className={cn(mode === 'filters' && 'is-active')}
                aria-pressed={mode === 'filters'}
                onClick={
                  mode === 'filters'
                    ? () => onModeChange('list')
                    : onOpenFilters
                }
              >
                {mode === 'filters' ? 'Back' : 'Filters'}
                {mode !== 'filters' && selectedFilterCount ? (
                  <span>{selectedFilterCount}</span>
                ) : null}
              </button>
              {mode === 'filters' && selectedFilterCount > 0 ? (
                <button
                  type='button'
                  className='warp-nav-clear'
                  onClick={onClearFilters}
                >
                  Clear
                </button>
              ) : null}
            </>
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
    rules[0].key === 'alpha' &&
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
          : 'Select multiple to stack'}
      </p>
    </section>
  )
}

type FilterSectionsProps = {
  allActive: boolean
  contentFilter: ContentFilter
  decades: number[]
  genres: GenreSummary[]
  ratingMin: number | null
  runtimeFilter: RuntimeFilter | null
  selectedGenres: string[]
  selectedMoodFilters: MoodFilter[]
  selectedYear: YearFilter | null
  onClear: () => void
  onSelectContentFilter: (contentFilter: ContentFilter) => void
  onToggleGenre: (genre: string) => void
  onToggleMoodFilter: (moodFilter: MoodFilter) => void
  onToggleRating: (min: number) => void
  onToggleRuntimeFilter: (runtimeFilter: RuntimeFilter) => void
  onToggleYear: (year: YearFilter) => void
}

// Shared by the gallery popover and the Filters page so both stay in step.
const FilterSections = ({
  allActive,
  contentFilter,
  decades,
  genres,
  ratingMin,
  runtimeFilter,
  selectedGenres,
  selectedMoodFilters,
  selectedYear,
  onClear,
  onSelectContentFilter,
  onToggleGenre,
  onToggleMoodFilter,
  onToggleRating,
  onToggleRuntimeFilter,
  onToggleYear,
}: FilterSectionsProps) => {
  const ratingOptions = [...RATING_PRESETS]
  if (ratingMin !== null && !ratingOptions.includes(ratingMin)) {
    ratingOptions.push(ratingMin)
    ratingOptions.sort((a, b) => a - b)
  }

  return (
    <>
      <section className='warp-fs-section' data-section='content'>
        <p>Content type</p>
        <div className='warp-fs-chips'>
          {CONTENT_FILTERS.map((filter) => (
            <button
              type='button'
              className={cn(
                'warp-fs-chip',
                contentFilter === filter.id &&
                  (filter.id !== 'all' || allActive) &&
                  'is-active',
                filter.disabled && 'is-disabled',
              )}
              key={filter.id}
              aria-disabled={filter.disabled || undefined}
              aria-pressed={contentFilter === filter.id}
              disabled={filter.disabled}
              title={filter.disabled ? filter.meta : undefined}
              onClick={() =>
                filter.id === 'all'
                  ? onClear()
                  : onSelectContentFilter(filter.id)
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
      </section>
      <section className='warp-fs-section'>
        <p>{contentFilter === 'series' ? 'Episode runtime' : 'Runtime'}</p>
        <div className='warp-fs-chips'>
          {(contentFilter === 'series'
            ? SERIES_RUNTIME_FILTERS
            : MOVIE_RUNTIME_FILTERS
          ).map((filter) => (
            <button
              type='button'
              className={cn(
                'warp-fs-chip',
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
      </section>
      <section className='warp-fs-section'>
        <p>Year</p>
        <div className='warp-fs-chips'>
          {selectedYear?.kind === 'year' ? (
            <button
              type='button'
              className='warp-fs-chip is-active'
              aria-pressed='true'
              onClick={() => onToggleYear(selectedYear)}
            >
              <span>{selectedYear.value}</span>
            </button>
          ) : null}
          {decades.map((decade) => {
            const active =
              selectedYear?.kind === 'decade' && selectedYear.value === decade
            return (
              <button
                type='button'
                className={cn('warp-fs-chip', active && 'is-active')}
                key={decade}
                aria-pressed={active}
                onClick={() => onToggleYear({ kind: 'decade', value: decade })}
              >
                <span>{decade}s</span>
              </button>
            )
          })}
        </div>
      </section>
      <section className='warp-fs-section'>
        <p>Rating</p>
        <div className='warp-fs-chips'>
          {ratingOptions.map((min) => (
            <button
              type='button'
              className={cn('warp-fs-chip', ratingMin === min && 'is-active')}
              key={min}
              aria-pressed={ratingMin === min}
              onClick={() => onToggleRating(min)}
            >
              <span>{formatRatingMin(min)}</span>
            </button>
          ))}
        </div>
      </section>
      <section className='warp-fs-section'>
        <p>Mood</p>
        <div className='warp-fs-chips'>
          {MOOD_FILTERS.map((filter) => (
            <button
              type='button'
              className={cn(
                'warp-fs-chip',
                selectedMoodFilters.includes(filter.id) && 'is-active',
              )}
              key={filter.id}
              aria-pressed={selectedMoodFilters.includes(filter.id)}
              onClick={() => onToggleMoodFilter(filter.id)}
            >
              <span>{filter.label}</span>
            </button>
          ))}
        </div>
      </section>
      <section className='warp-fs-section' data-section='genres'>
        <p>Genres</p>
        <small>The more the merrier</small>
        <div className='warp-fs-chips'>
          {genres.map(({ genre, count }) => {
            const active =
              !selectedGenres.length || selectedGenres.includes(genre)
            return (
              <button
                type='button'
                className={cn('warp-fs-chip', active && 'is-active')}
                key={genre}
                aria-pressed={active}
                onClick={() => onToggleGenre(genre)}
              >
                <span>{genre}</span>
                <span>{count}</span>
              </button>
            )
          })}
        </div>
      </section>
    </>
  )
}

type FilterPanelProps = FilterSectionsProps & {
  broadened: boolean
  motionPhase: MotionPhase
  resultCount: number
  strictResultCount: number
}

const FilterPanel = ({
  broadened,
  motionPhase,
  resultCount,
  strictResultCount,
  ...sections
}: FilterPanelProps) => (
  <aside className='warp-filter-panel' data-motion={motionPhase}>
    <div className='warp-filter-panel-heading'>
      <p>Add filters</p>
      <span>
        {resultCount} {broadened ? 'broadened' : 'matches'}
      </span>
    </div>
    {broadened ? (
      <p className='warp-filter-note'>
        Broadened from {strictResultCount} exact matches to keep the wall full.
      </p>
    ) : null}
    <FilterSections {...sections} />
  </aside>
)

type FiltersViewProps = FilterSectionsProps & {
  resultCount: number
  selectedFilterCount: number
}

const FiltersView = ({
  resultCount,
  selectedFilterCount,
  ...sections
}: FiltersViewProps) => (
  <section className='warp-filters-view' aria-label='Filters'>
    <header>
      <div>
        <h1>Filters</h1>
        <p>Narrow the wall by runtime, year, rating, mood and genre.</p>
      </div>
      {selectedFilterCount > 0 ? (
        <button
          type='button'
          className='warp-filters-clear'
          onClick={sections.onClear}
        >
          Clear
        </button>
      ) : null}
    </header>
    <div className='warp-filters-summary'>
      <span>{selectedFilterCount || 'No'} selected</span>
      <span>{resultCount} matching movies</span>
    </div>
    <div className='warp-filters-body'>
      <FilterSections {...sections} />
    </div>
  </section>
)

// "10k+" for the copy; the exact figure shows where there is room for it.
export const formatFilmCount = (count: number) =>
  count >= 1000 ? `${Math.floor(count / 1000)}k+` : String(count)

type AboutDrawerProps = {
  theme: Theme
  movieCount: number
  onThemeChange: (theme: Theme) => void
  genreCount: number
  globeCount: number
  maximized: boolean
  motionPhase: MotionPhase
  onClose: () => void
  onToggleMaximized: () => void
}

const AboutControls = () => (
  <div className='warp-about-control-sets'>
    <ul className='warp-about-controls is-desktop-controls'>
      <li>
        <span className='warp-about-keys'>
          <kbd>Click</kbd>
        </span>
        <span>Open a poster</span>
      </li>
      <li>
        <span className='warp-about-keys'>
          <kbd>Hold or drag</kbd>
        </span>
        <span>Spin the globe</span>
      </li>
      <li>
        <span className='warp-about-keys'>
          <kbd>Scroll or use arrow keys</kbd>
        </span>
        <span>Spin without grabbing</span>
      </li>
      <li>
        <span className='warp-about-keys'>
          <kbd>Shuffle</kbd>
        </span>
        <span>Land on a random film</span>
      </li>
    </ul>
    <ul className='warp-about-controls is-mobile-controls'>
      <li>
        <span className='warp-about-keys'>
          <kbd>Tap</kbd>
        </span>
        <span>Open a poster</span>
      </li>
      <li>
        <span className='warp-about-keys'>
          <kbd>Hold or drag</kbd>
        </span>
        <span>Spin the globe</span>
      </li>
      <li>
        <span className='warp-about-keys'>
          <kbd>Swipe</kbd>
        </span>
        <span>Quick spin</span>
      </li>
      <li>
        <span className='warp-about-keys'>
          <kbd>Shuffle</kbd>
        </span>
        <span>Land on a random film</span>
      </li>
    </ul>
  </div>
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
  movieCount,
  onThemeChange,
  genreCount,
  globeCount,
  maximized,
  motionPhase,
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
            {formatFilmCount(movieCount)} movies, Roll the dice. Nothing’s more
            annoying than trying to relax and still being stuck choosing a movie
            20 minutes later and prolly more frustrated than before (I’m looking
            at you, Netflix). This is an attempt to make picking a movie a
            little less annoying.
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
            Wonder why I went with that exact number? 🌚
            <br />
            See if you can find the easter egg.
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
            Links are a work in progress and are disabled for now. You can find
            any movie seen here with a quick Google search.
          </p>
        </section>

        <section className='warp-about-section'>
          <h3>Credits</h3>
          <p>
            Carefully put together by my humble self -{' '}
            <a href='https://kingsleyaremu.vercel.app/'>ICE</a>.
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
            {formatFilmCount(movieCount)} films on a globe you can spin, filter
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

type MovieCardFilter =
  | { kind: 'year'; year: number }
  | { kind: 'rating'; min: number }
  | { kind: 'runtime'; id: RuntimeFilter }
  | { kind: 'genre'; genre: string }

type MovieDetailsCardProps = {
  movies: TestMovie[]
  motionPhase: MotionPhase
  movie: TestMovie
  premiumVariant: ShuffleProVariant | null
  onClose: () => void
  onOpenMovie: (movie: TestMovie) => void
  onApplyFilter: (filter: MovieCardFilter) => void
  onNextSuggestion: () => void
  onWatch: (movie: TestMovie) => void
}

const MovieDetailsCard = ({
  movies,
  motionPhase,
  movie,
  premiumVariant,
  onClose,
  onOpenMovie,
  onApplyFilter,
  onNextSuggestion,
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
  const yearNumber = Number.parseInt(movie.year, 10)
  const runtimeBucket = getRuntimeBucket(movie.runtimeMinutes)
  const runtimeLabel = formatRuntimeLabel(movie)
  const ratingValue = movie.ratingValue
  const hasYear = Boolean(movie.year) && movie.year !== '----'
  const stats: ReactNode[] = []
  if (hasYear) {
    stats.push(
      Number.isFinite(yearNumber) ? (
        <FilterTag
          key='year'
          onClick={() => onApplyFilter({ kind: 'year', year: yearNumber })}
        >
          {movie.year}
        </FilterTag>
      ) : (
        <span key='year'>{movie.year}</span>
      ),
    )
  }
  stats.push(
    ratingValue === null ? (
      <span key='rating'>★ {formatRating(movie)}</span>
    ) : (
      <FilterTag
        key='rating'
        onClick={() => onApplyFilter({ kind: 'rating', min: ratingValue })}
      >
        ★ {formatRating(movie)}
      </FilterTag>
    ),
  )
  if (runtimeLabel) {
    stats.push(
      runtimeBucket ? (
        <FilterTag
          key='runtime'
          onClick={() => onApplyFilter({ kind: 'runtime', id: runtimeBucket })}
        >
          {runtimeLabel}
        </FilterTag>
      ) : (
        <span key='runtime'>{runtimeLabel}</span>
      ),
    )
  }
  if (movie.countries)
    stats.push(<span key='countries'>{movie.countries}</span>)
  const nextSuggestionButton = (
    <button
      type='button'
      className='warp-details-next'
      data-shuffle-action
      onClick={onNextSuggestion}
    >
      <Dices aria-hidden='true' size={15} strokeWidth={2.4} />
      Re-shuffle
    </button>
  )
  const mobileReshuffleButton = (
    <button
      type='button'
      className='warp-details-next warp-details-next-mobile'
      data-shuffle-action
      aria-label='Re-shuffle to another movie'
      onClick={onNextSuggestion}
    >
      <Dices aria-hidden='true' size={15} strokeWidth={2.4} />
      Re-shuffle
    </button>
  )
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
    <TooltipProvider delayDuration={300}>
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
            premiumVariant && 'is-premium',
            isExpanded && 'is-expanded',
            dragOffset !== 0 && 'is-dragging',
          )}
          style={detailsStyle}
          aria-modal='true'
          data-snap={isExpanded ? 'expanded' : 'compact'}
          data-premium-variant={premiumVariant ?? undefined}
        >
          <span className='warp-details-ambient' aria-hidden='true' />
          {premiumVariant ? (
            <span className='warp-details-premium-badge'>
              <span aria-hidden='true'>✦</span>
              {premiumVariant === 'max' ? 'Shuffle Pro Max' : 'Shuffle Pro'}
              {premiumVariant === 'rare' ? ' · Rare' : ''}
            </span>
          ) : null}
          <button
            type='button'
            className='warp-details-close'
            aria-label='Close details'
            onClick={onClose}
          >
            <X aria-hidden='true' size={17} strokeWidth={3} />
          </button>
          {isWide ? null : mobileReshuffleButton}
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
          {isWide ? (
            <div className='warp-details-poster-col'>
              <div className='warp-details-poster'>
                <MoviePoster loading='eager' movie={movie} size='detail' />
              </div>
              {nextSuggestionButton}
            </div>
          ) : (
            <div className='warp-details-poster'>
              <MoviePoster loading='eager' movie={movie} size='detail' />
            </div>
          )}
          <div className='warp-details-copy'>
            <div className='warp-details-copy-scroll'>
              {stats.length ? (
                <div className='warp-details-stats'>
                  {stats.map((stat, index) => (
                    <Fragment key={(stat as { key: string }).key}>
                      {index ? (
                        <span
                          className='warp-details-stats-sep'
                          aria-hidden='true'
                        >
                          {' · '}
                        </span>
                      ) : null}
                      {stat}
                    </Fragment>
                  ))}
                </div>
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
                  <FilterTag
                    key={genre}
                    onClick={() => onApplyFilter({ kind: 'genre', genre })}
                  >
                    {genre}
                  </FilterTag>
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
    </TooltipProvider>
  )
}

const FilterTag = ({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button type='button' onClick={onClick}>
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent className='warp-details-tip' sideOffset={6}>
      Click to filter
    </TooltipContent>
  </Tooltip>
)
