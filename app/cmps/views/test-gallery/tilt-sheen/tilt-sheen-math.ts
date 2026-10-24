// The pure parts of the tilt sheen: turning a pointer or a phone's
// orientation into a position on the card, smoothing it, and writing it out as
// the CSS variables the sheen layers read. Nothing here touches the DOM.

export type SheenPoint = { x: number; y: number }

// The full state the sheen eases through: where the light sits (-1..1 on both
// axes, 0 is the centre) and how strongly it shows (0..1).
export type SheenState = SheenPoint & { o: number }

export const REST_STATE: SheenState = { x: 0, y: 0, o: 0.34 }

// A calm highlight for people who asked for less motion: placed up and to the
// left, as if the card were lit from a window, and never moving.
export const STATIC_STATE: SheenState = { x: -0.34, y: -0.4, o: 0.5 }

// Degrees of phone rotation that move the light from the centre to an edge.
export const TILT_RANGE_DEG = 22
// Degrees of card tilt at the edge, in either direction.
export const CARD_TILT_DEG = 7

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

// Pointer position inside a rectangle, as -1..1 on both axes.
export const pointerToSheen = (
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): SheenPoint => {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  return {
    x: clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
    y: clamp(((clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
  }
}

export type OrientationBaseline = { beta: number; gamma: number }

// A phone's orientation, relative to how it was held when the first reading
// came in, as -1..1. Relative on purpose: nobody holds a phone at exactly 0°.
// Gamma (left/right roll) moves the light sideways; beta (front/back pitch)
// moves it up and down. Both are clamped, and angles wrap cleanly past 180°.
export const orientationToSheen = (
  beta: number | null,
  gamma: number | null,
  base: OrientationBaseline,
  range = TILT_RANGE_DEG,
): SheenPoint | null => {
  if (beta === null || gamma === null) return null
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null
  const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180
  return {
    x: clamp(wrap(gamma - base.gamma) / range, -1, 1),
    y: clamp(wrap(beta - base.beta) / range, -1, 1),
  }
}

// Moves `current` toward `target`, independent of frame rate. After one
// half-life the gap has halved, so the light settles without overshooting.
export const easeToward = (
  current: number,
  target: number,
  dtMs: number,
  halfLifeMs: number,
) => {
  if (dtMs <= 0) return current
  const keep = 0.5 ** (dtMs / halfLifeMs)
  return target + (current - target) * keep
}

export const stepSheen = (
  current: SheenState,
  target: SheenState,
  dtMs: number,
  halfLifeMs: number,
): SheenState => ({
  x: easeToward(current.x, target.x, dtMs, halfLifeMs),
  y: easeToward(current.y, target.y, dtMs, halfLifeMs),
  o: easeToward(current.o, target.o, dtMs, halfLifeMs),
})

export const isSettled = (a: SheenState, b: SheenState, epsilon = 0.002) =>
  Math.abs(a.x - b.x) < epsilon &&
  Math.abs(a.y - b.y) < epsilon &&
  Math.abs(a.o - b.o) < epsilon

// How strongly the light shows for a given position. The pointer being on the
// card lights it fully; otherwise it grows with how far the card is tilted
// from rest, so a phone held flat only glints faintly.
export const intensityFor = (point: SheenPoint, engaged: boolean) => {
  if (engaged) return 1
  const away = clamp(Math.hypot(point.x, point.y), 0, 1)
  return REST_STATE.o + (1 - REST_STATE.o) * away * 0.9
}

const round = (n: number, places = 3) => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

// The CSS variables the sheen layers and the tilted card read.
export const sheenVars = (state: SheenState, tiltDeg = CARD_TILT_DEG) => ({
  '--ts-x': String(round(state.x)),
  '--ts-y': String(round(state.y)),
  '--ts-o': String(round(state.o)),
  '--ts-rx': `${round(-state.y * tiltDeg, 2)}deg`,
  '--ts-ry': `${round(state.x * tiltDeg, 2)}deg`,
})
