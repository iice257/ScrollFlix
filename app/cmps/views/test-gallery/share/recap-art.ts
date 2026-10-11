// The run recap: a 1080x1350 card of the four Shuffle Pro paths, which ones
// have been found and how often, the number of runs and the best streak.
//
// Like the film artwork, one function draws any moment `t` (seconds), so the
// still image is the last frame and the clip is the whole thing. The layers
// that never change are drawn once into a backdrop.

import { TIER_LABELS, type Tier } from '../shuffle-pro/shuffle-pro-logic'
import { PALETTES } from '../shuffle-pro/sky-pass'
import {
  FONT,
  type Rgb,
  SHARE_CLIP_SECONDS,
  SHARE_HEIGHT,
  SHARE_WIDTH,
  clamp01,
  drawGemPath,
  ease,
  easeOutBack,
  makeCanvas,
  makeGrain,
  rgba,
  roundedRect,
  seededRandom,
  setTracking,
} from './share-art'

export type RecapScene = {
  found: Partial<Record<Tier, { count: number }>>
  totalRuns: number
  bestStreak: number
  savedCount: number
  // The genres the saved films lean on, if they say anything yet.
  taste: string[]
}

const TIERS: readonly Tier[] = ['frost', 'amethyst', 'jade', 'gold']

type Star = { x: number; y: number; size: number; phase: number; speed: number }

export type PreparedRecap = {
  scene: RecapScene
  backdrop: HTMLCanvasElement
  grain: HTMLCanvasElement
  stars: Star[]
}

const TILE_W = 450
const TILE_H = 318
const TILE_GAP = 36
const TILES_X = (SHARE_WIDTH - TILE_W * 2 - TILE_GAP) / 2
const TILES_Y = 520

const tilePosition = (index: number) => ({
  x: TILES_X + (index % 2) * (TILE_W + TILE_GAP),
  y: TILES_Y + Math.floor(index / 2) * (TILE_H + TILE_GAP),
})

export const prepareRecap = (scene: RecapScene): PreparedRecap => {
  const backdrop = makeCanvas(SHARE_WIDTH, SHARE_HEIGHT)
  const ctx = backdrop.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')

  const base = ctx.createLinearGradient(0, 0, 0, SHARE_HEIGHT)
  base.addColorStop(0, '#04050c')
  base.addColorStop(0.5, '#0b0e22')
  base.addColorStop(1, '#04050c')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)

  // A soft nebula behind each tile, stronger for the paths that were found.
  TIERS.forEach((tier, index) => {
    const { x, y } = tilePosition(index)
    const strength = scene.found[tier] ? 0.34 : 0.07
    const palette = PALETTES[tier]
    const cx = x + TILE_W / 2
    const cy = y + TILE_H / 2
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 420)
    glow.addColorStop(0, rgba(palette.c1 as Rgb, strength))
    glow.addColorStop(1, rgba(palette.c1 as Rgb, 0))
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)
  })

  const random = seededRandom(scene.totalRuns * 31 + 5)
  const stars: Star[] = Array.from({ length: 90 }, () => ({
    x: random() * SHARE_WIDTH,
    y: random() * SHARE_HEIGHT,
    size: 1 + random() * 2.2,
    phase: random() * Math.PI * 2,
    speed: 0.6 + random() * 1.6,
  }))

  return { scene, backdrop, grain: makeGrain(), stars }
}

const drawStars = (
  ctx: CanvasRenderingContext2D,
  prepared: PreparedRecap,
  t: number,
) => {
  for (const star of prepared.stars) {
    const alpha =
      0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase))
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * ease(t, 0, 0.8)})`
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

const drawHeader = (
  ctx: CanvasRenderingContext2D,
  scene: RecapScene,
  t: number,
) => {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const fade = ease(t, 0.15, 0.8)
  ctx.globalAlpha = fade
  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)'
  ctx.font = `800 30px ${FONT}`
  setTracking(ctx, 9)
  ctx.fillText('SHUFFLE PRO', SHARE_WIDTH / 2, 150)
  setTracking(ctx, 0)

  ctx.globalAlpha = ease(t, 0.25, 0.95)
  ctx.fillStyle = '#ffffff'
  ctx.font = `950 190px ${FONT}`
  setTracking(ctx, -8)
  ctx.fillText('My run.', SHARE_WIDTH / 2, 330 + (1 - ease(t, 0.25, 0.95)) * 24)
  setTracking(ctx, 0)

  // The numbers count up.
  const progress = ease(t, 0.5, 1.9)
  const runs = Math.round(scene.totalRuns * progress)
  const streak = Math.round(scene.bestStreak * progress)
  ctx.globalAlpha = ease(t, 0.5, 1.1)
  ctx.font = `750 44px ${FONT}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)'
  const line = `${runs} ${scene.totalRuns === 1 ? 'run' : 'runs'}   ·   best streak ${streak}`
  ctx.fillText(line, SHARE_WIDTH / 2, 420)
  ctx.restore()
}

