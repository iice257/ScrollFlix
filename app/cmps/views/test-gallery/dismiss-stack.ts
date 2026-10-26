// One dismiss layer for every card, sheet and popup. Each open layer registers
// here in the order it opened, so Escape (and a press outside a popup that has
// no backdrop of its own) closes the topmost one and only that one.

export type DismissLayer = {
  close: () => void
  // True for a target that belongs to the layer or to whatever opened it, so a
  // press there is not "outside". Omit it on layers that have their own
  // backdrop: those are only closed by Escape here.
  contains?: (target: Node | null) => boolean
}

export type DismissStack = {
  push: (layer: DismissLayer) => () => void
  size: () => number
  // Closes the topmost layer. Returns whether there was one.
  dismissTop: () => boolean
  // Closes the topmost layer when the press landed outside it.
  pressOutside: (target: Node | null) => boolean
}

export const createDismissStack = (): DismissStack => {
  const layers: DismissLayer[] = []
  return {
    push(layer) {
      layers.push(layer)
      return () => {
        const index = layers.lastIndexOf(layer)
        if (index !== -1) layers.splice(index, 1)
      }
    },
    size: () => layers.length,
    dismissTop() {
      const top = layers[layers.length - 1]
      if (!top) return false
      top.close()
      return true
    },
    pressOutside(target) {
      const top = layers[layers.length - 1]
      if (!top?.contains || top.contains(target)) return false
      top.close()
      return true
    },
  }
}

export const dismissStack = createDismissStack()

let attached = false
// Installed once, on the first layer. Escape runs in the bubble phase, after
// the capture-phase handlers that must win (the Shuffle Pro abort, the share
// sheets), which stop the event before it gets here.
const attach = () => {
  if (attached || typeof window === 'undefined') return
  attached = true
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (dismissStack.dismissTop()) event.preventDefault()
  })
  window.addEventListener(
    'pointerdown',
    (event) => {
      dismissStack.pressOutside(
        event.target instanceof Node ? event.target : null,
      )
    },
    true,
  )
}

export const registerDismissLayer = (layer: DismissLayer) => {
  attach()
  return dismissStack.push(layer)
}
