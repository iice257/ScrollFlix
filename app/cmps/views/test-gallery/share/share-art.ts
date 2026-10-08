// The share artwork: a 1080x1350 poster of the pick, composed with Canvas 2D.
//
// One renderer draws every frame at a time `t` (in seconds), so the same code
// makes the still image (the finished frame) and the clip (frames 0..5s). The
// heavy, unchanging layers (backdrop, glow, the framed poster) are rendered
// once into offscreen canvases; each frame only composites them and draws the
// moving parts: light rays, orbiting sparks, the poster flip, holographic
// foil, lens flare, text reveals and grain.
//
// A premium pick gets its path's full treatment. An ordinary pick gets a
// quieter silver version of the same layout. There is deliberately no URL on
// it.

import { TIER_LABELS, type Tier } from '../shuffle-pro/shuffle-pro-logic'
import { PALETTES } from '../shuffle-pro/sky-pass'
import {
  CORNER_ART,
  GEM_BODY,
  GEM_FACETS,
  GEM_TOP,
} from '../shuffle-pro/tier-art'

export const SHARE_WIDTH = 1080
export const SHARE_HEIGHT = 1350
// The clip runs this long; the still image is the frame at the end of it.
export const SHARE_CLIP_SECONDS = 5

type Rgb = [number, number, number]
type Palette = {
  c0: Rgb
  c1: Rgb
  c2: Rgb
  deep: Rgb
  accent: Rgb
}

// An ordinary (non-premium) pick: silver on near-black.
const STANDARD_PALETTE: Palette = {
  c0: [1, 1, 1],
  c1: [0.86, 0.88, 0.92],
  c2: [0.56, 0.6, 0.68],
  deep: [0.05, 0.055, 0.07],
  accent: [1, 1, 1],
}

