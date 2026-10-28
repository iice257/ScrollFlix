import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  type SheetFrame,
  type SheetSnap,
  dragVelocity,
  sheetFrame,
  sheetSettle,
} from './sheet-drag'

type Sample = { y: number; t: number }

type Drag = {
  // Where the finger was when the sheet took the gesture over.
  originY: number
  startHeight: number
  samples: Sample[]
  frame: SheetFrame
}

type Options = {
  // Off on wide screens, where the card is a centred panel.
  enabled: boolean
  cardRef: RefObject<HTMLElement | null>
  // The scrolling description: a finger on it drags the sheet once the content
  // has nothing left to scroll in that direction.
  contentRef: RefObject<HTMLElement | null>
  expanded: boolean
  // The resting heights, in px.
  limits: () => { compact: number; expanded: number }
  onSnap: (snap: SheetSnap) => void
}

// Drag the phone details sheet by its handle or by its content. The sheet
// follows the finger (its height and its offset, through `drag`) and settles
// on release (see sheet-drag.ts).
export const useSheetDrag = ({
  enabled,
  cardRef,
  contentRef,
  expanded,
  limits,
  onSnap,
}: Options) => {
  const [drag, setDrag] = useState<SheetFrame | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const limitsRef = useRef(limits)
  limitsRef.current = limits
  const onSnapRef = useRef(onSnap)
  onSnapRef.current = onSnap

  const begin = useCallback(
    (clientY: number) => {
      const height = cardRef.current?.getBoundingClientRect().height ?? 0
      dragRef.current = {
        originY: clientY,
        startHeight: height,
        samples: [{ y: clientY, t: performance.now() }],
        frame: { height, offset: 0 },
      }
    },
    [cardRef],
  )

  const move = useCallback((clientY: number) => {
    const current = dragRef.current
    if (!current) return
    const frame = sheetFrame(
      current.startHeight,
      clientY - current.originY,
      limitsRef.current(),
    )
    current.frame = frame
    current.samples.push({ y: clientY, t: performance.now() })
    if (current.samples.length > 12) current.samples.shift()
    setDrag(frame)
  }, [])

  const end = useCallback(() => {
    const current = dragRef.current
    dragRef.current = null
    pointerIdRef.current = null
    if (!current) return
    setDrag(null)
    onSnapRef.current(
      sheetSettle(
        current.frame,
        dragVelocity(current.samples),
        limitsRef.current(),
      ),
    )
  }, [])

  // The handle: pointer events, captured so the drag survives leaving it.
  const grip = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      pointerIdRef.current = event.pointerId
      event.currentTarget.setPointerCapture?.(event.pointerId)
      begin(event.clientY)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return
      move(event.clientY)
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return
      end()
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return
      end()
    },
  }

  // The content: a pull down from its top (shrinks an expanded sheet, closes a
  // compact one) or a pull up from its end (opens a compact one) belongs to
  // the sheet; everything else scrolls as usual.
  useEffect(() => {
    const element = contentRef.current
    if (!enabled || !element) return
    let startY: number | null = null
    let taken = false
    const atEnd = () =>
      element.scrollTop + element.clientHeight >= element.scrollHeight - 2
    const onStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? null
      taken = false
    }
    const onMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY
      if (startY === null || y === undefined) return
      if (!taken) {
        const delta = y - startY
        const pullDown = delta > 8 && element.scrollTop <= 0
        const pullUp = delta < -8 && !expandedRef.current && atEnd()
        if (!pullDown && !pullUp) return
        taken = true
        begin(y)
      }
      // Stops the page and the content from scrolling under the sheet.
      if (event.cancelable) event.preventDefault()
      move(y)
    }
    const onEnd = () => {
      startY = null
      if (!taken) return
      taken = false
      end()
    }
    element.addEventListener('touchstart', onStart, { passive: true })
    element.addEventListener('touchmove', onMove, { passive: false })
    element.addEventListener('touchend', onEnd)
    element.addEventListener('touchcancel', onEnd)
    return () => {
      element.removeEventListener('touchstart', onStart)
      element.removeEventListener('touchmove', onMove)
      element.removeEventListener('touchend', onEnd)
      element.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, contentRef, begin, move, end])

  return { drag, grip }
}
