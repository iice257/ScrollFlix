// Ranked search for the Index. It reads what every film already carries: its
// title (and original title), year, genres and country, plus its tagline and
// overview once those have loaded. Typos, partial words, a year beside a
// title ("dark knight 2008"), an origin ("korean horror") and a genre
// ("scary") all count, and the best matches come first.
//
// A query is split into words. Every word has to match something for a film to
// be listed; when nothing does, films that match most of the words are listed
// instead. The cheap checks (exact, prefix, substring) run over everything
// first; typo tolerance only runs when those find few films, so a typed query
// stays fast over the whole catalogue.
import type { TestMovie } from './catalog-loader'

export const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Words people type for a genre.
const GENRE_ALIASES: Record<string, string> = {
  scary: 'horror',
  creepy: 'horror',
  funny: 'comedy',
  comedies: 'comedy',
  romcom: 'romance',
  animated: 'animation',
  cartoon: 'animation',
  cartoons: 'animation',
  anime: 'animation',
  doc: 'documentary',
  docs: 'documentary',
  documentaries: 'documentary',
  kids: 'family',
  musical: 'music',
  scifi: 'science fiction',
  sci: 'science',
  thrillers: 'thriller',
  westerns: 'western',
  dramas: 'drama',
  horrors: 'horror',
}

// Words for where a film is from, and the countries they mean (in TMDB's
// names). A word that is already a country's name needs no entry.
const ORIGIN_WORDS: Record<string, string[]> = {
  american: ['united states of america'],
  hollywood: ['united states of america'],
  usa: ['united states of america'],
  us: ['united states of america'],
  british: ['united kingdom'],
  uk: ['united kingdom'],
  english: ['united kingdom'],
  french: ['france'],
  german: ['germany'],
  italian: ['italy'],
  spanish: ['spain'],
  russian: ['russia', 'soviet union'],
  swedish: ['sweden'],
  danish: ['denmark'],
  norwegian: ['norway'],
  polish: ['poland'],
  greek: ['greece'],
  turkish: ['turkey'],
  iranian: ['iran'],
  israeli: ['israel'],
  egyptian: ['egypt'],
  indian: ['india'],
  bollywood: ['india'],
  korean: ['south korea'],
  kdrama: ['south korea'],
  japanese: ['japan'],
  anime: ['japan'],
  chinese: ['china', 'hong kong', 'taiwan'],
  thai: ['thailand'],
  filipino: ['philippines'],
  indonesian: ['indonesia'],
  australian: ['australia'],
  canadian: ['canada'],
  mexican: ['mexico'],
  brazilian: ['brazil'],
  argentine: ['argentina'],
  argentinian: ['argentina'],
  colombian: ['colombia'],
  nigerian: ['nigeria'],
  nollywood: ['nigeria'],
  ghanaian: ['ghana'],
  kenyan: ['kenya'],
  african: [
    'nigeria',
    'south africa',
    'egypt',
    'kenya',
    'ghana',
    'morocco',
    'algeria',
    'tunisia',
    'senegal',
    'ethiopia',
  ],
  european: [
    'france',
    'united kingdom',
    'germany',
    'italy',
    'spain',
    'sweden',
    'denmark',
    'poland',
    'netherlands',
    'belgium',
  ],
}

type Prepared = {
  title: string
  titleWords: string[]
  originalWords: string[]
  genres: string[]
  country: string
  // Everything the cheap pre-check looks in, in one string.
  blob: string
}

const preparedCache = new WeakMap<TestMovie, Prepared>()
// Every title word seen so far, with how many films carry it: the dictionary
// typos are corrected against.
const vocabulary = new Map<string, number>()
let sortedVocabulary: string[] | null = null

const addToVocabulary = (words: readonly string[]) => {
  for (const word of words) {
    if (word.length < 4) continue
    const count = vocabulary.get(word)
    vocabulary.set(word, (count ?? 0) + 1)
    if (count === undefined) sortedVocabulary = null
  }
}

const prepare = (movie: TestMovie): Prepared => {
  const cached = preparedCache.get(movie)
  if (cached) return cached
  // `titleKey` is already lower case and unaccented; only punctuation is left.
  const title = movie.titleKey
    ? movie.titleKey
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : normalizeSearch(movie.title)
  const titleWords = title.split(' ')
  const originalWords = movie.originalTitle
    ? normalizeSearch(movie.originalTitle).split(' ')
    : []
  const genres = movie.genres.map((genre) => genre.toLowerCase())
  const country = movie.countries.toLowerCase()
  const prepared: Prepared = {
    title,
    titleWords,
    originalWords,
    genres,
    country,
    blob: `${title} ${originalWords.join(' ')} ${genres.join(' ')} ${country}`,
  }
  preparedCache.set(movie, prepared)
  addToVocabulary(titleWords)
  return prepared
}

