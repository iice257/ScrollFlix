import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import './golden-hour.css'
import {
  GOLDEN_HOUR,
  goldenHourDelay,
  goldenHourStore,
  readGoldenHourLast,
  shouldHaveGoldenHour,
} from './golden-hour'

export const useGoldenHour = () =>
  useSyncExternalStore(
    goldenHourStore.subscribe,
    goldenHourStore.get,
    goldenHourStore.get,
  )

// Decides once per visit whether there is a golden hour, and when. `?golden-hour`
// in the address starts one a few seconds after the globe is ready, for testing.
export const useGoldenHourScheduler = (ready: boolean) => {
  const decided = useRef(false)

  useEffect(() => {
    if (!ready || decided.current) return
    decided.current = true
    let startTimer = 0
    let endTimer = 0
    const forced = new URLSearchParams(window.location.search).has(
      'golden-hour',
    )
    const wanted =
      forced ||
      shouldHaveGoldenHour({
        now: Date.now(),
        lastAt: readGoldenHourLast(),
        random: Math.random,
      })
    if (wanted) {
      startTimer = window.setTimeout(
        () => {
          goldenHourStore.start()
          endTimer = window.setTimeout(
            () => goldenHourStore.end(),
            GOLDEN_HOUR.durationMs,
          )
        },
        forced ? 3000 : goldenHourDelay(Math.random),
      )
    }
    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(endTimer)
      goldenHourStore.end()
    }
  }, [ready])
}

// The sky change: a slow warm light rising from the bottom of the screen.
export const GoldenHourWash = () => (
  <div className='warp-golden-wash' aria-hidden='true' />
)

const NOTE_MS = 6500

// One quiet line when it begins, so the change means something.
export const GoldenHourNote = ({ active }: { active: boolean }) => {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), NOTE_MS)
    return () => window.clearTimeout(timer)
  }, [active])
  if (!visible) return null
  return (
    <output className='warp-golden-note'>
      The light is turning golden. Gold is easier to find.
    </output>
  )
}
