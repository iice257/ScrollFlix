// One custom scrollbar for every scroll container.
//
// The native bar is hidden (see `[data-osb]` in styles.css) so it can never
// take layout width, and a thumb is drawn over the container's right edge
// instead. The thumb lives in the page shell, not inside the container, so it
// adds nothing to the container's content and never scrolls away with it.
// Native scrolling (wheel, touch, keyboard, find-in-page) is left completely
// alone; the thumb only mirrors it and offers drag and click-to-page.

import { getScrollFromDrag, getThumbMetrics } from './scrollbar-math'

/** How long the thumb stays after scrolling stops. */
const HIDE_DELAY = 900
/** Pointer distance from the container's right edge that wakes the thumb. */
const HOVER_EDGE = 24
/** Gap between the thumb track and the container's top and bottom. Large
 * enough to clear a 20px corner radius. */
const TRACK_INSET = 12
/** Width of the strip that holds the thumb. */
const STRIP_WIDTH = 14

const LINE_PX = 16
const noop = () => {}

/** Touch devices keep their own overlay scrollbar, which is already thin. */
const usesNativeScrollbar = () =>
  typeof window === 'undefined' ||
  typeof document === 'undefined' ||
  window.matchMedia?.('(pointer: coarse)').matches === true

/** Stack the thumb just above the container's outermost layered ancestor. */
const getLayer = (el: HTMLElement, host: HTMLElement) => {
  let layer = 0
  for (let node: HTMLElement | null = el; node && node !== host; ) {
    const z = Number.parseInt(getComputedStyle(node).zIndex, 10)
    if (!Number.isNaN(z)) layer = z
    node = node.parentElement
  }
  return layer + 1
}