const getSortedVocabulary = () => {
  sortedVocabulary ??= [...vocabulary.keys()].sort()
  return sortedVocabulary
}

// Does any known title word start with `word`?
const hasWordWithPrefix = (word: string) => {
  const sorted = getSortedVocabulary()
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (sorted[mid] < word) low = mid + 1
    else high = mid
  }
  return low < sorted.length && sorted[low].startsWith(word)
}

// Damerau-Levenshtein distance with a ceiling: stops as soon as every cell of
// a row is over `max`, returning max + 1.
export const editDistance = (a: string, b: string, max: number) => {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  let previous2: number[] = []
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, previous2[j - 2] + 1)
      }
      row.push(value)
      if (value < best) best = value
    }
    if (best > max) return max + 1
    previous2 = previous
    previous = row
  }
  return previous[b.length]
}

// How many typos a word of this length may carry.
const typoBudget = (length: number) => (length >= 8 ? 2 : length >= 4 ? 1 : 0)

// Known title words close to a word nothing starts with: the likely intent of
// a typo. Closest first, then the most common.
const MAX_CORRECTIONS = 8
const correctionsFor = (word: string) => {
  const budget = typoBudget(word.length)
  if (!budget) return []
  const found: { word: string; distance: number; count: number }[] = []
  for (const [candidate, count] of vocabulary) {
    if (Math.abs(candidate.length - word.length) > budget) continue
    const distance = editDistance(word, candidate, budget)
    if (distance <= budget) found.push({ word: candidate, distance, count })
  }
  return found
    .sort((a, b) => a.distance - b.distance || b.count - a.count)
    .slice(0, MAX_CORRECTIONS)
    .map((entry) => entry.word)
}

type Variant = { text: string; factor: number }

type QueryWord = {
  word: string
  variants: Variant[]
  // The genre or countries this word stands for, when it is one.
  genre: string | null
  countries: readonly string[] | null
  // Strings to look for in a film's blob before scoring it.
  needles: string[]
}

type Query = {
  words: QueryWord[]
  years: Set<number>
  decades: Set<number>
  phrase: string
}

const parseQuery = (raw: string): Query | null => {
  const normalized = normalizeSearch(raw)
  if (!normalized) return null
  const words: string[] = []
  const years = new Set<number>()
  const decades = new Set<number>()
  for (const word of normalized.split(' ')) {
    if (/^(18|19|20)\d{2}$/.test(word)) {
      years.add(Number(word))
      continue
    }
    const decade = /^((?:18|19|20)\d)0s$/.exec(word)
    if (decade) {
      decades.add(Number(decade[1]) * 10)
      continue
    }
    const shortDecade = /^(\d)0s$/.exec(word)
    if (shortDecade) {
      const digit = Number(shortDecade[1])
      decades.add(digit >= 3 ? 1900 + digit * 10 : 2000 + digit * 10)
      continue
    }
    words.push(word)
  }
  if (!words.length && !years.size && !decades.size) return null
  const queryWords = words.map((word): QueryWord => {
    const genre = GENRE_ALIASES[word] ?? null
    const countries = ORIGIN_WORDS[word] ?? null
    const variants: Variant[] = [{ text: word, factor: 1 }]
    const isFacet = Boolean(genre || countries)
    // A word nothing starts with may be a typo.
    if (!isFacet && word.length >= 4 && !hasWordWithPrefix(word)) {
      for (const correction of correctionsFor(word)) {
        variants.push({ text: correction, factor: 0.8 })
      }
    }
    return {
      word,
      variants,
      genre,
      countries,
      needles: [
        ...variants.map((variant) => variant.text),
        ...(genre ? [genre] : []),
        ...(countries ?? []),
      ],
    }
  })
  return {
    words: queryWords,
    years,
    decades,
    phrase: words.join(' '),
  }
}

const wordScore = (text: string, words: readonly string[], last: boolean) => {
  let best = 0
  for (const candidate of words) {
    if (candidate === text) return 10
    if (candidate.startsWith(text) && (last || text.length >= 3)) {
      best = Math.max(best, 7)
    } else if (text.length >= 3 && candidate.includes(text)) {
      best = Math.max(best, 4)
    }
  }
  return best
}

// Words in the loaded tagline and overview, as a small bonus.
const textScore = (word: string, movie: TestMovie) => {
  if (word.length < 4 || !(movie.tagline || movie.overview)) return 0
  const haystack = normalizeSearch(`${movie.tagline} ${movie.overview}`)
  return ` ${haystack}`.includes(` ${word}`) ? 1.5 : 0
}

