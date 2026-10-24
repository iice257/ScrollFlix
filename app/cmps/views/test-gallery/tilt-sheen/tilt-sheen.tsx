import { Smartphone } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  getSafeStorage,
  nextTiltHint,
  readTiltHint,
  shouldShowTiltHint,
  writeTiltHint,
} from './tilt-hint-memory'
import { tiltSensor } from './tilt-sensor'
import './tilt-sheen.css'
import { useTiltSheen } from './use-tilt-sheen'

type Variant = 'poster' | 'card' | 'share'

// The foil and the glare, driven by the --ts-* variables of whichever ancestor
// the tilt hook writes to. Colours come from the card's own tier variables, so
// each Shuffle Pro tier keeps its character.
export const SheenLayers = ({ variant = 'poster' }: { variant?: Variant }) => (
  <span className='ts-sheen' data-variant={variant} aria-hidden='true'>
    <i className='ts-foil' />
    <i className='ts-glare' />
  </span>
)

// A sheen that looks after itself: it listens on the closest ancestor matching
// `areaSelector` and writes its own variables, with no tilt. For layers laid
// over a whole card.
export const TiltSheen = ({
  variant = 'card',
  areaSelector,
}: {
  variant?: Variant
  areaSelector: string
}) => {
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const areaRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    areaRef.current =
      rootRef.current?.closest<HTMLElement>(areaSelector) ?? null
  }, [areaSelector])
  useTiltSheen({ areaRef, targetRef: rootRef, tiltDeg: 0 })
  return (
    <span ref={rootRef} className='ts-root' data-variant={variant}>
      <SheenLayers variant={variant} />
    </span>
  )
}

const HINT_MS = 5600
const FADE_MS = 320

type HintPhase = 'idle' | 'in' | 'out'

// "Tilt your phone": a small pill over the card on touch devices that have an
// orientation sensor. On iOS it is a button, because the sensor needs a tap
// before it will report. It goes away once tilt is detected or after a few
// seconds, and is remembered so it does not come back every time.
export const TiltHint = () => {
  const status = useSyncExternalStore(
    tiltSensor.subscribe,
    tiltSensor.getStatus,
    () => 'unsupported' as const,
  )
  const [phase, setPhase] = useState<HintPhase>('idle')
  const startedRef = useRef(false)

  // Show it once per mount, if the memory allows.
  useEffect(() => {
    if (startedRef.current) return
    if (status !== 'needs-permission' && status !== 'listening') return
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    const storage = getSafeStorage()
    const memory = readTiltHint(storage)
    if (!shouldShowTiltHint(memory)) return
    startedRef.current = true
    writeTiltHint(storage, nextTiltHint(memory, 'shown'))
    setPhase('in')
    const timer = window.setTimeout(() => setPhase('out'), HINT_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  // Tilt detected: the job is done for good.
  useEffect(() => {
    if (status === 'active') {
      writeTiltHint(
        getSafeStorage(),
        nextTiltHint(readTiltHint(getSafeStorage()), 'detected'),
      )
      setPhase((p) => (p === 'in' ? 'out' : p))
    }
    if (status === 'denied' || status === 'unsupported') {
      setPhase((p) => (p === 'in' ? 'out' : p))
    }
  }, [status])

  useEffect(() => {
    if (phase !== 'out') return
    const timer = window.setTimeout(() => setPhase('idle'), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'idle') return null
  const content = (
    <>
      <Smartphone className='ts-hint-icon' aria-hidden='true' size={13} />
      Tilt your phone
    </>
  )
  if (status === 'needs-permission') {
    return (
      <button
        type='button'
        className='ts-hint'
        data-phase={phase}
        onClick={() => {
          void tiltSensor.requestPermission()
        }}
      >
        {content}
      </button>
    )
  }
  return (
    <output className='ts-hint' data-phase={phase}>
      {content}
    </output>
  )
}
