import { useEffect, useRef } from 'react'
import { registerDismissLayer } from './dismiss-stack'

type Options = {
  // Says whether a node is part of the popup. Given this, a press anywhere
  // else (the opener excepted) closes the layer. Leave it out for layers that
  // have a backdrop of their own.
  inside?: (node: Node) => boolean
}

const isFocusable = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement &&
  element !== document.body &&
  element.isConnected

// Registers an open card, sheet or popup with the shared dismiss stack, and
// hands keyboard focus back to whatever opened it once it closes. Focus only
// moves back when it was left behind inside the closing layer (or nowhere), so
// a layer that took focus on purpose is never robbed of it.
export const useDismissLayer = (
  open: boolean,
  close: () => void,
  { inside }: Options = {},
) => {
  const closeRef = useRef(close)
  closeRef.current = close
  const insideRef = useRef(inside)
  insideRef.current = inside
  const hasInside = Boolean(inside)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    const unregister = registerDismissLayer({
      close: () => closeRef.current(),
      contains: hasInside
        ? (target) =>
            Boolean(
              target &&
                (insideRef.current?.(target) || opener?.contains(target)),
            )
        : undefined,
    })
    return () => {
      unregister()
      const active = document.activeElement
      const stranded =
        !active ||
        active === document.body ||
        Boolean(insideRef.current?.(active))
      if (stranded && isFocusable(opener)) opener.focus({ preventScroll: true })
    }
  }, [open, hasInside])
}