// A word that stands for a genre or an origin counts for more than the same
// word turning up in a title ("korean horror" wants Korean horror films).
const FACET_SCORE = 8
const FACET_TITLE_SCORE = 6

const scoreWord = (
  entry: QueryWord,
  movie: TestMovie,
  prepared: Prepared,
  last: boolean,
) => {
  const facet = entry.genre !== null || entry.countries !== null
  let best = 0
  if (entry.needles.some((needle) => prepared.blob.includes(needle))) {
    for (const variant of entry.variants) {
      const inTitle = Math.max(
        wordScore(variant.text, prepared.titleWords, last),
        wordScore(variant.text, prepared.originalWords, last) * 0.8,
      )
      best = Math.max(
        best,
        (facet ? Math.min(inTitle, FACET_TITLE_SCORE) : inTitle) *
          variant.factor,
      )
    }
    const genre = entry.genre ?? entry.word
    if (
      prepared.genres.some(
        (name) =>
          name === genre || (genre.length >= 4 && name.startsWith(genre)),
      )
    ) {
      best = Math.max(best, FACET_SCORE)
    }
    if (entry.countries?.includes(prepared.country)) {
      best = Math.max(best, FACET_SCORE)
    }
    if (
      entry.word.length >= 4 &&
      prepared.country &&
      prepared.country.startsWith(entry.word)
    ) {
      best = Math.max(best, 5)
    }
  }
  return best || textScore(entry.word, movie)
}

type Scored = { movie: TestMovie; score: number; matched: number }

// `strict`: every word must match, so the film is dropped at the first word
// that does not.
const scoreMovie = (
  movie: TestMovie,
  query: Query,
  strict: boolean,
): Scored | null => {
  const prepared = prepare(movie)
  let score = 0
  let matched = 0
  for (let index = 0; index < query.words.length; index += 1) {
    const best = scoreWord(
      query.words[index],
      movie,
      prepared,
      index === query.words.length - 1,
    )
    if (best) {
      matched += 1
      score += best
    } else if (strict) {
      return null
    }
  }
  const year = Number.parseInt(movie.year, 10)
  if (query.years.size) {
    if (query.years.has(year)) {
      score += 8
      matched += query.years.size
    } else if (strict) {
      return null
    }
  }
  if (query.decades.size) {
    if (
      [...query.decades].some((decade) => year >= decade && year < decade + 10)
    ) {
      score += 4
      matched += query.decades.size
    } else if (strict) {
      return null
    }
  }
  if (query.words.length > 1 || query.phrase.length > 2) {
    if (prepared.title === query.phrase) score += 30
    else if (prepared.title.startsWith(query.phrase)) score += 14
    else if (prepared.title.includes(query.phrase)) score += 8
  }
  // Well-known films first among equals.
  score += Math.log10((movie.voteCount ?? 0) + 1) * 0.35
  return { movie, score, matched }
}

const needed = (query: Query) =>
  query.words.length + query.years.size + query.decades.size

// Prepares the films in small slices between frames, so the first search
// does not pay for all of them at once. Returns the cancel function.
export const warmSearch = (movies: readonly TestMovie[]) => {
  const SLICE = 2500
  let at = 0
  let timer = 0
  const step = () => {
    const end = Math.min(at + SLICE, movies.length)
    for (; at < end; at++) prepare(movies[at])
    if (at < movies.length) timer = window.setTimeout(step, 16)
  }
  timer = window.setTimeout(step, 400)
  return () => window.clearTimeout(timer)
}

// Ranked films for a query, or null for an empty one (the list is then
// untouched). Ties keep the list's own order.
export const searchMovies = (
  movies: readonly TestMovie[],
  rawQuery: string,
): TestMovie[] | null => {
  const query = parseQuery(rawQuery)
  if (!query) return null
  // Preparing every film (once) also builds the dictionary typos use.
  for (const movie of movies) prepare(movie)
  const all = needed(query)
  let hits: Scored[] = []
  for (const movie of movies) {
    const hit = scoreMovie(movie, query, true)
    if (hit) hits.push(hit)
  }
  // Nothing matches every word: list what matches most of them.
  if (!hits.length && all > 1) {
    const minimum = Math.max(1, Math.ceil(all / 2))
    for (const movie of movies) {
      const hit = scoreMovie(movie, query, false)
      if (hit && hit.matched >= minimum) hits.push(hit)
    }
  }
  const order = new Map(hits.map((hit, index) => [hit.movie, index]))
  hits = hits.sort(
    (a, b) =>
      b.matched - a.matched ||
      b.score - a.score ||
      (order.get(a.movie) ?? 0) - (order.get(b.movie) ?? 0),
  )
  return hits.map((hit) => hit.movie)
}
