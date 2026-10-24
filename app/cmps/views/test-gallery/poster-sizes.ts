export type PosterSize =
  | 'w92'
  | 'w154'
  | 'w185'
  | 'w342'
  | 'w500'
  | 'w780'
  | 'original'
export type BackdropSize = 'w300' | 'w780' | 'w1280' | 'original'

const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p'

const POSTER_WIDTHS: ReadonlyArray<[PosterSize, number]> = [
  ['w92', 92],
  ['w154', 154],
  ['w185', 185],
  ['w342', 342],
  ['w500', 500],
  ['w780', 780],
]

export const posterUrl = (path: string, size: PosterSize) =>
  `${TMDB_IMAGE_URL}/${size}/${path}.jpg`

export const backdropUrl = (path: string, size: BackdropSize) =>
  `${TMDB_IMAGE_URL}/${size}/${path}.jpg`

// The smallest catalogue size that is at least as wide as the device pixels
// it is drawn at, capped at w780.
export const pickPosterSize = (deviceWidthPx: number): PosterSize => {
  for (const [size, width] of POSTER_WIDTHS) {
    if (width >= deviceWidthPx) return size
  }
  return 'w780'
}

export const posterSrcSet = (path: string) =>
  `${posterUrl(path, 'w342')} 342w, ${posterUrl(path, 'w500')} 500w, ${posterUrl(path, 'w780')} 780w`

export const pickBackdropSize = (deviceWidthPx: number): BackdropSize =>
  deviceWidthPx <= 780 ? 'w780' : 'w1280'

// Size ladder used when one size 404s: best first.
export const POSTER_FALLBACK_SIZES: readonly PosterSize[] = [
  'w342',
  'w185',
  'w154',
]