const drawTile = (
  ctx: CanvasRenderingContext2D,
  scene: RecapScene,
  tier: Tier,
  index: number,
  t: number,
) => {
  const entry = scene.found[tier]
  const palette = PALETTES[tier]
  const { x, y } = tilePosition(index)
  const start = 0.9 + index * 0.28
  const appear = clamp01((t - start) / 0.7)
  if (appear <= 0) return
  const pop = easeOutBack(appear)

  ctx.save()
  ctx.translate(x + TILE_W / 2, y + TILE_H / 2)
  ctx.scale(0.86 + 0.14 * pop, 0.86 + 0.14 * pop)
  ctx.translate(-TILE_W / 2, -TILE_H / 2)
  ctx.globalAlpha = ease(t, start, start + 0.45)

  roundedRect(ctx, 0, 0, TILE_W, TILE_H, 44)
  ctx.fillStyle = entry
    ? 'rgba(255, 255, 255, 0.07)'
    : 'rgba(255, 255, 255, 0.03)'
  ctx.fill()
  ctx.lineWidth = entry ? 3 : 2
  ctx.strokeStyle = entry
    ? rgba(palette.c1 as Rgb, 0.7)
    : 'rgba(255, 255, 255, 0.12)'
  ctx.stroke()

  // The gem, with a slow pulse of light behind it once found.
  const gemX = 44
  const gemY = TILE_H / 2 - 82
  if (entry) {
    const pulse = 0.55 + 0.25 * Math.sin(t * 2 + index)
    const halo = ctx.createRadialGradient(
      gemX + 82,
      gemY + 82,
      0,
      gemX + 82,
      gemY + 82,
      150,
    )
    halo.addColorStop(0, rgba(palette.c1 as Rgb, pulse * 0.6))
    halo.addColorStop(1, rgba(palette.c1 as Rgb, 0))
    ctx.fillStyle = halo
    ctx.fillRect(gemX - 70, gemY - 70, 300, 300)
  }
  drawGemPath(ctx, tier, gemX, gemY, 156, entry ? 1 : 0.22)

  // Name and how often.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = entry ? '#ffffff' : 'rgba(255, 255, 255, 0.4)'
  // The name shrinks to fit beside the gem.
  const available = TILE_W - 236 - 26
  let nameSize = 58
  ctx.font = `900 ${nameSize}px ${FONT}`
  setTracking(ctx, -1.5)
  while (
    ctx.measureText(TIER_LABELS[tier]).width > available &&
    nameSize > 30
  ) {
    nameSize -= 2
    ctx.font = `900 ${nameSize}px ${FONT}`
  }
  ctx.fillText(TIER_LABELS[tier], 236, TILE_H / 2 + 4)
  setTracking(ctx, 0)
  ctx.font = `700 32px ${FONT}`
  ctx.fillStyle = entry
    ? rgba(palette.c1 as Rgb, 1)
    : 'rgba(255, 255, 255, 0.3)'
  const times = entry
    ? Math.round(entry.count * ease(t, start + 0.3, start + 1.2))
    : 0
  ctx.fillText(
    entry ? `Found ×${Math.max(1, times)}` : 'Not found yet',
    236,
    TILE_H / 2 + 54,
  )
  ctx.restore()
}

const drawFooter = (
  ctx: CanvasRenderingContext2D,
  scene: RecapScene,
  t: number,
) => {
  ctx.save()
  ctx.globalAlpha = ease(t, 2.6, 3.4)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const detail = [
    scene.savedCount ? `${scene.savedCount} saved` : '',
    scene.taste.length ? `leaning ${scene.taste.join(' and ')}` : '',
  ]
    .filter(Boolean)
    .join('   ·   ')
  if (detail) {
    ctx.font = `700 32px ${FONT}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)'
    ctx.fillText(detail, SHARE_WIDTH / 2, 1252)
  }
  ctx.font = `900 40px ${FONT}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  setTracking(ctx, 2)
  ctx.fillText('ScrollFlix', SHARE_WIDTH / 2, 1308)
  setTracking(ctx, 0)
  ctx.restore()
}

// One frame at `t` seconds, always 1080x1350.
export const drawRecap = (
  ctx: CanvasRenderingContext2D,
  prepared: PreparedRecap,
  rawT: number,
) => {
  const t = Math.max(0, rawT)
  ctx.save()
  ctx.clearRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)
  ctx.drawImage(prepared.backdrop, 0, 0, SHARE_WIDTH, SHARE_HEIGHT)
  drawStars(ctx, prepared, t)
  drawHeader(ctx, prepared.scene, t)
  TIERS.forEach((tier, index) => drawTile(ctx, prepared.scene, tier, index, t))
  drawFooter(ctx, prepared.scene, t)

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

export const drawRecapFinal = (
  ctx: CanvasRenderingContext2D,
  prepared: PreparedRecap,
) => drawRecap(ctx, prepared, SHARE_CLIP_SECONDS)
