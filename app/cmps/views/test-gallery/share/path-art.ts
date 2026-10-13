// The session path card: a 1080x1350 night sky with the films this visit
// landed on, joined by a thread of light in the order they were found. A
// Shuffle Pro landing glows in its path's colour.
//
// Like the other share artwork, one function draws any moment `t` (seconds),
// so the still image is the last frame and the clip is the whole thing.

import { PATH_INK, type PathPoint } from '../session-path'
import { TIER_LABELS, type Tier } from '../shuffle-pro/shuffle-pro-logic'
import {
  FONT,
  SHARE_CLIP_SECONDS,
  SHARE_HEIGHT,
  SHARE_WIDTH,
  clamp01,
  ease,
  easeOutBack,
  makeCanvas,
  makeGrain,
  roundedRect,
  seededRandom,
  setTracking,
} from './share-art'

export type PathScene = {
  // The films in the order they were found; the latest are kept if there are
  // more than fit on the card.
  stops: { title: string; tier: Tier | null }[]
}

// How many stops one card shows.
export const PATH_CARD_STOPS = 12

type Star = { x: number; y: number; size: number; phase: number; speed: number }

export type PreparedPath = {
  stops: PathScene['stops']
  hidden: number
  layout: { x: number; y: number; side: -1 | 1 }[]
  backdrop: HTMLCanvasElement
  grain: HTMLCanvasElement
  stars: Star[]
}

const TOP = 500
const BOTTOM = 1160
const CENTRE = SHARE_WIDTH / 2

export const stopsFromPath = (
  path: readonly PathPoint[],
  titleOf: (id: string) => string | null,
): PathScene['stops'] =>
  path.flatMap((point) => {
    const title = titleOf(point.id)
    return title ? [{ title, tier: point.tier }] : []
  })

// A winding line down the card, one stop at a time, with the same shape for the
// same path.
export const layoutStops = (count: number, seed: number) => {
  const random = seededRandom(seed * 13 + 7)
  const gap = Math.min(112, (BOTTOM - TOP) / Math.max(1, count - 1))
  const height = gap * Math.max(0, count - 1)
  const top = TOP + (BOTTOM - TOP - height) / 2
  const phase = random() * Math.PI * 2
  return Array.from({ length: count }, (_, index) => ({
    x: CENTRE + Math.sin(index * 0.95 + phase) * 150,
    y: top + index * gap,
    side: (index % 2 === 0 ? -1 : 1) as -1 | 1,
  }))
}

export const preparePath = (scene: PathScene): PreparedPath => {
  const hidden = Math.max(0, scene.stops.length - PATH_CARD_STOPS)
  const stops = scene.stops.slice(-PATH_CARD_STOPS)
  const backdrop = makeCanvas(SHARE_WIDTH, SHARE_HEIGHT)
  const ctx = backdrop.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')

  const base = ctx.createLinearGradient(0, 0, 0, SHARE_HEIGHT)
  base.addColorStop(0, '#04050c')
  base.addColorStop(0.55, '#0a0d21')
  base.addColorStop(1, '#04050c')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)
  const haze = ctx.createRadialGradient(CENTRE, 820, 0, CENTRE, 820, 620)
  haze.addColorStop(0, 'rgba(120, 140, 255, 0.16)')
  haze.addColorStop(1, 'rgba(120, 140, 255, 0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)

  const random = seededRandom(stops.length * 29 + 11)
  const stars: Star[] = Array.from({ length: 110 }, () => ({
    x: random() * SHARE_WIDTH,
    y: random() * SHARE_HEIGHT,
    size: 0.8 + random() * 2.2,
    phase: random() * Math.PI * 2,
    speed: 0.6 + random() * 1.8,
  }))

  return {
    stops,
    hidden,
    layout: layoutStops(stops.length, stops.length),
    backdrop,
    grain: makeGrain(),
    stars,
  }
}

const rgbOf = (tier: Tier | null) => (tier ? PATH_INK[tier].dark : null)

const fit = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text
  let shortened = text
  while (
    shortened.length > 1 &&
    ctx.measureText(`${shortened}…`).width > maxWidth
  ) {
    shortened = shortened.slice(0, -1)
  }
  return `${shortened.trimEnd()}…`
}

