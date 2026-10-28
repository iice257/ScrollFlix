import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import {
  type SheetSnap,
  dragVelocity,
  sheetDecision,
  sheetOffset,
} from './sheet-drag'

type Sample = { y: number; t: number }

type Drag = {
  // Where the finger was when the sheet took the gesture over.
  originY: number
  // Where the sheet was then (a grab in mid-settle starts from where it is).
  startOffset: number
  expanded: boolean
  samples: Sample[]
  offset: number
}

type Options = {
  // Off on wide screens, where the card is a centred panel.
  enabled: boolean
  cardRef: RefObject<HTMLElement | null>
  // The scrolling description: a finger on it drags the sheet once the content
  // has nothing left to scroll in that direction.
  contentRef: RefObject<HTMLElement | null>
  expanded: boolean
  // How far the sheet can grow upward from compact, in px.
  room: () => number
  reducedMotion: boolean
  onSnap: (snap: SheetSnap) => void
}

// How long the sheet takes to settle, and how: Reddit's bottom sheet uses
// 300 ms ease for every settle.
const SETTLE = 'transform 300ms ease'
const SETTLE_MS = 300

// Drag the phone details sheet by its handle or by its content. While a finger
// is down the sheet's offset is written straight to the card (one transform
// per frame, nothing goes through React), and on release it settles with a
// transition (see sheet-drag.ts for the rules).
//
// The sheet has two heights, switched by the `expanded` class. A change of
// height (from a drag, the More button or a scroll to the end) is played as a
// slide: the card takes its new height at once and is moved back to where it
// was, then eased to rest, so it never animates layout.
export const useSheetDrag = ({
  enabled,
  cardRef,
  contentRef,
  expanded,
  room,
  reducedMotion,
  onSnap,
}: Options) => {
  const dragRef = useRef<Drag | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  const pendingOffsetRef = useRef<number | null>(null)
  const settleTimerRef = useRef(0)
  // The offset the sheet was released at, for the slide that follows a change
  // of height; and the card's height as of the last render.
  const releasedAtRef = useRef(0)
  const heightRef = useRef(0)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const roomRef = useRef(room)
  roomRef.current = room
  const onSnapRef = useRef(onSnap)
  onSnapRef.current = onSnap
  const reducedRef = useRef(reducedMotion)
  reducedRef.current = reducedMotion

  // Offset and the strip of sheet colour under a sheet lifted off the bottom.
  const paint = useCallback(
    (offset: number) => {
      const card = cardRef.current
      if (!card) return
      card.style.setProperty('--sheet-y', `${offset}px`)
      card.style.setProperty('--sheet-tail', `${Math.max(0, -offset)}px`)
    },
    [cardRef],
  )

  const currentOffset = useCallback(() => {
    const card = cardRef.current
    if (!card) return 0
    const { transform } = getComputedStyle(card)
    if (!transform || transform === 'none') return 0
    return new DOMMatrixReadOnly(transform).m42
  }, [cardRef])

  const cancelFrame = useCallback(() => {
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
  }, [])

  const stopSettle = useCallback(() => {
    window.clearTimeout(settleTimerRef.current)
    const card = cardRef.current
    if (card) card.style.transition = 'none'
  }, [cardRef])

  // Ease the sheet to rest from wherever it is.
  const settleToRest = useCallback(() => {
    const card = cardRef.current
    if (!card) return
    window.clearTimeout(settleTimerRef.current)
    card.classList.remove('is-dragging')
    if (reducedRef.current) {
      card.style.transition = 'none'
      paint(0)
      return
    }
    card.style.transition = SETTLE
    paint(0)
    settleTimerRef.current = window.setTimeout(() => {
      card.style.transition = 'none'
      card.style.setProperty('--sheet-tail', '0px')
    }, SETTLE_MS + 40)
  }, [cardRef, paint])

  const begin = useCallback(
    (clientY: number) => {
      const card = cardRef.current
      if (!card) return
      cancelFrame()
      stopSettle()
      const startOffset = currentOffset()
      // Freeze the sheet where it is, then let the finger have it.
      paint(startOffset)
      card.classList.add('is-dragging')
      dragRef.current = {
        originY: clientY,
        startOffset,
        expanded: expandedRef.current,
        samples: [{ y: clientY, t: performance.now() }],
        offset: startOffset,
      }
    },
    [cardRef, cancelFrame, stopSettle, currentOffset, paint],
  )

  const move = useCallback(
    (clientY: number) => {
      const current = dragRef.current
      if (!current) return
      const grow = current.expanded ? 0 : roomRef.current()
      const offset =
        current.startOffset + sheetOffset(clientY - current.originY, grow)
      current.offset = offset
      current.samples.push({ y: clientY, t: performance.now() })
      if (current.samples.length > 12) current.samples.shift()
      pendingOffsetRef.current = offset
      if (frameRef.current) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0
        const next = pendingOffsetRef.current
        pendingOffsetRef.current = null
        if (next !== null) paint(next)
      })
    },
    [paint],
  )

  const end = useCallback(() => {
    const current = dragRef.current
    dragRef.current = null
    pointerIdRef.current = null
    if (!current) return
    cancelFrame()
    const lastY =
      current.samples[current.samples.length - 1]?.y ?? current.originY
    const delta = lastY - current.originY
    const snap = sheetDecision(
      delta,
      dragVelocity(current.samples),
      current.expanded,
    )
    paint(current.offset)
    const card = cardRef.current
    if (snap === 'close') {
      // The exit animation takes over from where the sheet is.
      card?.style.setProperty('--details-drag-y', `${current.offset}px`)
      card?.classList.remove('is-dragging')
      onSnapRef.current('close')
      return
    }
    if ((snap === 'expanded') === current.expanded) {
      // Put back: no change of height, just ease home.
      releasedAtRef.current = 0
      settleToRest()
      return
    }
    releasedAtRef.current = current.offset
    onSnapRef.current(snap)
  }, [cardRef, cancelFrame, paint, settleToRest])

  // A change of height, whatever caused it, slides instead of jumping.
  // biome-ignore lint/correctness/useExhaustiveDependencies: expanded is the trigger
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || !enabled) return
    const before = heightRef.current
    const after = card.offsetHeight
    heightRef.current = after
    // The first render, or no change at all.
    if (!before || after === before) {
      releasedAtRef.current = 0
      return
    }
    // The card now sits `after - before` lower than its old top; start it
    // where its old top was (plus wherever the finger left it), then ease.
    const start = releasedAtRef.current + (after - before)
    releasedAtRef.current = 0
    window.clearTimeout(settleTimerRef.current)
    card.classList.remove('is-dragging')
    card.style.transition = 'none'
    paint(start)
    if (reducedRef.current) {
      paint(0)
      return
    }
    // Commit the starting frame, then ease to rest.
    void card.offsetHeight
    card.style.transition = SETTLE
    paint(0)
    settleTimerRef.current = window.setTimeout(() => {
      card.style.transition = 'none'
      card.style.setProperty('--sheet-tail', '0px')
    }, SETTLE_MS + 40)
  }, [expanded, enabled, cardRef, paint])

  // Remember the height after every render, so the next change has a "before".
  useLayoutEffect(() => {
    if (enabled && cardRef.current)
      heightRef.current = cardRef.current.offsetHeight
  })

  useEffect(
    () => () => {
      cancelFrame()
      window.clearTimeout(settleTimerRef.current)
    },
    [cancelFrame],
  )

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

  return { grip }
}
