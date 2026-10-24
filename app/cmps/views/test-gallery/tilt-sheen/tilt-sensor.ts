import {
  type OrientationBaseline,
  type SheenPoint,
  TILT_RANGE_DEG,
  orientationToSheen,
} from './tilt-sheen-math'

// One shared reader of the phone's orientation. Cards come and go; the sensor
// listener is attached while at least one of them wants it, and removed with
// the last. Nothing is attached on devices with a fine pointer.

export type SensorStatus =
  // Not a touch device, or no orientation sensor.
  | 'unsupported'
  // iOS: needs a tap before the sensor will report.
  | 'needs-permission'
  // Asked for, or not needed; waiting for the first real reading.
  | 'listening'
  // Readings are arriving and the phone has actually moved.
  | 'active'
  | 'denied'

type PermissionedOrientation = {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

// Degrees of movement from the first reading that count as "the person tilted".
const DETECT_DEG = 3

const listeners = new Set<() => void>()
const pointListeners = new Set<(point: SheenPoint) => void>()

let status: SensorStatus | null = null
let attached = 0
let baseline: OrientationBaseline | null = null
let point: SheenPoint = { x: 0, y: 0 }
let bound = false

const touchDevice = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches

const orientationCtor = () =>
  typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
    ? (window.DeviceOrientationEvent as unknown as PermissionedOrientation)
    : null

const needsPermission = () =>
  typeof orientationCtor()?.requestPermission === 'function'

const initialStatus = (): SensorStatus => {
  if (!touchDevice() || !orientationCtor()) return 'unsupported'
  return needsPermission() ? 'needs-permission' : 'listening'
}

const setStatus = (next: SensorStatus) => {
  if (status === next) return
  status = next
  for (const listener of listeners) listener()
}

const onOrientation = (event: DeviceOrientationEvent) => {
  const { beta, gamma } = event
  if (beta === null || gamma === null) {
    // Desktop browsers fire one empty reading: there is no sensor.
    if (!baseline) setStatus('unsupported')
    return
  }
  if (!baseline) baseline = { beta, gamma }
  const next = orientationToSheen(beta, gamma, baseline)
  if (!next) return
  point = next
  if (status !== 'active') {
    const moved = Math.max(Math.abs(next.x), Math.abs(next.y))
    if (moved * TILT_RANGE_DEG >= DETECT_DEG) setStatus('active')
  }
  for (const listener of pointListeners) listener(point)
}

const bind = () => {
  if (bound || typeof window === 'undefined') return
  bound = true
  baseline = null
  window.addEventListener('deviceorientation', onOrientation, { passive: true })
}

const unbind = () => {
  if (!bound) return
  bound = false
  window.removeEventListener('deviceorientation', onOrientation)
}

export const tiltSensor = {
  getStatus(): SensorStatus {
    if (status === null) status = initialStatus()
    return status
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  // Follows the phone's tilt, as a point in -1..1. Attaches the shared
  // listener; call the returned function to let go of it.
  follow(onPoint: (point: SheenPoint) => void) {
    if (tiltSensor.getStatus() === 'unsupported') return () => {}
    pointListeners.add(onPoint)
    attached += 1
    // On iOS the sensor stays quiet until permission is granted.
    if (!needsPermission() || status === 'listening' || status === 'active') {
      bind()
    }
    return () => {
      pointListeners.delete(onPoint)
      attached -= 1
      if (attached <= 0) {
        attached = 0
        unbind()
      }
    }
  },
  // Must be called from a tap or click. Resolves to the resulting status.
  async requestPermission(): Promise<SensorStatus> {
    const ctor = orientationCtor()
    if (!ctor?.requestPermission) return tiltSensor.getStatus()
    try {
      const result = await ctor.requestPermission()
      if (result === 'granted') {
        setStatus('listening')
        if (attached > 0) bind()
      } else {
        setStatus('denied')
      }
    } catch {
      setStatus('denied')
    }
    return tiltSensor.getStatus()
  },
  // Test seam.
  reset() {
    unbind()
    listeners.clear()
    pointListeners.clear()
    status = null
    attached = 0
    baseline = null
    point = { x: 0, y: 0 }
  },
}