// One frame at `t` seconds, always 1080x1350.
export const drawPath = (
  ctx: CanvasRenderingContext2D,
  prepared: PreparedPath,
  rawT: number,
) => {
  const t = Math.max(0, rawT)
  const { stops, layout } = prepared
  ctx.save()
  ctx.clearRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)
  ctx.drawImage(prepared.backdrop, 0, 0, SHARE_WIDTH, SHARE_HEIGHT)

  for (const star of prepared.stars) {
    const alpha =
      0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase))
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * ease(t, 0, 0.8)})`
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
    ctx.fill()
  }

  // Header.
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.globalAlpha = ease(t, 0.15, 0.8)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)'
  ctx.font = `800 30px ${FONT}`
  setTracking(ctx, 9)
  ctx.fillText('SESSION PATH', CENTRE, 150)
  setTracking(ctx, 0)
  ctx.globalAlpha = ease(t, 0.25, 0.95)
  ctx.fillStyle = '#ffffff'
  ctx.font = `950 150px ${FONT}`
  setTracking(ctx, -6)
  const total = stops.length + prepared.hidden
  ctx.fillText(
    `${total} ${total === 1 ? 'film' : 'films'}`,
    CENTRE,
    310 + (1 - ease(t, 0.25, 0.95)) * 24,
  )
  setTracking(ctx, 0)
  ctx.globalAlpha = ease(t, 0.5, 1.1)
  ctx.font = `750 40px ${FONT}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)'
  ctx.fillText(
    prepared.hidden
      ? `the last ${stops.length} of the way here`
      : 'the way I got here',
    CENTRE,
    390,
  )
  ctx.restore()

  if (stops.length >= 1) {
    const reveal = clamp01((t - 0.9) / 3.0) * (stops.length - 1)

    // The thread, drawn stop by stop; a Shuffle Pro stop colours its link.
    ctx.save()
    ctx.lineCap = 'round'
    for (let index = 1; index < stops.length; index += 1) {
      const progress = clamp01(reveal - (index - 1))
      if (progress <= 0) break
      const a = layout[index - 1]
      const b = layout[index]
      const rgb = rgbOf(stops[index].tier)
      const bendX = (a.x + b.x) / 2 + (index % 2 === 0 ? 70 : -70)
      const midY = (a.y + b.y) / 2
      ctx.shadowColor = rgb ? `rgba(${rgb}, 0.9)` : 'rgba(255, 255, 255, 0.55)'
      ctx.shadowBlur = rgb ? 22 : 8
      ctx.strokeStyle = rgb ? `rgba(${rgb}, 0.95)` : 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = rgb ? 6 : 3
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      // A quadratic arc, cut off at `progress` of its length.
      const steps = 24
      for (let step = 1; step <= Math.round(steps * progress); step += 1) {
        const u = step / steps
        const k = 1 - u
        ctx.lineTo(
          k * k * a.x + 2 * k * u * bendX + u * u * b.x,
          k * k * a.y + 2 * k * u * midY + u * u * b.y,
        )
      }
      ctx.stroke()
    }
    ctx.restore()

    // The stops and their titles.
    stops.forEach((stop, index) => {
      const appear = clamp01(reveal - index + 0.6)
      if (appear <= 0 && index > 0) return
      const spot = layout[index]
      const rgb = rgbOf(stop.tier)
      const pop = index === 0 ? 1 : easeOutBack(appear)
      const latest = index === stops.length - 1

      ctx.save()
      ctx.translate(spot.x, spot.y)
      ctx.scale(pop, pop)
      if (rgb) {
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 62)
        halo.addColorStop(
          0,
          `rgba(${rgb}, ${0.5 + 0.12 * Math.sin(t * 2 + index)})`,
        )
        halo.addColorStop(1, `rgba(${rgb}, 0)`)
        ctx.fillStyle = halo
        ctx.fillRect(-62, -62, 124, 124)
        ctx.strokeStyle = `rgba(${rgb}, 1)`
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(0, 0, 20, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.shadowColor = rgb ? `rgba(${rgb}, 1)` : 'rgba(255, 255, 255, 0.8)'
      ctx.shadowBlur = rgb ? 24 : 14
      ctx.fillStyle = rgb ? `rgb(${rgb})` : '#ffffff'
      ctx.beginPath()
      ctx.arc(0, 0, rgb ? 10 : 8, 0, Math.PI * 2)
      ctx.fill()
      if (latest) {
        ctx.shadowBlur = 0
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, 30 + 4 * Math.sin(t * 2.2), 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = ease(
        t,
        0.9 + (index / Math.max(1, stops.length - 1)) * 3.0,
        1.5 + (index / Math.max(1, stops.length - 1)) * 3.0,
      )
      if (index === 0) ctx.globalAlpha = ease(t, 0.7, 1.3)
      ctx.textBaseline = 'middle'
      ctx.textAlign = spot.side < 0 ? 'right' : 'left'
      ctx.font = `${latest ? 900 : 750} ${latest ? 38 : 32}px ${FONT}`
      ctx.fillStyle = latest ? '#ffffff' : 'rgba(255, 255, 255, 0.86)'
      const edge = spot.x + spot.side * 44
      const room = spot.side < 0 ? edge - 70 : SHARE_WIDTH - 70 - edge
      ctx.fillText(
        fit(ctx, stop.title, Math.min(room, 430)),
        edge,
        spot.y - (rgb ? 12 : 0),
      )
      if (rgb && stop.tier) {
        ctx.font = `800 22px ${FONT}`
        setTracking(ctx, 3)
        ctx.fillStyle = `rgb(${rgb})`
        ctx.fillText(TIER_LABELS[stop.tier].toUpperCase(), edge, spot.y + 20)
        setTracking(ctx, 0)
      }
      ctx.restore()
    })
  }

  // Footer.
  ctx.save()
  ctx.globalAlpha = ease(t, 2.6, 3.4)
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = `900 40px ${FONT}`
  setTracking(ctx, 2)
  ctx.fillText('ScrollFlix', CENTRE, 1308)
  setTracking(ctx, 0)
  ctx.restore()

  ctx.save()
  roundedRect(ctx, 20, 20, SHARE_WIDTH - 40, SHARE_HEIGHT - 40, 46)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.globalCompositeOperation = 'overlay'
  const pattern = ctx.createPattern(prepared.grain, 'repeat')
  if (pattern) {
    ctx.translate(Math.floor((t * 977) % 256), Math.floor((t * 631) % 256))
    ctx.fillStyle = pattern
    ctx.fillRect(-256, -256, SHARE_WIDTH + 512, SHARE_HEIGHT + 512)
  }
  ctx.restore()

  if (t < 0.4) {
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - t / 0.4})`
    ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)
  }
  ctx.restore()
}

export const drawPathFinal = (
  ctx: CanvasRenderingContext2D,
  prepared: PreparedPath,
) => drawPath(ctx, prepared, SHARE_CLIP_SECONDS)