const rgba = ([r, g, b]: Rgb, alpha = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
// Progress of `t` between two moments, eased.
const ease = (t: number, from: number, to: number) => {
  const x = clamp01((t - from) / (to - from))
  return x * x * (3 - 2 * x)
}
const easeOutBack = (x: number) => {
  const c1 = 1.5
  const c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}

const seededRandom = (seed: number) => {
  let state = seed >>> 0 || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export const hashString = (value: string) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const FONT = '"DM Sans", system-ui, sans-serif'

const setTracking = (ctx: CanvasRenderingContext2D, px: number) => {
  try {
    ctx.letterSpacing = `${px}px`
  } catch {
    // letterSpacing is not available everywhere.
  }
}

const roundedRect = (
  ctx: CanvasRenderingContext2D | Path2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  if ('beginPath' in ctx) ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ---------------------------------------------------------------- the scene

export type ShareSource = CanvasImageSource & {
  width?: number
  height?: number
}

export type ShareScene = {
  title: string
  year: string
  // A short line under the year, such as "7.3 rating · 1h 52m".
  detail?: string
  // Null for an ordinary pick.
  tier: Tier | null
  poster: ShareSource | null
  // How many of the four paths are found, for the rarity pips.
  foundTiers?: Tier[]
}

const POSTER_W = 540
const POSTER_H = 810
const POSTER_X = (SHARE_WIDTH - POSTER_W) / 2
const POSTER_Y = 104
const POSTER_CX = SHARE_WIDTH / 2
const POSTER_CY = POSTER_Y + POSTER_H / 2
const FRAME = 14
const POSTER_RADIUS = 24

type Star = {
  x: number
  y: number
  size: number
  phase: number
  speed: number
  base: number
  kind: number
}

type Spark = {
  angle: number
  speed: number
  radius: number
  size: number
  phase: number
  lift: number
}

export type PreparedShare = {
  scene: ShareScene
  palette: Palette
  premium: boolean
  backdrop: HTMLCanvasElement
  framedPoster: HTMLCanvasElement
  glow: HTMLCanvasElement
  grain: HTMLCanvasElement
  stars: Star[]
  sparks: Spark[]
  pathAlpha: number
}

const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

const context2d = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  return ctx
}

// Fits an image to cover a box, centred.
const drawCover = (
  ctx: CanvasRenderingContext2D,
  source: ShareSource,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const iw = Number(source.width) || w
  const ih = Number(source.height) || h
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

// A soft round sprite in one colour: sparks and bokeh are this, scaled.
const makeGlowSprite = (color: Rgb) => {
  const canvas = makeCanvas(96, 96)
  const ctx = context2d(canvas)
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48)
  gradient.addColorStop(0, rgba([1, 1, 1], 1))
  gradient.addColorStop(0.18, rgba(color, 0.95))
  gradient.addColorStop(0.5, rgba(color, 0.25))
  gradient.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 96, 96)
  return canvas
}

const makeGrain = () => {
  const canvas = makeCanvas(256, 256)
  const ctx = context2d(canvas)
  const data = ctx.createImageData(256, 256)
  const random = seededRandom(7)
  for (let i = 0; i < data.data.length; i += 4) {
    const value = Math.floor(random() * 255)
    data.data[i] = value
    data.data[i + 1] = value
    data.data[i + 2] = value
    data.data[i + 3] = 255
  }
  ctx.putImageData(data, 0, 0)
  return canvas
}

const drawBackdrop = (
  scene: ShareScene,
  palette: Palette,
  premium: boolean,
  seed: number,
) => {
  const canvas = makeCanvas(SHARE_WIDTH, SHARE_HEIGHT)
  const ctx = context2d(canvas)
  const w = SHARE_WIDTH
  const h = SHARE_HEIGHT

  const base = ctx.createLinearGradient(0, 0, w * 0.4, h)
  base.addColorStop(0, rgba(palette.deep, 1))
  base.addColorStop(0.55, rgba(palette.deep.map((c) => c * 0.6) as Rgb, 1))
  base.addColorStop(1, rgba(palette.deep.map((c) => c * 0.38) as Rgb, 1))
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  // The poster itself, blown up and softened, tints the whole backdrop. A
  // tiny copy scaled up is a blur that works in every browser.
  if (scene.poster) {
    const tiny = makeCanvas(14, 21)
    const tinyCtx = context2d(tiny)
    tinyCtx.imageSmoothingQuality = 'high'
    drawCover(tinyCtx, scene.poster, 0, 0, 14, 21)
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.globalAlpha = premium ? 0.5 : 0.62
    ctx.globalCompositeOperation = 'screen'
    ctx.drawImage(tiny, -140, -180, w + 280, h + 360)
    ctx.restore()
    ctx.fillStyle = rgba(palette.deep, premium ? 0.52 : 0.42)
    ctx.fillRect(0, 0, w, h)
  }

  // Nebula glows in the path's colours.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const glows: Array<[number, number, number, Rgb, number]> = premium
    ? [
        [0.5, 0.38, 0.7, palette.c2, 0.42],
        [0.08, 0.1, 0.5, palette.c1, 0.26],
        [0.94, 0.9, 0.55, palette.c2, 0.3],
        [0.82, 0.18, 0.34, palette.accent, 0.14],
      ]
    : [
        [0.5, 0.4, 0.7, palette.c2, 0.16],
        [0.9, 0.9, 0.5, palette.c2, 0.1],
      ]
  for (const [gx, gy, radius, color, alpha] of glows) {
    const g = ctx.createRadialGradient(
      w * gx,
      h * gy,
      0,
      w * gx,
      h * gy,
      w * radius,
    )
    g.addColorStop(0, rgba(color, alpha))
    g.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()

  // Soft bokeh discs, out of focus.
  const random = seededRandom(seed ^ 0x9e3779b9)
  const sprite = makeGlowSprite(palette.c1)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const discs = premium ? 16 : 8
  for (let i = 0; i < discs; i += 1) {
    const size = 90 + random() * 220
    ctx.globalAlpha = 0.05 + random() * 0.1
    ctx.drawImage(
      sprite,
      random() * w - size / 2,
      random() * h - size / 2,
      size,
      size,
    )
  }
  ctx.restore()

  // Vignette.
  const vignette = ctx.createRadialGradient(
    w / 2,
    h * 0.46,
    h * 0.28,
    w / 2,
    h * 0.5,
    h * 0.78,
  )
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.62)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)
  return canvas
}

