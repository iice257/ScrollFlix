import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type ViewRect = {
  left: number
  top: number
  width: number
  height: number
}

type PosterFlightProps = {
  // Where the poster is on the globe.
  from: ViewRect
  image: string
  onDone: () => void
}

const FLIGHT_MS = 640
const MAX_LOOK_FRAMES = 20
const EASE = 'cubic-bezier(0.2, 0.9, 0.15, 1)'

// The ghost's destination: where the card's poster ends up once the card has
// finished its own entrance. The card is still scaling and sliding in when this
// runs, so its current transform is divided back out.
export const finalPosterRect = (
  poster: Element,
  card: Element,
): ViewRect | null => {
  const posterRect = poster.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()
  if (!posterRect.width || !cardRect.width) return null
  const raw = getComputedStyle(card).transform
  let scale = 1
  let shiftX = 0
  let shiftY = 0
  if (raw && raw !== 'none') {
    const matrix = new DOMMatrixReadOnly(raw)
    scale = matrix.a || 1
    shiftX = matrix.e
    shiftY = matrix.f
  }
  const cardCenterX = cardRect.left + cardRect.width / 2 - shiftX
  const cardCenterY = cardRect.top + cardRect.height / 2 - shiftY
  const centerX =
    cardCenterX +
    (posterRect.left +
      posterRect.width / 2 -
      (cardRect.left + cardRect.width / 2)) /
      scale
  const centerY =
    cardCenterY +
    (posterRect.top +
      posterRect.height / 2 -
      (cardRect.top + cardRect.height / 2)) /
      scale
  const width = posterRect.width / scale
  const height = posterRect.height / scale
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height,
  }
}

// A poster that lifts off the globe and settles into the card's poster slot.
// While it flies, the card's own poster is hidden; it is always shown again,
// however the flight ends.
export const PosterFlight = ({ from, image, onDone }: PosterFlightProps) => {
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useLayoutEffect(() => {
    const ghost = ghostRef.current
    if (!ghost) return
    let frame = 0
    let animation: Animation | null = null
    let poster: HTMLElement | null = null
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      if (poster) poster.style.visibility = ''
      doneRef.current()
    }

    const launch = (poster: HTMLElement, target: ViewRect) => {
      poster.style.visibility = 'hidden'
      Object.assign(ghost.style, {
        left: `${target.left}px`,
        top: `${target.top}px`,
        width: `${target.width}px`,
        height: `${target.height}px`,
        visibility: 'visible',
      })
      const dx = from.left - target.left
      const dy = from.top - target.top
      const sx = from.width / target.width
      const sy = from.height / target.height
      animation = ghost.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
            boxShadow: '0 4px 18px rgb(0 0 0 / 0.35)',
          },
          {
            transform: 'translate(0, 0) scale(1, 1)',
            boxShadow: '0 24px 70px rgb(0 0 0 / 0.6)',
          },
        ],
        { duration: FLIGHT_MS, easing: EASE, fill: 'both' },
      )
      animation.finished
        .then(() => {
          poster.style.visibility = ''
          // Hand over to the real poster underneath.
          return ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 140,
            fill: 'both',
          }).finished
        })
        .then(finish, finish)
    }

    // The card appears a render after the pick; look for its poster each frame
    // for a few frames, and give up quietly if it never shows.
    let attempts = 0
    const look = () => {
      poster = document.querySelector<HTMLElement>(
        '.warp-details-layer:not([data-motion="exit"]) .warp-details-poster',
      )
      const card = poster?.closest('.warp-details-card')
      const target = poster && card ? finalPosterRect(poster, card) : null
      if (poster && target) {
        launch(poster, target)
        return
      }
      attempts += 1
      if (attempts > MAX_LOOK_FRAMES) {
        finish()
        return
      }
      frame = window.requestAnimationFrame(look)
    }
    frame = window.requestAnimationFrame(look)

    return () => {
      window.cancelAnimationFrame(frame)
      animation?.cancel()
      finish()
    }
  }, [from])

  return createPortal(
    <div
      ref={ghostRef}
      aria-hidden='true'
      style={{
        position: 'fixed',
        zIndex: 90,
        visibility: 'hidden',
        pointerEvents: 'none',
        transformOrigin: '0 0',
        borderRadius: 18,
        backgroundImage: `url(${JSON.stringify(image)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        willChange: 'transform',
      }}
    />,
    document.body,
  )
}
