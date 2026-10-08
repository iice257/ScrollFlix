// Smart search for the index: besides titles, the search box understands the
// things you can filter and sort by. Typing "comedy", "newest", "90s", "7+",
// "short" or "scary" offers the matching genre, sort, decade, rating, runtime
// or mood as a one-click suggestion. Pure and framework-free.

export type SearchFacet =
  | { kind: 'genre'; genre: string }
  | { kind: 'mood'; id: string }
  | { kind: 'decade'; value: number }
  | { kind: 'year'; value: number }
  | { kind: 'runtime'; id: string }
  | { kind: 'rating'; min: number }
  | { kind: 'sort'; key: string; direction: 'asc' | 'desc' }

export type FacetCatalog = {
  genres: string[]
  moods: { id: string; label: string }[]
  runtimes: { id: string; label: string }[]
  sorts: { key: string; label: string; asc: string; desc: string }[]
}

export type FacetSuggestion = {
  id: string
  group: string
  label: string
  facet: SearchFacet
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Extra words people reach for. Each maps to a mood, runtime or sort.
const MOOD_WORDS: Record<string, string[]> = {
  fast: ['action', 'thrilling', 'exciting', 'pacey', 'adrenaline'],
  dark: ['scary', 'gritty', 'creepy', 'intense', 'serious', 'tense', 'bleak'],
  funny: ['comedy', 'laugh', 'laughs', 'light', 'silly', 'feel good', 'cosy'],
  romantic: ['love', 'date', 'date night', 'sweet', 'romance'],
  weird: ['strange', 'odd', 'surreal', 'trippy', 'mind bending', 'bizarre'],
  highRated: ['best', 'great', 'top', 'acclaimed', 'good', 'top rated'],
}

const RUNTIME_WORDS: Record<string, string[]> = {
  movieUnder90: ['short', 'quick', 'under 90', 'under 1 hour 30', 'brief'],
  movie90to120: ['medium', 'average', 'normal length', '90 to 120'],
  movieOver120: ['long', 'epic', 'over 2 hours', 'over 120', 'lengthy'],
}

const SORT_WORDS: Record<string, string[]> = {
  'year:desc': ['newest', 'latest', 'recent', 'new', 'newest first'],
  'year:asc': ['oldest', 'old', 'classic', 'classics', 'oldest first'],
  'rating:desc': ['top rated', 'best rated', 'highest rated', 'best'],
  'rating:asc': ['worst rated', 'lowest rated'],
  'runtime:asc': ['shortest', 'short'],
  'runtime:desc': ['longest', 'long'],
  'popularity:desc': ['popular', 'trending', 'famous', 'most popular'],
  'popularity:asc': ['hidden gems', 'obscure', 'least popular', 'underrated'],
  'votes:desc': ['most votes', 'most voted'],
  'alpha:asc': ['alphabetical', 'a to z', 'a-z'],
  'alpha:desc': ['z to a', 'z-a'],
}

type Candidate = {
  suggestion: FacetSuggestion
  // Lower-case phrases this suggestion answers to.
  keywords: string[]
}

const buildCandidates = (catalog: FacetCatalog): Candidate[] => {
  const candidates: Candidate[] = []
  for (const genre of catalog.genres) {
    candidates.push({
      suggestion: {
        id: `genre:${genre}`,
        group: 'Genre',
        label: genre,
        facet: { kind: 'genre', genre },
      },
      keywords: [normalize(genre)],
    })
  }
  for (const mood of catalog.moods) {
    candidates.push({
      suggestion: {
        id: `mood:${mood.id}`,
        group: 'Mood',
        label: mood.label,
        facet: { kind: 'mood', id: mood.id },
      },
      keywords: [
        normalize(mood.label),
        'mood',
        ...(MOOD_WORDS[mood.id] ?? []).map(normalize),
      ],
    })
  }
  for (const runtime of catalog.runtimes) {
    candidates.push({
      suggestion: {
        id: `runtime:${runtime.id}`,
        group: 'Runtime',
        label: runtime.label,
        facet: { kind: 'runtime', id: runtime.id },
      },
      keywords: [
        normalize(runtime.label),
        'runtime',
        'length',
        ...(RUNTIME_WORDS[runtime.id] ?? []).map(normalize),
      ],
    })
  }
  for (const sort of catalog.sorts) {
    for (const direction of ['desc', 'asc'] as const) {
      const label = direction === 'desc' ? sort.desc : sort.asc
      candidates.push({
        suggestion: {
          id: `sort:${sort.key}:${direction}`,
          group: 'Sort',
          label: `${sort.label}: ${label}`,
          facet: { kind: 'sort', key: sort.key, direction },
        },
        keywords: [
          normalize(label),
          normalize(sort.label),
          'sort',
          'order',
          ...(SORT_WORDS[`${sort.key}:${direction}`] ?? []).map(normalize),
        ],
      })
    }
  }
  return candidates
}

// Facets that come from the shape of the text rather than a fixed list.
const numericSuggestions = (query: string): FacetSuggestion[] => {
  const found: FacetSuggestion[] = []
  const year = /^(1[89]\d\d|20\d\d)$/.exec(query)
  if (year) {
    const value = Number(year[1])
    found.push({
      id: `year:${value}`,
      group: 'Year',
      label: String(value),
      facet: { kind: 'year', value },
    })
  }
  const decade = /^(?:(1[89]\d|20\d)0s?|(\d{2})s)$/.exec(query)
  if (decade) {
    const value = decade[1]
      ? Number(decade[1]) * 10
      : (() => {
          const short = Number(decade[2])
          return short >= 30 ? 1900 + short : 2000 + short
        })()
    found.push({
      id: `decade:${value}`,
      group: 'Decade',
      label: `${value}s`,
      facet: { kind: 'decade', value },
    })
  }
  const rating = /^(?:rating\s*)?(10|\d(?:\.\d)?)\+?$/.exec(query)
  if (rating && /\+|rating/.test(query)) {
    const min = Number(rating[1])
    if (min >= 1 && min <= 10) {
      found.push({
        id: `rating:${min}`,
        group: 'Rating',
        label: `${min}+ rating`,
        facet: { kind: 'rating', min },
      })
    }
  }
  return found
}

// 0 = no match; higher is a closer match.
const scoreCandidate = (
  keywords: string[],
  tokens: string[],
  query: string,
) => {
  let best = 0
  for (const keyword of keywords) {
    if (keyword === query) best = Math.max(best, 100)
    else if (keyword.startsWith(query)) best = Math.max(best, 80)
    else if (keyword.split(' ').some((word) => word.startsWith(query))) {
      best = Math.max(best, 60)
    }
  }
  if (best) return best
  // Multi-word queries: every word must start some keyword's word.
  if (tokens.length > 1) {
    const words = new Set(keywords.flatMap((keyword) => keyword.split(' ')))
    const hit = tokens.every((token) =>
      [...words].some((word) => word.startsWith(token)),
    )
    if (hit) return 40
  }
  return 0
}

export const suggestFacets = (
  rawQuery: string,
  catalog: FacetCatalog,
  limit = 6,
): FacetSuggestion[] => {
  const query = normalize(rawQuery)
  if (query.length < 2 && !/^\d/.test(query)) return []
  const tokens = query.split(' ')

  const results: { suggestion: FacetSuggestion; score: number }[] = []
  for (const suggestion of numericSuggestions(query)) {
    results.push({ suggestion, score: 120 })
  }
  for (const { suggestion, keywords } of buildCandidates(catalog)) {
    const score = scoreCandidate(keywords, tokens, query)
    if (score) results.push({ suggestion, score })
  }
  // Higher score first; ties keep the catalogue's own order.
  return results
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.suggestion)
}