// The poster in its frame, with the glow around it, as one cached sprite. The
// glow overflows the poster, so the sprite is padded.
const GLOW_PAD = 150

const drawFramedPoster = (
  scene: ShareScene,
  palette: Palette,
  premium: boolean,
) => {
  const canvas = makeCanvas(POSTER_W + GLOW_PAD * 2, POSTER_H + GLOW_PAD * 2)
  const ctx = context2d(canvas)
  const x = GLOW_PAD
  const y = GLOW_PAD

  ctx.save()
  ctx.shadowColor = premium ? rgba(palette.c1, 0.62) : 'rgba(0, 0, 0, 0.7)'
  ctx.shadowBlur = premium ? 100 : 80
  ctx.shadowOffsetY = premium ? 0 : 30
  roundedRect(
    ctx,
    x - FRAME,
    y - FRAME,
    POSTER_W + FRAME * 2,
    POSTER_H + FRAME * 2,
    36,
  )
  ctx.fillStyle = rgba(palette.deep, 1)
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundedRect(ctx, x, y, POSTER_W, POSTER_H, POSTER_RADIUS)
  ctx.clip()
  if (scene.poster) {
    drawCover(ctx, scene.poster, x, y, POSTER_W, POSTER_H)
  } else {
    // No usable poster (blocked by CORS): the path's colours stand in.
    const placeholder = ctx.createLinearGradient(
      x,
      y,
      x + POSTER_W,
      y + POSTER_H,
    )
    placeholder.addColorStop(0, rgba(palette.c2, 1))
    placeholder.addColorStop(1, rgba(palette.deep, 1))
    ctx.fillStyle = placeholder
    ctx.fillRect(x, y, POSTER_W, POSTER_H)
  }
  // A faint top-light on the artwork, so it sits in the frame.
  const light = ctx.createLinearGradient(x, y, x, y + POSTER_H)
  light.addColorStop(0, 'rgba(255, 255, 255, 0.14)')
  light.addColorStop(0.25, 'rgba(255, 255, 255, 0)')
  light.addColorStop(1, 'rgba(0, 0, 0, 0.22)')
  ctx.fillStyle = light
  ctx.fillRect(x, y, POSTER_W, POSTER_H)
  ctx.restore()
  return canvas
}

export const prepareShare = (scene: ShareScene): PreparedShare => {
  const tier = scene.tier
  const premium = tier !== null
  const palette: Palette = tier ? PALETTES[tier] : STANDARD_PALETTE
  const seed = hashString(`${scene.title}${tier ?? 'plain'}`)
  const random = seededRandom(seed)

  const stars: Star[] = Array.from({ length: premium ? 150 : 60 }, () => ({
    x: random() * SHARE_WIDTH,
    y: random() * SHARE_HEIGHT,
    size: 0.9 + random() * 2.6,
    phase: random() * Math.PI * 2,
    speed: 0.8 + random() * 2.4,
    base: 0.25 + random() * 0.7,
    kind: Math.floor(random() * 3),
  }))
  const sparks: Spark[] = Array.from({ length: premium ? 54 : 0 }, () => ({
    angle: random() * Math.PI * 2,
    speed: 0.14 + random() * 0.22,
    radius: 0.92 + random() * 0.34,
    size: 14 + random() * 26,
    phase: random() * Math.PI * 2,
    lift: (random() - 0.5) * 60,
  }))

  return {
    scene,
    palette,
    premium,
    backdrop: drawBackdrop(scene, palette, premium, seed),
    framedPoster: drawFramedPoster(scene, palette, premium),
    glow: makeGlowSprite(palette.c1),
    grain: makeGrain(),
    stars,
    sparks,
    pathAlpha: 1,
  }
}

// ----------------------------------------------------------------- drawing

