// Where the pointer last was, so a sound can come from that side of the
// screen: a hover on the left of the dock is heard on the left, and a heart
// saved with the mouse on the right comes from the right.

import { panFromPointer } from './sound-variety'

let lastX = 0.5

export const setPointerX = (unit: number) => {
  lastX = Math.min(1, Math.max(0, unit))
}

// -0.7..0.7, 0 for the middle of the window.
export const pointerPan = () => panFromPointer(lastX, 1)

// Starts following the pointer. Returns the function that stops it.
export const trackPointer = () => {
  if (typeof window === 'undefined') return () => {}
  const onMove = (event: PointerEvent) => {
    if (window.innerWidth > 0) setPointerX(event.clientX / window.innerWidth)
  }
  window.addEventListener('pointermove', onMove, {
    capture: true,
    passive: true,
  })
  window.addEventListener('pointerdown', onMove, {
    capture: true,
    passive: true,
  })
  return () => {
    window.removeEventListener('pointermove', onMove, { capture: true })
    window.removeEventListener('pointerdown', onMove, { capture: true })
  }
}
