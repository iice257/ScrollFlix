import { ChevronsUp, Dices } from 'lucide-react'
import { memo, useEffect, useState } from 'react'

export type NowPlayingFilm = {
  id: string
  title: string
  meta: string
  posterUrl: string
  placeholderColor?: string
}

type NowPlayingBarProps = {
  // The film to show, or null to take the bar away.
  film: NowPlayingFilm | null
  // Opens the full details card for the film on show.
  onOpen: () => void
  onShuffle: () => void
}

// Matches the CSS: a swap crossfades, and leaving fades the bar down.
const SWAP_MS = 200
const EXIT_MS = 220

const Poster = ({ film }: { film: NowPlayingFilm }) => (
  <span
    className='warp-np-poster'
    style={
      film.placeholderColor
        ? { backgroundColor: film.placeholderColor }
        : undefined
    }
  >
    <img src={film.posterUrl} alt='' width={40} height={60} decoding='async' />
  </span>
)

const Face = ({ film }: { film: NowPlayingFilm }) => (
  <>
    <Poster film={film} />
    <span className='warp-np-copy'>
      <span className='warp-np-title'>{film.title}</span>
      {film.meta ? <span className='warp-np-meta'>{film.meta}</span> : null}
    </span>
  </>
)

// The film on show, kept through the bar's exit, plus the film it replaced
// while that one fades out underneath.
const useShownFilm = (film: NowPlayingFilm | null) => {
  const [shown, setShown] = useState(film)
  const [leaving, setLeaving] = useState<NowPlayingFilm | null>(null)
  const [exiting, setExiting] = useState(false)

  // A different film swaps in during render, so the new face never waits for
  // an effect to appear.
  if (film && film.id !== shown?.id) {
    setLeaving(shown)
    setShown(film)
  }
  if (film && exiting) setExiting(false)

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setLeaving(null), SWAP_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  useEffect(() => {
    if (film || !shown) return
    setExiting(true)
    const timer = window.setTimeout(() => {
      setShown(null)
      setLeaving(null)
      setExiting(false)
    }, EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [film, shown])

  return { shown, leaving, exiting }
}

// A short, full-width player above the title pill: the film a shuffle just
// landed on, with Shuffle again and Open details. It never covers the globe's
// middle, and the globe stays live underneath.
export const NowPlayingBar = memo(
  ({ film, onOpen, onShuffle }: NowPlayingBarProps) => {
    const { shown, leaving, exiting } = useShownFilm(film)
    if (!shown) return null

    return (
      <section
        className='warp-np-bar'
        aria-label='Now playing'
        data-state={exiting ? 'exit' : 'enter'}
      >
        <button type='button' className='warp-np-body' onClick={onOpen}>
          <span className='warp-np-faces'>
            {leaving ? (
              <span className='warp-np-face is-leaving' aria-hidden='true'>
                <Face film={leaving} />
              </span>
            ) : null}
            <span
              key={shown.id}
              className='warp-np-face'
              data-swap={leaving ? 'true' : undefined}
            >
              <Face film={shown} />
            </span>
          </span>
          <span className='sr-only'>Tap for details</span>
        </button>
        <button
          type='button'
          className='warp-np-action'
          aria-label='Shuffle to another movie'
          onClick={onShuffle}
        >
          <Dices aria-hidden='true' />
        </button>
        <button
          type='button'
          className='warp-np-action is-primary'
          aria-label='Open details'
          onClick={onOpen}
        >
          <ChevronsUp aria-hidden='true' />
        </button>
        <output className='sr-only' aria-live='polite'>
          {`Now playing: ${shown.title}`}
        </output>
      </section>
    )
  },
)