const drawStars = (
  ctx: CanvasRenderingContext2D,
  p: PreparedShare,
  t: number,
) => {
  const { palette, premium, stars, scene } = p
  const tier = scene.tier
  const intro = ease(t, 0, 1.2)
  for (const star of stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(t * star.speed + star.phase)
    const alpha = star.base * twinkle * intro
    if (alpha < 0.03) continue
    const color = [palette.c0, palette.c1, palette.accent][star.kind]
    ctx.globalAlpha = alpha
    ctx.fillStyle = rgba(color, 1)
    const { x, y, size } = star
    if (premium && (tier === 'amethyst' || tier === 'gold')) {
      const long = size * (tier === 'amethyst' ? 4.4 : 3.2)
      ctx.beginPath()
      ctx.moveTo(x, y - long)
      ctx.lineTo(x + size * 0.42, y)
      ctx.lineTo(x, y + long)
      ctx.lineTo(x - size * 0.42, y)
      ctx.closePath()
      ctx.moveTo(x - long, y)
      ctx.lineTo(x, y + size * 0.42)
      ctx.lineTo(x + long, y)
      ctx.lineTo(x, y - size * 0.42)
      ctx.closePath()
      ctx.fill()
    } else if (premium && tier === 'frost') {
      ctx.beginPath()
      ctx.moveTo(x, y - size * 2.6)
      ctx.lineTo(x + size, y)
      ctx.lineTo(x, y + size * 2.6)
      ctx.lineTo(x - size, y)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

// God rays fanning out from behind the poster.
const drawRays = (
  ctx: CanvasRenderingContext2D,
  p: PreparedShare,
  t: number,
) => {
  const { palette } = p
  const strength = ease(t, 0.1, 1.6)
  if (strength <= 0) return
  const wedges = 18
  const reach = 1100
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.translate(POSTER_CX, POSTER_CY)
  ctx.rotate(t * 0.045)
  const gradient = ctx.createRadialGradient(0, 0, 80, 0, 0, reach)
  gradient.addColorStop(0, rgba(palette.c1, 0.3 * strength))
  gradient.addColorStop(0.5, rgba(palette.c2, 0.1 * strength))
  gradient.addColorStop(1, rgba(palette.c2, 0))
  ctx.fillStyle = gradient
  for (let i = 0; i < wedges; i += 1) {
    const angle = (i / wedges) * Math.PI * 2
    const half = (Math.PI / wedges) * (0.34 + 0.2 * Math.sin(i * 2.1 + t * 0.6))
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(angle - half) * reach, Math.sin(angle - half) * reach)
    ctx.lineTo(Math.cos(angle + half) * reach, Math.sin(angle + half) * reach)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

// Sparks circling the poster on a tilted ellipse: the far half passes behind
// the poster, the near half in front.
const drawSparks = (
  ctx: CanvasRenderingContext2D,
  p: PreparedShare,
  t: number,
  half: 'back' | 'front',
) => {
  if (!p.sparks.length) return
  const intro = ease(t, 0.2, 1.4)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.translate(POSTER_CX, POSTER_CY + 40)
  ctx.rotate(-0.2)
  for (const spark of p.sparks) {
    const angle = spark.angle + t * spark.speed
    const depth = Math.sin(angle)
    const isFront = depth > 0
    if (isFront !== (half === 'front')) continue
    const rx = (POSTER_W / 2 + 150) * spark.radius
    const ry = 170 * spark.radius
    const x = Math.cos(angle) * rx
    const y = depth * ry + spark.lift
    const size = spark.size * (0.7 + 0.5 * (depth + 1) * 0.5)
    ctx.globalAlpha =
      (0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + spark.phase))) * intro
    ctx.drawImage(p.glow, x - size, y - size, size * 2, size * 2)
  }
  ctx.restore()
}

// The flip: a card back that turns to show the poster. Returns how far the
// card has turned (1 = finished) and whether the poster side is facing us.
const flipState = (t: number) => {
  const progress = clamp01((t - 0.35) / 1.15)
  const eased = easeOutBack(progress)
  const angle = ((1 - eased) * (-100 * Math.PI)) / 180
  return {
    progress,
    angle,
    showFront: Math.abs(angle) < Math.PI / 2 || progress >= 1,
  }
}

const drawGemPath = (
  ctx: CanvasRenderingContext2D,
  tier: Tier,
  x: number,
  y: number,
  size: number,
  alpha = 1,
) => {
  const palette = PALETTES[tier]
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 48, size / 48)
  ctx.globalAlpha = alpha
  const fill = ctx.createLinearGradient(0, 0, 48, 48)
  fill.addColorStop(0, rgba(palette.c0, 1))
  fill.addColorStop(0.55, rgba(palette.c1, 1))
  fill.addColorStop(1, rgba(palette.c2, 1))
  ctx.fillStyle = fill
  ctx.fill(new Path2D(GEM_BODY))
  ctx.globalAlpha = alpha * 0.55
  ctx.fillStyle = rgba(palette.c2, 1)
  ctx.fill(new Path2D(GEM_TOP))
  ctx.globalAlpha = alpha * 0.9
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 1.1
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(GEM_BODY))
  ctx.stroke(new Path2D(GEM_FACETS))
  ctx.restore()
}

