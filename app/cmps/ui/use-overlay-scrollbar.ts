import { type Ref, useCallback } from 'react'

import { attachOverlayScrollbar } from './overlay-scrollbar'

const assign = <T>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

/**
 * A ready-made ref for containers that have no ref of their own:
 * `<div ref={overlayScrollbarRef}>`. It is one stable function, so React
 * attaches it once on mount and runs the cleanup when the element leaves.
 */
export const overlayScrollbarRef = (node: HTMLElement | null) =>
  node ? attachOverlayScrollbar(node) : undefined

/**
 * The same for a container that already has a ref to keep: pass that ref in
 * and use the result as the element's `ref`.
 */
export const useOverlayScrollbar = <T extends HTMLElement>(
  forwardedRef?: Ref<T>,
) =>
  useCallback(
    (node: T | null) => {
      assign(forwardedRef, node)
      if (!node) return
      const detach = attachOverlayScrollbar(node)
      return () => {
        detach()
        assign(forwardedRef, null)
      }
    },
    [forwardedRef],
  )
