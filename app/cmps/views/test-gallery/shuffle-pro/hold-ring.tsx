import { useEffect, useRef } from 'react'
import type { ShuffleProController } from './shuffle-pro-controller'

type HoldRingProps = {
  controller: ShuffleProController | null | undefined
}

// A thin ring that fills around a held press, from 1.5s until the run starts.
// It is driven without React: the controller announces the ring once when it
// appears and once when it goes, and the fill is a CSS animation started with
// the exact time left. Nothing renders per frame and it never takes a pointer.
export const HoldRing = ({ controller }: HoldRingProps) => {
  const ringRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = ringRef.current
    if (!element || !controller) return
    return controller.subscribeHold((ring) => {
      if (!ring) {
        // Fade out where it is: the fill pauses instead of emptying.
        if (element.dataset.state === 'filling') element.dataset.state = 'done'
        return
      }
      element.dataset.state = 'idle'
      element.style.setProperty('--hold-x', `${ring.nx * 100}%`)
      element.style.setProperty('--hold-y', `${ring.ny * 100}%`)
      element.style.setProperty('--hold-total', `${ring.totalMs}ms`)
      // Starting a little in if the first frame was late.
      element.style.setProperty(
        '--hold-delay',
        `${-Math.round(ring.progress * ring.totalMs)}ms`,
      )
      // Restart the animation for a new press.
      void element.offsetWidth
      element.dataset.state = 'filling'
    })
  }, [controller])

  return (
    <div
      ref={ringRef}
      className='warp-hold-ring'
      data-state='idle'
      aria-hidden='true'
    >
      <svg viewBox='0 0 64 64' focusable='false'>
        <circle className='warp-hold-ring-track' cx='32' cy='32' r='29' />
        <circle
          className='warp-hold-ring-arc'
          cx='32'
          cy='32'
          r='29'
          pathLength='100'
        />
      </svg>
    </div>
  )
}