const drawCardBack = (ctx: CanvasRenderingContext2D, p: PreparedShare) => {
  const { palette, scene } = p
  const x = POSTER_X
  const y = POSTER_Y
  ctx.save()
  roundedRect(ctx, x, y, POSTER_W, POSTER_H, POSTER_RADIUS)
  ctx.clip()
  const back = ctx.createLinearGradient(x, y, x + POSTER_W, y + POSTER_H)
  back.addColorStop(0, '#12161b')
  back.addColorStop(1, '#05070a')
  ctx.fillStyle = back
  ctx.fillRect(x, y, POSTER_W, POSTER_H)
  const glow = ctx.createRadialGradient(
    POSTER_CX,
    POSTER_CY,
    0,
    POSTER_CX,
    POSTER_CY,
    380,
  )
  glow.addColorStop(0, rgba(palette.c2, 0.5))
  glow.addColorStop(1, rgba(palette.c2, 0))
  ctx.fillStyle = glow
  ctx.fillRect(x, y, POSTER_W, POSTER_H)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  ctx.lineWidth = 2
  for (let d = -POSTER_H; d < POSTER_W; d += 18) {
    ctx.beginPath()
    ctx.moveTo(x + d, y + POSTER_H)
    ctx.lineTo(x + d + POSTER_H, y)
    ctx.stroke()
  }
  ctx.restore()
  if (scene.tier) {
    drawGemPath(ctx, scene.tier, POSTER_CX - 90, POSTER_CY - 90, 180)
  }
}

// Holographic foil over the poster: banded colour that slides across it.
const drawFoil = (
  ctx: CanvasRenderingContext2D,
  p: PreparedShare,
  t: number,
) => {
  const { palette } = p
  const x = POSTER_X
  const y = POSTER_Y
  const slide = (t * 0.12) % 1.6
  const sweep = ease(t, 1.5, 2.6)
  ctx.save()
  roundedRect(ctx, x, y, POSTER_W, POSTER_H, POSTER_RADIUS)
  ctx.clip()
  ctx.globalCompositeOperation = 'color-dodge'
  const span = POSTER_W + POSTER_H
  const start = x - POSTER_H + (slide - 0.3) * span
  const gradient = ctx.createLinearGradient(
    start,
    y,
    start + span * 0.6,
    y + POSTER_H,
  )
  gradient.addColorStop(0, rgba(palette.c2, 0))
  gradient.addColorStop(0.3, rgba(palette.c1, 0.7))
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.65)')
  gradient.addColorStop(0.7, rgba(palette.accent, 0.7))
  gradient.addColorStop(1, rgba(palette.c2, 0))
  ctx.globalAlpha = 0.34 * sweep
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, POSTER_W, POSTER_H)

  // A single bright pass across the poster as the card lands.
  const pass = clamp01((t - 1.55) / 0.9)
  if (pass > 0 && pass < 1) {
    ctx.globalCompositeOperation = 'lighter'
    const px = x - 200 + pass * (POSTER_W + 400)
    const band = ctx.createLinearGradient(
      px - 90,
      y,
      px + 90,
      y + POSTER_H * 0.35,
    )
    band.addColorStop(0, 'rgba(255, 255, 255, 0)')
    band.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)')
    band.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.globalAlpha = 1
    ctx.fillStyle = band
    ctx.fillRect(x, y, POSTER_W, POSTER_H)
  }
  ctx.restore()
}

