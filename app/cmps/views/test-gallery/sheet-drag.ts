// The phone details sheet's drag, kept apart from the component so the maths
// can be tested. The sheet has two resting heights (compact and expanded) and
// a close gesture below compact. While a finger is down the sheet follows it
// one to one; on release it settles on the nearest resting place, or where a
// flick was heading.

export type SheetSnap = 'compact' | 'expanded' | 'close'

export type SheetFrame = {
  // The sheet's height now, in px.
  height: number
  // How far the whole sheet has been pulled down past compact, in px.
  offset: number
}

type Limits = { compact: number; expanded: number }

// Where the sheet is when the finger has moved `delta` px (down is positive)
// from a start at `startHeight`. Up grows the sheet to its expanded height and
// no further. Down shrinks it to compact; past compact the sheet itself moves
// down (a little resisted) so it can be dismissed.
export const sheetFrame = (
  startHeight: number,
  delta: number,
  { compact, expanded }: Limits,
): SheetFrame => {
  const raw = startHeight - delta
  if (raw >= compact) return { height: Math.min(expanded, raw), offset: 0 }
  return { height: compact, offset: (compact - raw) * 0.85 }
}

// Pull needed to close, and the flick speed (px per ms) that counts as a throw.
export const SHEET_CLOSE_PX = 72
export const SHEET_FLICK_SPEED = 0.55

// Where a released drag settles. `velocity` is px per ms, down positive.
export const sheetSettle = (
  frame: SheetFrame,
  velocity: number,
  { compact, expanded }: Limits,
): SheetSnap => {
  if (frame.offset > SHEET_CLOSE_PX || (frame.offset > 12 && velocity > 1)) {
    return 'close'
  }
  if (velocity <= -SHEET_FLICK_SPEED) return 'expanded'
  if (velocity >= SHEET_FLICK_SPEED) return 'compact'
  return frame.height > (compact + expanded) / 2 ? 'expanded' : 'compact'
}

// The speed of the last stretch of a drag, from timed samples (newest last).
export const dragVelocity = (
  samples: ReadonlyArray<{ y: number; t: number }>,
  windowMs = 90,
) => {
  const last = samples[samples.length - 1]
  if (!last) return 0
  let first = last
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    if (last.t - samples[index].t > windowMs) break
    first = samples[index]
  }
  const span = last.t - first.t
  return span > 0 ? (last.y - first.y) / span : 0
}
