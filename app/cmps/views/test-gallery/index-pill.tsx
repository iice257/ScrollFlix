import { memo } from 'react'

export type IndexPillFilm = {
  id: string
  title: string
  meta: string
  posterUrl: string
  placeholderColor?: string
}

type IndexPillProps = {
  film: IndexPillFilm
  // Opens the film's card.
  onOpen: () => void
}

// The globe's title pill, with the film's poster beside the title. It sits in
// the Index's dock once a shuffle has landed on a film, and follows the film
// on show. The poster's corners are concentric with the pill's (the pill's
// radius is the poster's plus the gap around it), so the curves stay aligned.
export const IndexPill = memo(({ film, onOpen }: IndexPillProps) => (
  <button
    type='button'
    className='warp-title-card warp-index-pill'
    aria-label={`Open details for ${film.title}`}
    onClick={onOpen}
  >
    <span key={film.id} className='warp-index-pill-face'>
      <span
        className='warp-index-pill-poster'
        style={
          film.placeholderColor
            ? { backgroundColor: film.placeholderColor }
            : undefined
        }
      >
        <img
          src={film.posterUrl}
          alt=''
          width={40}
          height={60}
          decoding='async'
          // The globe and the card fetch this URL with CORS; a plain request
          // would cache a copy they cannot use.
          crossOrigin='anonymous'
        />
      </span>
      <span className='warp-index-pill-copy'>
        <span className='warp-title-card-name'>{film.title}</span>
        {film.meta ? (
          <span className='warp-title-card-meta'>{film.meta}</span>
        ) : null}
      </span>
    </span>
  </button>
))