// The frame's border: it draws itself around the poster, then keeps a slow
// shimmer travelling along it.
const drawBorder = (
  ctx: CanvasRenderingContext2D,
  p: PreparedShare,
  t: number,
) => {
  const { palette, scene } = p
  const x = POSTER_X - FRAME
  const y = POSTER_Y - FRAME
  const w = POSTER_W + FRAME * 2
  const h = POSTER_H + FRAME * 2
  const perimeter = 2 * (w + h) - (8 - 2 * Math.PI) * 36
  const draw = ease(t, 1.25, 2.35)
  const width = scene.tier === 'gold' ? 7 : 5

  ctx.save()
  roundedRect(ctx, x, y, w, h, 36)
  const border = ctx.createLinearGradient(x, y, x + w, y + h)
  border.addColorStop(0, rgba(palette.c0, 1))
  border.addColorStop(0.35, rgba(palette.c2, 1))
  border.addColorStop(0.7, rgba(palette.c1, 1))
  border.addColorStop(1, rgba(palette.c0, 1))
  ctx.strokeStyle = border
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.shadowColor = rgba(palette.c1, 0.9)
  ctx.shadowBlur = 18 * draw
  ctx.setLineDash([perimeter * draw, perimeter])
  ctx.stroke()
  ctx.restore()

  // The travelling highlight.
  if (draw >= 1) {
    ctx.save()
    roundedRect(ctx, x, y, w, h, 36)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.lineWidth = width - 1
    ctx.lineCap = 'round'
    ctx.shadowColor = rgba(palette.c0, 1)
    ctx.shadowBlur = 22
    const head = ((t * 0.16) % 1) * perimeter
    ctx.setLineDash([140, perimeter])
    ctx.lineDashOffset = -head
    ctx.globalAlpha = 0.85
    ctx.stroke()
    ctx.restore()
  }
}

// Ornaments at the four corners of the whole artwork.
const drawCorners = (
  ctx: CanvasRenderingContext2D,
  p: PreparedShare,
  t: number,
) => {
  const tier = p.scene.tier
  if (!tier) return
  const palette = p.palette
  const alpha = ease(t, 1.8, 2.6)
  if (alpha <= 0) return
  const size = 150
  const inset = 30
  const corners: Array<[number, number, number, number]> = [
    [inset, inset, 1, 1],
    [SHARE_WIDTH - inset, inset, -1, 1],
    [inset, SHARE_HEIGHT - inset, 1, -1],
    [SHARE_WIDTH - inset, SHARE_HEIGHT - inset, -1, -1],
  ]
  ctx.save()
  ctx.strokeStyle = rgba(palette.c1, 1)
  ctx.fillStyle = rgba(palette.c1, 1)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = rgba(palette.c1, 0.7)
  ctx.shadowBlur = 14
  for (const [cx, cy, sx, sy] of corners) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale((size / 64) * sx, (size / 64) * sy)
    ctx.lineWidth = 1.6
    for (const art of CORNER_ART[tier]) {
      ctx.globalAlpha = alpha * (art.opacity ?? 1)
      const path = new Path2D(art.d)
      if (art.fill) ctx.fill(path)
      else {
        ctx.lineWidth = art.width ?? 1.6
        ctx.stroke(path)
      }
    }
    ctx.restore()
  }
  ctx.restore()
}

// A thin anamorphic lens streak through the middle of the poster.
const drawFlare = (
  ctx: CanvasRenderingContext2D,
  p: PreparedShare,
  t: number,
) => {
  if (!p.premium) return
  const { palette } = p
  const alpha = ease(t, 1.5, 2.4) * (0.55 + 0.25 * Math.sin(t * 1.3))
  if (alpha <= 0) return
  const y = POSTER_CY + Math.sin(t * 0.5) * 30
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const streak = ctx.createLinearGradient(40, 0, SHARE_WIDTH - 40, 0)
  streak.addColorStop(0, rgba(palette.c1, 0))
  streak.addColorStop(0.5, rgba(palette.c0, 0.9))
  streak.addColorStop(1, rgba(palette.c1, 0))
  ctx.globalAlpha = alpha * 0.55
  ctx.fillStyle = streak
  ctx.fillRect(40, y - 1.5, SHARE_WIDTH - 80, 3)
  ctx.globalAlpha = alpha * 0.18
  ctx.fillRect(140, y - 9, SHARE_WIDTH - 280, 18)
  ctx.restore()
}

