import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { SheenLayers, TiltHint, TiltSheen } from '../tilt-sheen/tilt-sheen'
import { useTiltSheen } from '../tilt-sheen/use-tilt-sheen'
import type { MoodPresentation } from './mood-run'
import {
  MOOD_PATHS,
  MOOD_PATH_LABELS,
  TIER_LABELS,
  type Tier,
} from './shuffle-pro-logic'
import { Gem } from './shuffle-pro-shelf'
import { shuffleProStore } from './shuffle-pro-store'
import { PALETTES, type Palette } from './sky-pass'
import { CORNER_ART } from './tier-art'

const rgb = ([r, g, b]: [number, number, number], alpha = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`

// "✦ Shuffle Pro · Frost", or "✦ Shuffle Pro Max · Jade" for the immersive path.
export const premiumEyebrowText = (tier: Tier) =>
  `Shuffle Pro${tier === 'jade' ? ' Max' : ''} · ${TIER_LABELS[tier]}`

const TIER_ORDER: Tier[] = ['frost', 'amethyst', 'jade', 'gold']

// The rarity plate at the top of the card: the path's gem, its name in foil
// type, and four pips showing how much of the collection is found.
export const PremiumPlate = ({
  tier,
  mood = null,
}: {
  tier: Tier
  mood?: MoodPresentation | null
}) => {
  const data = useSyncExternalStore(
    shuffleProStore.subscribe,
    shuffleProStore.get,
    shuffleProStore.get,
  )
  if (mood) {
    // A bonus path from the mood page: its own name, three pips, its colours.
    const moodFound = MOOD_PATHS.filter((p) => data.moodPaths[p]).length
    return (
      <div
        className='sp-plate'
        data-tier={tier}
        data-mood-path={mood.path}
        role='note'
        aria-label={`Shuffle Pro · ${MOOD_PATH_LABELS[mood.path]}. ${moodFound} of ${MOOD_PATHS.length} mood paths found.`}
      >
        <span className='sp-plate-gem' aria-hidden='true'>
          <Gem tier={tier} palette={mood.palette} found />
        </span>
        <span className='sp-plate-text' aria-hidden='true'>
          <span className='sp-plate-kicker'>Shuffle Pro</span>
          <strong className='sp-plate-name'>
            {MOOD_PATH_LABELS[mood.path]}
          </strong>
        </span>
        <span className='sp-plate-pips' aria-hidden='true'>
          {MOOD_PATHS.map((p) => (
            <i
              key={p}
              data-tier={tier}
              className={
                p === mood.path
                  ? 'sp-pip is-lit is-current'
                  : data.moodPaths[p]
                    ? 'sp-pip is-lit'
                    : 'sp-pip'
              }
            />
          ))}
        </span>
      </div>
    )
  }
  const foundCount = TIER_ORDER.filter((t) => data.found[t]).length
  return (
    <div
      className='sp-plate'
      data-tier={tier}
      role='note'
      aria-label={`${premiumEyebrowText(tier)}. ${foundCount} of 4 paths found.`}
    >
      <span className='sp-plate-gem' aria-hidden='true'>
        <Gem tier={tier} found />
      </span>
      <span className='sp-plate-text' aria-hidden='true'>
        <span className='sp-plate-kicker'>
          Shuffle Pro{tier === 'jade' ? ' Max' : ''}
        </span>
        <strong className='sp-plate-name'>{TIER_LABELS[tier]}</strong>
      </span>
      <span className='sp-plate-pips' aria-hidden='true'>
        {TIER_ORDER.map((t) => (
          <i
            key={t}
            data-tier={t}
            className={
              t === tier
                ? 'sp-pip is-lit is-current'
                : data.found[t]
                  ? 'sp-pip is-lit'
                  : 'sp-pip'
            }
          />
        ))}
      </span>
    </div>
  )
}

const PARTICLE_MS = 2500
const PARTICLE_FADE_MS = 600
const MAX_PARTICLES = 60

type Particle = {
  // Position along the card's perimeter, 0..1.
  t: number
  speed: number
  // Distance in from the edge, in px, and its slow wobble.
  inset: number
  wobble: number
  size: number
  tone: number
  phase: number
}

const drawParticle = (
  ctx: CanvasRenderingContext2D,
  tier: Tier,
  x: number,
  y: number,
  size: number,
  color: string,
  twinkle: number,
  spin: number,
) => {
  ctx.fillStyle = color
  ctx.strokeStyle = color
  if (tier === 'frost') {
    // A tiny ice shard.
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(spin)
    ctx.beginPath()
    ctx.moveTo(0, -size * 1.5)
    ctx.lineTo(size * 0.8, 0)
    ctx.lineTo(0, size * 1.5)
    ctx.lineTo(-size * 0.8, 0)
    ctx.closePath()
    ctx.globalAlpha *= 0.5 + 0.5 * twinkle
    ctx.fill()
    ctx.restore()
  } else if (tier === 'amethyst') {
    // A four-point glitter star.
    ctx.save()
    ctx.translate(x, y)
    ctx.globalAlpha *= 0.35 + 0.65 * twinkle
    ctx.beginPath()
    const long = size * 2.6
    const short = size * 0.5
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4
      const radius = i % 2 === 0 ? long : short
      const px = Math.cos(angle) * radius
      const py = Math.sin(angle) * radius
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  } else {
    // Embers and dust: soft round motes.
    ctx.save()
    ctx.globalAlpha *= 0.4 + 0.6 * twinkle
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2.4)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, size * 2.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// Up to 60 path particles drift along the card's edges for 2.5s, then the
// canvas stops and unmounts itself.
const EdgeParticles = ({
  tier,
  palette: custom,
}: {
  tier: Tier
  palette?: Palette
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const palette = custom ?? PALETTES[tier]
    const colors = [palette.c0, palette.c1, palette.c2, palette.accent].map(
      (c) => rgb(c),
    )
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 0
    const height =
      canvas.clientHeight || canvas.parentElement?.clientHeight || 0
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.scale(dpr, dpr)

    let seed = 90210
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
      t: rand(),
      speed: (0.015 + rand() * 0.03) * (rand() > 0.5 ? 1 : -1),
      inset: 2 + rand() * 9,
      wobble: rand() * 6.28,
      size: tier === 'amethyst' ? 1.1 + rand() * 1.4 : 0.9 + rand() * 1.6,
      tone: Math.floor(rand() * colors.length),
      phase: rand() * 6.28,
    }))
    const perimeter = 2 * (width + height)
    const pointAt = (t: number, inset: number): [number, number] => {
      let d = (((t % 1) + 1) % 1) * perimeter
      if (d < width) return [d, inset]
      d -= width
      if (d < height) return [width - inset, d]
      d -= height
      if (d < width) return [width - d, height - inset]
      d -= width
      return [inset, height - d]
    }

    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const age = now - start
      if (age >= PARTICLE_MS) {
        setDone(true)
        return
      }
      const fadeIn = Math.min(1, age / 300)
      const fadeOut = Math.min(1, (PARTICLE_MS - age) / PARTICLE_FADE_MS)
      ctx.clearRect(0, 0, width, height)
      for (const particle of particles) {
        const t = particle.t + particle.speed * (age / 1000)
        const inset = particle.inset + Math.sin(age / 500 + particle.wobble) * 2
        const [x, y] = pointAt(t, inset)
        const twinkle = 0.5 + 0.5 * Math.sin(age / 180 + particle.phase)
        ctx.globalAlpha = fadeIn * fadeOut * 0.9
        drawParticle(
          ctx,
          tier,
          x,
          y,
          particle.size,
          colors[particle.tone],
          twinkle,
          age / 400 + particle.phase,
        )
      }
      ctx.globalAlpha = 1
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [tier, custom])

  if (done) return null
  return (
    <span className='sp-edge-particles' aria-hidden='true'>
      <canvas ref={canvasRef} />
    </span>
  )
}

type CornerName = 'tl' | 'tr' | 'bl' | 'br'

// One flourish per path, drawn once for the top-left corner and mirrored into
// the other three by CSS: ice branches for Frost, a star flare for Amethyst, a
// smoke curl and leaf for Jade, and the ornate lining for Gold.

const Corner = ({ tier, corner }: { tier: Tier; corner: CornerName }) => (
  <svg
    className='sp-corner'
    data-corner={corner}
    viewBox='0 0 64 64'
    aria-hidden='true'
  >
    <g
      fill='none'
      stroke='currentColor'
      strokeWidth='1.4'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      {CORNER_ART[tier].map((art) => (
        <path
          key={art.d}
          d={art.d}
          opacity={art.opacity}
          strokeWidth={art.width}
          fill={art.fill ? 'currentColor' : undefined}
          stroke={art.fill ? 'none' : undefined}
        />
      ))}
    </g>
  </svg>
)

type PremiumFrameProps = {
  tier: Tier
  // A mood run's own colours for the drifting particles.
  palette?: Palette
  reducedMotion: boolean
}

// The premium frame's moving parts, layered over the card: a slow aurora in
// the path's colours, a border that draws itself once, a foil sweep, the
// corner ornaments and a few drifting particles. The steady rotating border
// and glow come from CSS on the card itself.
export const PremiumFrame = ({
  tier,
  palette,
  reducedMotion,
}: PremiumFrameProps) => (
  <>
    <span className='sp-aurora' aria-hidden='true' />
    {reducedMotion ? null : (
      <span className='sp-draw' aria-hidden='true'>
        <span className='sp-draw-ring' />
      </span>
    )}
    <TiltSheen variant='card' areaSelector='.warp-details-card' />
    {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
      <Corner key={corner} tier={tier} corner={corner} />
    ))}
    {reducedMotion ? null : <EdgeParticles tier={tier} palette={palette} />}
  </>
)

// The poster as a collectible: it flips over from a card back, then carries a
// holographic foil and a glare that follow the pointer, with the path's badge.
export const PosterStage = ({
  tier,
  mood = null,
  reducedMotion,
  children,
}: {
  tier: Tier
  mood?: MoodPresentation | null
  reducedMotion: boolean
  children: ReactNode
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const areaRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    areaRef.current =
      stageRef.current?.closest<HTMLElement>('.warp-details-card') ?? null
  }, [])
  useTiltSheen({ areaRef, targetRef: cardRef })
  return (
    <div className='sp-stage' ref={stageRef} data-tier={tier}>
      <div className='sp-stage-card' ref={cardRef}>
        {children}
        <SheenLayers variant='poster' />
        <span className='sp-badge' aria-hidden='true'>
          <Gem tier={tier} palette={mood?.palette} found />
          {mood ? MOOD_PATH_LABELS[mood.path] : TIER_LABELS[tier]}
        </span>
        {reducedMotion ? null : (
          <span className='sp-back' aria-hidden='true'>
            <Gem tier={tier} palette={mood?.palette} found />
          </span>
        )}
      </div>
      <TiltHint />
    </div>
  )
}
