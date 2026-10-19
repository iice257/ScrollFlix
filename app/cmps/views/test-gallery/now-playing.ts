// Phones show a shuffle's film in a short "now playing" bar above the title
// pill instead of popping its card open, so the globe stays free to spin and
// shuffling can carry on. These helpers decide when that applies; the bar
// itself is `now-playing-bar.tsx`.

type ShuffleSurface = {
  // Phone-width layout (the app's one mobile breakpoint).
  isMobile: boolean
  // Full-screen mode hides the dock the bar lives in.
  immersive: boolean
  // The party game wants every landing to open its card.
  partyActive: boolean
  mode: 'wall' | 'list' | 'filters'
}

// True when a plain shuffle should land quietly and raise the bar.
export const usesNowPlayingBar = ({
  isMobile,
  immersive,
  partyActive,
  mode,
}: ShuffleSurface) => isMobile && !immersive && !partyActive && mode === 'wall'

type BarVisibility = ShuffleSurface & {
  hasFilm: boolean
  galleryReady: boolean
  detailsOpen: boolean
  // A Shuffle Pro or mood run is in progress and owns the presentation.
  runActive: boolean
  // Any panel, drawer or dialog above the globe.
  overlayOpen: boolean
}

// The bar is shown while there is a film for it and nothing else has taken
// over the screen. When this turns false the bar is dropped for good.
export const shouldShowNowPlaying = ({
  hasFilm,
  galleryReady,
  detailsOpen,
  runActive,
  overlayOpen,
  ...surface
}: BarVisibility) =>
  hasFilm &&
  galleryReady &&
  usesNowPlayingBar(surface) &&
  !detailsOpen &&
  !runActive &&
  !overlayOpen

// "2019 · ★ 7.8 · 2h 4m": the same facts the details card leads with.
export const buildNowPlayingMeta = ({
  year,
  rating,
  runtime,
}: {
  year: string
  rating: string
  runtime: string | null
}) =>
  [
    year && year !== '----' ? year : null,
    rating ? `★ ${rating}` : null,
    runtime,
  ]
    .filter(Boolean)
    .join(' · ')