const fitFont = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  weight: number,
  min = 40,
) => {
  let size = start
  ctx.font = `${weight} ${size}px ${FONT}`
  while (ctx.measureText(text).width > maxWidth && size > min) {
    size -= 2
    ctx.font = `${weight} ${size}px ${FONT}`
  }
  let result = text
  while (ctx.measureText(result).width > maxWidth && result.length > 4) {
    result = `${result.slice(0, -2).trimEnd()}…`
  }
  return result
}

const drawText = (
  ctx: CanvasRenderingContext2D,
  p: PreparedShare,
  t: number,
) => {
  const { palette, scene, premium } = p
  const tier = scene.tier
  const cx = SHARE_WIDTH / 2
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  if (tier) {
    // The rarity plate: the gem, the path's name in foil, four pips.
    const reveal = ease(t, 1.9, 2.7)
    ctx.save()
    ctx.globalAlpha = reveal
    ctx.translate(0, (1 - reveal) * 14)

    setTracking(ctx, 8)
    ctx.font = `850 24px ${FONT}`
    ctx.fillStyle = rgba(palette.c1, 1)
    ctx.fillText(`SHUFFLE PRO${tier === 'jade' ? ' MAX' : ''}`, cx, 984)

    setTracking(ctx, 14)
    ctx.font = `950 70px ${FONT}`
    const name = TIER_LABELS[tier].toUpperCase()
    const nameWidth = ctx.measureText(name).width
    const gemSize = 62
    const total = gemSize + 26 + nameWidth
    const left = cx - total / 2
    drawGemPath(ctx, tier, left, 1003, gemSize)
    ctx.textAlign = 'left'
    const shine = ((t * 0.18) % 1.6) - 0.3
    const foil = ctx.createLinearGradient(left, 0, left + total, 0)
    foil.addColorStop(0, rgba(palette.c2, 1))
    foil.addColorStop(clamp01(shine - 0.2), rgba(palette.c1, 1))
    foil.addColorStop(clamp01(shine), 'rgba(255, 255, 255, 1)')
    foil.addColorStop(clamp01(shine + 0.2), rgba(palette.c1, 1))
    foil.addColorStop(1, rgba(palette.c2, 1))
    ctx.fillStyle = foil
    ctx.fillText(name, left + gemSize + 26, 1058)
    setTracking(ctx, 0)
    ctx.restore()

    // Pips.
    ctx.save()
    ctx.globalAlpha = reveal
    const order: Tier[] = ['frost', 'amethyst', 'jade', 'gold']
    const found = new Set(scene.foundTiers ?? [])
    found.add(tier)
    order.forEach((slot, index) => {
      const px = cx - 63 + index * 42
      const py = 1088
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(Math.PI / 4)
      if (found.has(slot)) {
        ctx.shadowColor = rgba(PALETTES[slot].c1, 0.9)
        ctx.shadowBlur = slot === tier ? 14 + 6 * Math.sin(t * 3) : 8
        ctx.fillStyle = rgba(
          slot === tier ? PALETTES[slot].c0 : PALETTES[slot].c1,
          1,
        )
        ctx.fillRect(-7, -7, 14, 14)
      } else {
        ctx.strokeStyle = rgba(palette.c2, 0.6)
        ctx.lineWidth = 1.6
        ctx.strokeRect(-7, -7, 14, 14)
      }
      ctx.restore()
    })
    ctx.restore()
  }

  // The title: wipes in from the left.
  const titleReveal = ease(t, tier ? 2.3 : 1.7, tier ? 3.1 : 2.5)
  const titleY = tier ? 1182 : 1056
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, titleY - 100, SHARE_WIDTH * titleReveal, 140)
  ctx.clip()
  setTracking(ctx, -1.5)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = premium ? rgba(palette.c1, 0.6) : 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = premium ? 34 : 20
  ctx.fillText(
    fitFont(ctx, scene.title, SHARE_WIDTH - 130, 84, 900),
    cx,
    titleY,
  )
  setTracking(ctx, 0)
  ctx.restore()

  // Year and detail.
  const metaReveal = ease(t, tier ? 2.7 : 2.1, tier ? 3.4 : 2.8)
  ctx.save()
  ctx.globalAlpha = metaReveal
  ctx.translate(0, (1 - metaReveal) * 10)
  ctx.font = `700 32px ${FONT}`
  ctx.fillStyle = rgba(palette.c0, 0.82)
  setTracking(ctx, 1)
  const line = [scene.year, scene.detail].filter(Boolean).join('  ·  ')
  ctx.fillText(line, cx, titleY + 54)
  setTracking(ctx, 0)
  ctx.restore()

  // The wordmark: DM Sans 950 with -0.05em tracking.
  const markReveal = ease(t, 2.6, 3.4)
  ctx.save()
  ctx.globalAlpha = 0.95 * markReveal
  ctx.font = `950 54px ${FONT}`
  setTracking(ctx, -0.05 * 54)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('ScrollFlix', cx, 1306)
  setTracking(ctx, 0)
  ctx.restore()

  ctx.restore()
}

