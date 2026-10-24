import { type RefObject, useEffect } from 'react'
import { tiltSensor } from './tilt-sensor'
import {
  CARD_TILT_DEG,
  REST_STATE,
  STATIC_STATE,
  type SheenPoint,
  type SheenState,
  intensityFor,
  isSettled,
  pointerToSheen,
  sheenVars,
  stepSheen,
} from './tilt-sheen-math'

type Options = {
  // Where the pointer or finger is read from.
  areaRef: RefObject<HTMLElement | null>
  // The element the sheen variables are written to. Sheen layers and tilted
  // children inside it read them.
  targetRef: RefObject<HTMLElement | null>
  enabled?: boolean
  // Degrees of card tilt at the edge; 0 for a sheen without tilt.
  tiltDeg?: number
}

// How quickly the light catches up with the pointer, and how gently it settles
// back once the pointer leaves or the phone is put down.
const FOLLOW_HALF_LIFE_MS = 55
const SETTLE_HALF_LIFE_MS = 170
// A cached rect is refreshed after this long, so a card that is still sliding
// into place does not skew the light.
const RECT_TTL_MS = 300

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const write = (target: HTMLElement, state: SheenState, tiltDeg: number) => {
  const vars = sheenVars(state, tiltDeg)
  for (const [name, value] of Object.entries(vars)) {
    target.style.setProperty(name, value)
  }
}

// Drives a foil sheen (and, optionally, a gentle card tilt) from the pointer
// on desktop and from the phone's tilt on touch devices, falling back to
// dragging a finger when the sensor is missing or refused. The values are
// eased on animation frames, and the loop runs only while something is still
// moving: at rest it costs nothing. Everything is removed on unmount.
export const useTiltSheen = ({
  areaRef,
  targetRef,
  enabled = true,
  tiltDeg = CARD_TILT_DEG,
}: Options) => {
  useEffect(() => {
    const area = areaRef.current
    const target = targetRef.current
    if (!enabled || !area || !target) return

    if (prefersReducedMotion()) {
      // A still, tasteful highlight; no listeners, no frames.
      write(target, STATIC_STATE, 0)
      return
    }

    let current: SheenState = { ...REST_STATE }
    let pointer: SheenPoint | null = null
    let sensorPoint: SheenPoint | null = null
    let frame = 0
    let last = 0
    let rect: DOMRect | null = null
    let rectAt = 0

    write(target, current, tiltDeg)

    const goal = (): SheenState => {
      if (pointer) return { ...pointer, o: intensityFor(pointer, true) }
      if (sensorPoint && tiltSensor.getStatus() === 'active') {
        return { ...sensorPoint, o: intensityFor(sensorPoint, false) }
      }
      return REST_STATE
    }

    const tick = (now: number) => {
      frame = 0
      const dt = Math.min(64, now - last)
      last = now
      const next = goal()
      current = stepSheen(
        current,
        next,
        dt,
        pointer ? FOLLOW_HALF_LIFE_MS : SETTLE_HALF_LIFE_MS,
      )
      if (isSettled(current, next)) {
        current = { ...next }
        write(target, current, tiltDeg)
        target.dataset.live = 'false'
        return
      }
      write(target, current, tiltDeg)
      frame = window.requestAnimationFrame(tick)
    }

    const schedule = () => {
      if (frame) return
      last = performance.now()
      target.dataset.live = 'true'
      frame = window.requestAnimationFrame(tick)
    }

    const measure = () => {
      const now = performance.now()
      if (!rect || now - rectAt > RECT_TTL_MS) {
        rect = area.getBoundingClientRect()
        rectAt = now
      }
      return rect
    }

    const onMove = (event: PointerEvent) => {
      pointer = pointerToSheen(event.clientX, event.clientY, measure())
      schedule()
    }
    const invalidate = () => {
      rect = null
    }
    const onDown = (event: PointerEvent) => {
      rect = null
      onMove(event)
    }
    const onLeave = () => {
      pointer = null
      rect = null
      schedule()
    }

    area.addEventListener('pointerenter', onDown)
    area.addEventListener('pointerdown', onDown)
    area.addEventListener('pointermove', onMove)
    area.addEventListener('pointerleave', onLeave)
    area.addEventListener('pointerup', onLeave)
    area.addEventListener('pointercancel', onLeave)
    window.addEventListener('resize', invalidate)

    const stopFollowing = tiltSensor.follow((point) => {
      sensorPoint = point
      if (!pointer) schedule()
    })
    const stopStatus = tiltSensor.subscribe(schedule)

    return () => {
      area.removeEventListener('pointerenter', onDown)
      area.removeEventListener('pointerdown', onDown)
      area.removeEventListener('pointermove', onMove)
      area.removeEventListener('pointerleave', onLeave)
      area.removeEventListener('pointerup', onLeave)
      area.removeEventListener('pointercancel', onLeave)
      window.removeEventListener('resize', invalidate)
      stopFollowing()
      stopStatus()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [areaRef, targetRef, enabled, tiltDeg])
}