export const attachOverlayScrollbar = (el: HTMLElement): (() => void) => {
  if (usesNativeScrollbar()) return noop

  const host = el.closest<HTMLElement>('.warp-shell') ?? document.body
  const strip = document.createElement('div')
  const thumb = document.createElement('div')
  strip.className = 'warp-osb'
  strip.setAttribute('aria-hidden', 'true')
  thumb.className = 'warp-osb-thumb'
  strip.append(thumb)
  host.append(strip)
  el.setAttribute('data-osb', '')

  let frame = 0
  let hoverFrame = 0
  let hideTimer = 0
  let awake = false
  let scrollable = false
  let dragging = false
  let overStrip = false
  let pointerX = 0
  // Cached by the last measure, used while dragging.
  let trackSize = 0
  let thumbSize = 0
  // Last written values, so an unchanged frame writes nothing.
  let shown = ''
  let box = ''
  let thumbBox = ''

  const apply = () => {
    const show = scrollable && (awake || dragging || overStrip)
    const next = show ? 'true' : 'false'
    if (next === shown) return
    if (show) strip.style.zIndex = String(getLayer(el, host))
    shown = next
    strip.dataset.visible = next
  }

  const measure = () => {
    frame = 0
    const rect = el.getBoundingClientRect()
    const track = rect.height - TRACK_INSET * 2
    const metrics = getThumbMetrics(
      el.scrollHeight,
      el.clientHeight,
      el.scrollTop,
      track,
    )
    scrollable = metrics.visible
    trackSize = track
    thumbSize = metrics.size
    if (metrics.visible) {
      const left = Math.round(rect.right - STRIP_WIDTH)
      const top = Math.round(rect.top)
      const height = Math.round(rect.height)
      const nextBox = `${left}|${top}|${height}`
      if (nextBox !== box) {
        box = nextBox
        strip.style.left = `${left}px`
        strip.style.top = `${top}px`
        strip.style.height = `${height}px`
      }
      const nextThumb = `${metrics.size}|${metrics.offset.toFixed(1)}`
      if (nextThumb !== thumbBox) {
        thumbBox = nextThumb
        thumb.style.height = `${metrics.size}px`
        thumb.style.transform = `translateY(${(TRACK_INSET + metrics.offset).toFixed(1)}px)`
      }
    }
    apply()
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure)
  }

  const armHide = () => {
    window.clearTimeout(hideTimer)
    if (dragging || overStrip) return
    hideTimer = window.setTimeout(() => {
      awake = false
      apply()
    }, HIDE_DELAY)
  }

  const wake = () => {
    awake = true
    armHide()
    schedule()
  }

  // Reveal on hover near the right edge. The pointer position is stored and
  // read once per frame, so a busy pointer never forces layout per event.
  const onPointerMove = (event: PointerEvent) => {
    if (!scrollable || event.pointerType === 'touch') return
    pointerX = event.clientX
    if (hoverFrame) return
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0
      if (pointerX >= el.getBoundingClientRect().right - HOVER_EDGE) wake()
    })
  }

  const onThumbDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const startScroll = el.scrollTop
    dragging = true
    strip.dataset.active = 'true'
    thumb.setPointerCapture(event.pointerId)
    wake()

    const onMove = (move: PointerEvent) => {
      el.scrollTo({
        top: getScrollFromDrag(
          startScroll,
          move.clientY - startY,
          el.scrollHeight,
          el.clientHeight,
          trackSize,
          thumbSize,
        ),
        behavior: 'instant',
      })
    }
    const end = () => {
      dragging = false
      delete strip.dataset.active
      thumb.removeEventListener('pointermove', onMove)
      thumb.removeEventListener('pointerup', end)
      thumb.removeEventListener('pointercancel', end)
      thumb.removeEventListener('lostpointercapture', end)
      armHide()
      apply()
    }
    thumb.addEventListener('pointermove', onMove)
    thumb.addEventListener('pointerup', end)
    thumb.addEventListener('pointercancel', end)
    thumb.addEventListener('lostpointercapture', end)
  }

  // A press on the empty track pages toward it, like a native bar.
  const onStripDown = (event: PointerEvent) => {
    event.stopPropagation()
    if (event.target !== strip || event.button !== 0) return
    const direction = event.clientY < thumb.getBoundingClientRect().top ? -1 : 1
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({
      top: direction * el.clientHeight * 0.9,
      behavior: calm ? 'instant' : 'smooth',
    })
    wake()
  }

  // The strip sits over the container, so a wheel turned on it is handed back.
  const onStripWheel = (event: WheelEvent) => {
    const unit =
      event.deltaMode === 1
        ? LINE_PX
        : event.deltaMode === 2
          ? el.clientHeight
          : 1
    el.scrollBy({ top: event.deltaY * unit, behavior: 'instant' })
    wake()
  }

  const onStripEnter = () => {
    overStrip = true
    window.clearTimeout(hideTimer)
  }
  const onStripLeave = () => {
    overStrip = false
    armHide()
  }

  // Content that grows or shrinks changes the thumb without any scroll event.
  const resize = new ResizeObserver(schedule)
  const watchChildren = () => {
    resize.disconnect()
    resize.observe(el)
    for (const child of el.children) resize.observe(child)
    schedule()
  }
  watchChildren()
  const mutations = new MutationObserver(watchChildren)
  mutations.observe(el, { childList: true })

  el.addEventListener('scroll', wake, { passive: true })
  el.addEventListener('pointermove', onPointerMove, { passive: true })
  thumb.addEventListener('pointerdown', onThumbDown)
  strip.addEventListener('pointerdown', onStripDown)
  strip.addEventListener('wheel', onStripWheel, { passive: true })
  strip.addEventListener('pointerenter', onStripEnter)
  strip.addEventListener('pointerleave', onStripLeave)
  window.addEventListener('resize', schedule, { passive: true })

  return () => {
    window.clearTimeout(hideTimer)
    cancelAnimationFrame(frame)
    cancelAnimationFrame(hoverFrame)
    resize.disconnect()
    mutations.disconnect()
    el.removeEventListener('scroll', wake)
    el.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('resize', schedule)
    el.removeAttribute('data-osb')
    strip.remove()
  }
}