// Draws one frame of the artwork at time `t` seconds. Coordinates are always
// 1080x1350; scale the context to render smaller.
export const drawShare = (
  ctx: CanvasRenderingContext2D,
  prepared: PreparedShare,
  rawT: number,
) => {
  const t = Math.max(0, rawT)
  const { palette, premium } = prepared

  ctx.save()
  ctx.clearRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)
  ctx.drawImage(prepared.backdrop, 0, 0, SHARE_WIDTH, SHARE_HEIGHT)

  if (premium) drawRays(ctx, prepared, t)
  drawStars(ctx, prepared, t)
  drawSparks(ctx, prepared, t, 'back')

  // The poster: the card back turning to the poster, then foil and border.
  const flip = flipState(t)
  ctx.save()
  const lift = (1 - ease(t, 0.2, 1.4)) * 70
  ctx.translate(POSTER_CX, POSTER_CY + lift)
  const squash = Math.max(0.02, Math.abs(Math.cos(flip.angle)))
  ctx.scale(flip.progress >= 1 ? 1 : squash, 1)
  ctx.globalAlpha = ease(t, 0.15, 0.6)
  ctx.translate(-POSTER_CX, -POSTER_CY)
  if (flip.showFront) {
    ctx.drawImage(
      prepared.framedPoster,
      POSTER_X - GLOW_PAD,
      POSTER_Y - GLOW_PAD,
      POSTER_W + GLOW_PAD * 2,
      POSTER_H + GLOW_PAD * 2,
    )
    if (premium) {
      drawFoil(ctx, prepared, t)
      drawBorder(ctx, prepared, t)
    } else {
      // A plain frame for an ordinary pick.
      roundedRect(
        ctx,
        POSTER_X - FRAME,
        POSTER_Y - FRAME,
        POSTER_W + FRAME * 2,
        POSTER_H + FRAME * 2,
        36,
      )
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
      ctx.lineWidth = 3
      ctx.stroke()
    }
  } else {
    drawCardBack(ctx, prepared)
  }
  ctx.restore()

  drawFlare(ctx, prepared, t)
  drawSparks(ctx, prepared, t, 'front')
  if (premium) drawCorners(ctx, prepared, t)

  // The thin outer frame.
  ctx.save()
  roundedRect(ctx, 20, 20, SHARE_WIDTH - 40, SHARE_HEIGHT - 40, 46)
  ctx.strokeStyle = rgba(palette.c1, premium ? 0.38 : 0.2)
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  drawText(ctx, prepared, t)

  // Film grain: the tile shifts every frame so it shimmers in the clip.
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

  // Fade in from black at the very start of a clip.
  if (t < 0.4) {
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - t / 0.4})`
    ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)
  }
  ctx.restore()
}

// The finished frame: what the still image shows.
export const drawShareFinal = (
  ctx: CanvasRenderingContext2D,
  prepared: PreparedShare,
) => drawShare(ctx, prepared, SHARE_CLIP_SECONDS)
