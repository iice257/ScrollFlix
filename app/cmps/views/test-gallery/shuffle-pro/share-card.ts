// The share card for a premium pick: a 1080x1350 PNG composed with Canvas 2D.
// A static render of the path's sky, the poster in the path's frame, the
// title, year and "✦ Shuffle Pro · <Path>", and the ScrollFlix wordmark.
// There is deliberately no URL on it.

import { TIER_LABELS, type Tier } from './shuffle-pro-logic'
import { PALETTES } from './sky-pass'

export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1350

export const slugifyTitle = (title: string) =>
  title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'movie'

export const shareFileName = (title: string, tier: Tier) =>
  `scrollflix-${slugifyTitle(title)}-${tier}.png`

export const shareCaption = (tier: Tier) =>
  `✦ Shuffle Pro${tier === 'jade' ? ' Max' : ''} · ${TIER_LABELS[tier]}`

type Rgb = [number, number, number]
const rgba = ([r, g, b]: Rgb, alpha = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`

// A tiny seeded generator so the same pick always renders the same sky.
const seededRandom = (seed: number) => {
  let state = seed >>> 0 || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const hashString = (value: string) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const drawSky = (ctx: CanvasRenderingContext2D, tier: Tier, seed: number) => {
  const palette = PALETTES[tier]
  const w = SHARE_CARD_WIDTH
  const h = SHARE_CARD_HEIGHT
  const base = ctx.createLinearGradient(0, 0, w * 0.4, h)
  base.addColorStop(0, rgba(palette.deep, 1))
  base.addColorStop(0.55, rgba(palette.deep.map((c) => c * 0.62) as Rgb, 1))
  base.addColorStop(1, rgba(palette.deep.map((c) => c * 0.4) as Rgb, 1))
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  // Nebula glows in the path's colours.
  const glows: Array<[number, number, number, Rgb, number]> = [
    [0.5, 0.42, 0.62, palette.c2, 0.5],
    [0.14, 0.12, 0.45, palette.c1, 0.28],
    [0.9, 0.86, 0.5, palette.c2, 0.32],
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

  // Stars, glitter, shards or dust, to suit the path.
  const random = seededRandom(seed)
  const count = tier === 'amethyst' ? 170 : 130
  for (let i = 0; i < count; i += 1) {
    const x = random() * w
    const y = random() * h
    const size = 0.8 + random() * 2.4
    const color = [palette.c0, palette.c1, palette.accent][
      Math.floor(random() * 3)
    ]
    ctx.globalAlpha = 0.25 + random() * 0.7
    ctx.fillStyle = rgba(color, 1)
    ctx.strokeStyle = rgba(color, 1)
    if (tier === 'amethyst' || tier === 'gold') {
      // Four-point sparkle.
      const long = size * (tier === 'amethyst' ? 4.2 : 3)
      ctx.beginPath()
      ctx.moveTo(x, y - long)
      ctx.lineTo(x + size * 0.45, y)
      ctx.lineTo(x, y + long)
      ctx.lineTo(x - size * 0.45, y)
      ctx.closePath()
      ctx.moveTo(x - long, y)
      ctx.lineTo(x, y + size * 0.45)
      ctx.lineTo(x + long, y)
      ctx.lineTo(x, y - size * 0.45)
      ctx.closePath()
      ctx.fill()
    } else if (tier === 'frost') {
      ctx.beginPath()
      ctx.moveTo(x, y - size * 2.4)
      ctx.lineTo(x + size, y)
      ctx.lineTo(x, y + size * 2.4)
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

  if (tier === 'gold') {
    // A few deco rings behind the poster.
    ctx.strokeStyle = rgba(palette.accent, 0.5)
    for (const [radius, width] of [
      [430, 2],
      [490, 1],
      [560, 1],
    ]) {
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.arc(w / 2, h * 0.43, radius, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

type PosterSource = CanvasImageSource & { width?: number; height?: number }

const drawPoster = (
  ctx: CanvasRenderingContext2D,
  tier: Tier,
  poster: PosterSource | null,
) => {
  const palette = PALETTES[tier]
  const posterW = 600
  const posterH = 900
  const x = (SHARE_CARD_WIDTH - posterW) / 2
  const y = 120
  const frame = 14

  // Glow, then the frame in the path's colours.
  ctx.save()
  ctx.shadowColor = rgba(palette.c1, 0.55)
  ctx.shadowBlur = 90
  roundedRect(
    ctx,
    x - frame,
    y - frame,
    posterW + frame * 2,
    posterH + frame * 2,
    34,
  )
  ctx.fillStyle = rgba(palette.deep, 1)
  ctx.fill()
  ctx.restore()

  const border = ctx.createLinearGradient(x, y, x + posterW, y + posterH)
  border.addColorStop(0, rgba(palette.c0, 1))
  border.addColorStop(0.35, rgba(palette.c2, 1))
  border.addColorStop(0.7, rgba(palette.c1, 1))
  border.addColorStop(1, rgba(palette.c0, 1))
  roundedRect(
    ctx,
    x - frame,
    y - frame,
    posterW + frame * 2,
    posterH + frame * 2,
    34,
  )
  ctx.lineWidth = tier === 'gold' ? 7 : 5
  ctx.strokeStyle = border
  ctx.stroke()

  ctx.save()
  roundedRect(ctx, x, y, posterW, posterH, 22)
  ctx.clip()
  if (poster) {
    const iw = Number(poster.width) || posterW
    const ih = Number(poster.height) || posterH
    const scale = Math.max(posterW / iw, posterH / ih)
    const dw = iw * scale
    const dh = ih * scale
    ctx.drawImage(
      poster,
      x + (posterW - dw) / 2,
      y + (posterH - dh) / 2,
      dw,
      dh,
    )
  } else {
    // No usable poster (blocked by CORS): the path's colours stand in.
    const placeholder = ctx.createLinearGradient(x, y, x + posterW, y + posterH)
    placeholder.addColorStop(0, rgba(palette.c2, 1))
    placeholder.addColorStop(1, rgba(palette.deep, 1))
    ctx.fillStyle = placeholder
    ctx.fillRect(x, y, posterW, posterH)
    ctx.fillStyle = rgba(palette.c0, 0.9)
    ctx.font = '700 120px "DM Sans", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✦', x + posterW / 2, y + posterH / 2)
  }
  ctx.restore()
}

// Fits text on one line by shrinking the font; very long titles are trimmed.
const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  weight: number,
) => {
  let size = start
  const family = '"DM Sans", system-ui, sans-serif'
  ctx.font = `${weight} ${size}px ${family}`
  while (ctx.measureText(text).width > maxWidth && size > 34) {
    size -= 2
    ctx.font = `${weight} ${size}px ${family}`
  }
  let result = text
  while (ctx.measureText(result).width > maxWidth && result.length > 4) {
    result = `${result.slice(0, -2).trimEnd()}…`
  }
  return result
}

type ComposeOptions = {
  title: string
  year: string
  tier: Tier
  poster: PosterSource | null
}

export const composeShareCard = (
  canvas: HTMLCanvasElement,
  { title, year, tier, poster }: ComposeOptions,
) => {
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  const palette = PALETTES[tier]
  const seed = hashString(`${title}${tier}`)

  drawSky(ctx, tier, seed)
  drawPoster(ctx, tier, poster)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = rgba(palette.c0, 1)
  const caption = shareCaption(tier).toUpperCase()
  ctx.font = '800 28px "DM Sans", system-ui, sans-serif'
  try {
    ctx.letterSpacing = '2.5px'
  } catch {
    // letterSpacing is not available everywhere.
  }
  ctx.fillStyle = rgba(palette.c1, 1)
  ctx.fillText(caption, SHARE_CARD_WIDTH / 2, 1094)

  try {
    ctx.letterSpacing = '0px'
  } catch {
    // See above.
  }
  ctx.fillStyle = rgba([1, 1, 1], 1)
  ctx.fillText(
    fitText(ctx, title, SHARE_CARD_WIDTH - 140, 76, 800),
    SHARE_CARD_WIDTH / 2,
    1170,
  )
  ctx.font = '600 34px "DM Sans", system-ui, sans-serif'
  ctx.fillStyle = rgba(palette.c0, 0.78)
  ctx.fillText(year, SHARE_CARD_WIDTH / 2, 1220)

  // Wordmark: DM Sans 950 with -0.05em tracking.
  ctx.font = '950 56px "DM Sans", system-ui, sans-serif'
  try {
    ctx.letterSpacing = `${-0.05 * 56}px`
  } catch {
    // See above.
  }
  ctx.fillStyle = rgba([1, 1, 1], 0.95)
  ctx.fillText('ScrollFlix', SHARE_CARD_WIDTH / 2, 1310)
  try {
    ctx.letterSpacing = '0px'
  } catch {
    // See above.
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))

const loadPoster = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })

// Renders the card to a PNG. If the poster taints the canvas, the card is
// rendered again with a placeholder in the path's colours.
export const renderShareCard = async (options: {
  title: string
  year: string
  tier: Tier
  posterUrl: string
}): Promise<Blob> => {
  try {
    await document.fonts?.load('950 52px "DM Sans"')
    await document.fonts?.load('800 64px "DM Sans"')
  } catch {
    // Fall back to the system font.
  }
  const canvas = document.createElement('canvas')
  const poster = await loadPoster(options.posterUrl)
  composeShareCard(canvas, { ...options, poster })
  let blob: Blob | null = null
  try {
    blob = await canvasToBlob(canvas)
  } catch {
    blob = null
  }
  if (!blob && poster) {
    composeShareCard(canvas, { ...options, poster: null })
    blob = await canvasToBlob(canvas)
  }
  if (!blob) throw new Error('Could not render the share card')
  return blob
}

// Shares the PNG with the native sheet when files are supported, otherwise
// downloads it.
export const deliverShareCard = async (
  blob: Blob,
  fileName: string,
  title: string,
) => {
  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared' as const
    } catch (error) {
      // The user dismissing the sheet is not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled' as const
      }
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded' as const
}
