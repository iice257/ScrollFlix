// Which TMDB poster sizes this visit has already fetched, by poster path.
//
// The globe, the shuffle pool and the card each fetch posters with CORS, so a
// size one of them has loaded is in the browser's HTTP cache for the others.
// The card and the flight animation start from the best size already loaded
// (never a blank), then move up to w342 and w500 as those arrive. Nothing here
// is the image itself: it only remembers that a size was fetched.

import { type PosterSize, posterUrl } from './poster-sizes'

const WIDTH: Record<PosterSize, number> = {
  w92: 92,
  w154: 154,
  w185: 185,
  w342: 342,
  w500: 500,
  w780: 780,
  original: Number.POSITIVE_INFINITY,
}

const loaded = new Map<string, Set<PosterSize>>()

// The size and path in a TMDB poster url, or null for any other url.
export const parsePosterUrl = (
  url: string,
): { path: string; size: PosterSize } | null => {
  const match =
    /\/t\/p\/(w92|w154|w185|w342|w500|w780|original)\/([^/?#]+)\.jpg/.exec(url)
  return match ? { size: match[1] as PosterSize, path: match[2] } : null
}

export const notePosterLoaded = (path: string, size: PosterSize) => {
  let sizes = loaded.get(path)
  if (!sizes) {
    sizes = new Set()
    loaded.set(path, sizes)
  }
  sizes.add(size)
}

// Same, from the url that was fetched.
export const notePosterUrlLoaded = (url: string) => {
  const parsed = parsePosterUrl(url)
  if (parsed) notePosterLoaded(parsed.path, parsed.size)
}

// The largest size already loaded that is narrower than `below` (so the card's
// base layer never repeats the size it is about to show), or null.
export const bestLoadedSize = (
  path: string,
  below: PosterSize = 'w342',
): PosterSize | null => {
  const sizes = loaded.get(path)
  if (!sizes) return null
  let best: PosterSize | null = null
  for (const size of sizes) {
    if (WIDTH[size] >= WIDTH[below]) continue
    if (best === null || WIDTH[size] > WIDTH[best]) best = size
  }
  return best
}

// The url to start a poster from: the best size already loaded, else the
// fallback (the catalogue's thumbnail).
export const startingPosterUrl = (
  path: string | null | undefined,
  fallback: string,
  below: PosterSize = 'w342',
) => {
  if (!path) return fallback
  const size = bestLoadedSize(path, below)
  return size ? posterUrl(path, size) : fallback
}

// Test helper.
export const resetLoadedPosters = () => loaded.clear()
