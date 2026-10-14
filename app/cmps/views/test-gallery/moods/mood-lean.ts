// How far each depth layer of a mood scene leans with the pointer, in pixels at
// full tilt, the nearest the most. The iris of the Weird scene leans the other
// way, towards the pointer.
//
// The offsets are written straight onto these few elements. They used to ride
// on custom properties set on the stage, and a custom property that inherits
// makes the browser re-check every SVG node under it on every pointer frame.
export const LEAN_LAYERS = [
  { selector: '.ms-far', reachX: -6, reachY: -4 },
  { selector: '.ms-mid', reachX: -14, reachY: -9 },
  { selector: '.ms-near', reachX: -26, reachY: -16 },
  { selector: '.ms-iris', reachX: 22, reachY: 12 },
] as const

// The pointer, as a position on the stage from -1 (left, top) to 1 (right,
// bottom), clamped so a pointer outside the stage never over-leans.
export const stagePosition = (
  point: number,
  start: number,
  size: number,
): number => {
  if (size <= 0) return 0
  const unit = ((point - start) / size - 0.5) * 2
  return Math.max(-1, Math.min(1, unit))
}

export const leanTranslate = (
  reachX: number,
  reachY: number,
  x: number,
  y: number,
): string => `${(x * reachX).toFixed(2)}px ${(y * reachY).toFixed(2)}px`
