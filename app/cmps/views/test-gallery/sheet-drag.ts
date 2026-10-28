// The phone details sheet's drag, kept apart from the component so the maths
// can be tested. It behaves like Reddit's signed-out bottom sheet: the sheet
// moves with the finger one to one, nothing is decided until the finger lifts,
// and then a pull of a set length (or a flick) opens it, shrinks it or closes
// it, and anything shorter puts it back. While it moves only its offset
// changes (a compositor transform, no layout), so a drag costs no more than a
// scroll.

export type SheetSnap = 'compact' | 'expanded' | 'close'

// The pull, in px, that counts as a decision, and the flick speed (px per ms)
// that counts as one whatever the distance.
export const SHEET_THRESHOLD_PX = 56
export const SHEET_FLICK_SPEED = 0.5
// How much of a pull past the end of the sheet's travel it follows.
export const SHEET_RESIST = 0.28

// Where the sheet sits (px, down positive) when the finger has moved `delta`
// px from where it took hold. Down is one to one. Up is one to one for as far
// as the sheet can grow (`room`: the expanded height less the compact one, and
// nothing once it is expanded), then resisted, so it never tears away.
export const sheetOffset = (delta: number, room: number) => {
  if (delta >= 0) return delta
  const pull = -delta
  const free = Math.max(0, room)
  return -(pull <= free ? pull : free + (pull - free) * SHEET_RESIST)
}

// What a released drag does. `delta` is the finger's whole travel (down
// positive) and `velocity` the speed of its last stretch (px per ms).
export const sheetDecision = (
  delta: number,
  velocity: number,
  expanded: boolean,
): SheetSnap => {
  const down = delta >= SHEET_THRESHOLD_PX || velocity >= SHEET_FLICK_SPEED
  const up = delta <= -SHEET_THRESHOLD_PX || velocity <= -SHEET_FLICK_SPEED
  // A flick against a short pull still follows the pull's direction, so the
  // two never disagree.
  if (down && !(up && delta < 0)) return expanded ? 'compact' : 'close'
  if (up) return 'expanded'
  return expanded ? 'expanded' : 'compact'
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
