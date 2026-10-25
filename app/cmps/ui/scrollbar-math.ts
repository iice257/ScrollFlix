// The thumb size and position maths for the overlay scrollbar, kept free of
// the DOM so it can be tested on its own.

export const MIN_THUMB = 32

export type ThumbMetrics = {
  /** False when the content fits, so there is nothing to draw. */
  visible: boolean
  /** Thumb length in px. */
  size: number
  /** Thumb distance from the start of the track in px. */
  offset: number
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

/**
 * Where the thumb sits for a scroll position. The thumb is as long as the
 * visible share of the content (never shorter than `minThumb`) and travels the
 * rest of the track as the content scrolls from start to end.
 */
export const getThumbMetrics = (
  scrollSize: number,
  clientSize: number,
  scrollPos: number,
  trackSize: number,
  minThumb = MIN_THUMB,
): ThumbMetrics => {
  const range = scrollSize - clientSize
  // Sub-pixel overflow is rounding noise, not something to scroll.
  if (clientSize <= 0 || trackSize <= 0 || range <= 1)
    return { visible: false, size: 0, offset: 0 }
  const size = clamp(
    Math.round((trackSize * clientSize) / scrollSize),
    Math.min(minThumb, trackSize),
    trackSize,
  )
  const offset = clamp(scrollPos / range, 0, 1) * (trackSize - size)
  return { visible: true, size, offset }
}

/**
 * The scroll position for a thumb dragged `thumbDelta` px from where it was
 * when `startScroll` was read. Inverse of the travel in `getThumbMetrics`.
 */
export const getScrollFromDrag = (
  startScroll: number,
  thumbDelta: number,
  scrollSize: number,
  clientSize: number,
  trackSize: number,
  thumbSize: number,
): number => {
  const range = scrollSize - clientSize
  const travel = trackSize - thumbSize
  if (range <= 0 || travel <= 0) return startScroll
  return clamp(startScroll + (thumbDelta * range) / travel, 0, range)
}
