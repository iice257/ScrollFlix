import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { TIER_LABELS, type Tier } from './shuffle-pro-logic'
import { Gem } from './shuffle-pro-shelf'
import { shuffleProStore } from './shuffle-pro-store'
import { PALETTES } from './sky-pass'
import { CORNER_ART } from './tier-art'

const rgb = ([r, g, b]: [number, number, number], alpha = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`

// "✦ Shuffle Pro · Frost", or "✦ Shuffle Pro Max · Jade" for the immersive path.
export const premiumEyebrowText = (tier: Tier) =>
  `Shuffle Pro${tier === 'jade' ? ' Max' : ''} · ${TIER_LABELS[tier]}`

const TIER_ORDER: Tier[] = ['frost', 'amethyst', 'jade', 'gold']

// The rarity plate at the top of the card: the path's gem, its name in foil
// type, and four pips showing how much of the collection is found.
export const PremiumPlate = ({ tier }: { tier: Tier }) => {
  const data = useSyncExternalStore(
    shuffleProStore.subscribe,
    shuffleProStore.get,
    shuffleProStore.get,
  )
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
const EdgeParticles = ({ tier }: { tier: Tier }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const palette = PALETTES[tier]
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
  }, [tier])

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
  reducedMotion: boolean
}

// The premium frame's moving parts, layered over the card: a slow aurora in
// the path's colours, a border that draws itself once, a foil sweep, the
// corner ornaments and a few drifting particles. The steady rotating border
// and glow come from CSS on the card itself.
export const PremiumFrame = ({ tier, reducedMotion }: PremiumFrameProps) => (
  <>
    <span className='sp-aurora' aria-hidden='true' />
    {reducedMotion ? null : (
      <span className='sp-draw' aria-hidden='true'>
        <span className='sp-draw-ring' />
      </span>
    )}
    {reducedMotion ? null : <span className='sp-sheen' aria-hidden='true' />}
    {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
      <Corner key={corner} tier={tier} corner={corner} />
    ))}
    {reducedMotion ? null : <EdgeParticles tier={tier} />}
  </>
)

// Tilts the poster toward the pointer and moves the foil's highlight with it.
// Only on devices with a hover pointer, and never for reduced motion; one
// listener, throttled to animation frames, removed on unmount.
const usePosterTilt = (
  stageRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) => {
  useEffect(() => {
    const stage = stageRef.current
    const card = stage?.closest<HTMLElement>('.warp-details-card')
    const target = stage?.querySelector<HTMLElement>('.sp-stage-card')
    if (!enabled || !stage || !card || !target) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    let frame = 0
    let nextX = 0
    let nextY = 0
    let inside = false
    const apply = () => {
      frame = 0
      if (!inside) {
        target.style.removeProperty('--sp-rx')
        target.style.removeProperty('--sp-ry')
        target.style.setProperty('--sp-mx', '50%')
        target.style.setProperty('--sp-my', '50%')
        target.dataset.active = 'false'
        return
      }
      const rect = stage.getBoundingClientRect()
      const nx = Math.max(
        -1,
        Math.min(1, ((nextX - rect.left) / rect.width) * 2 - 1),
      )
      const ny = Math.max(
        -1,
        Math.min(1, ((nextY - rect.top) / rect.height) * 2 - 1),
      )
      target.style.setProperty('--sp-ry', `${nx * 8}deg`)
      target.style.setProperty('--sp-rx', `${-ny * 8}deg`)
      target.style.setProperty('--sp-mx', `${50 + nx * 50}%`)
      target.style.setProperty('--sp-my', `${50 + ny * 50}%`)
      target.dataset.active = 'true'
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply)
    }
    const onMove = (event: PointerEvent) => {
      nextX = event.clientX
      nextY = event.clientY
      inside = true
      schedule()
    }
    const onLeave = () => {
      inside = false
      schedule()
    }
    card.addEventListener('pointermove', onMove)
    card.addEventListener('pointerleave', onLeave)
    return () => {
      card.removeEventListener('pointermove', onMove)
      card.removeEventListener('pointerleave', onLeave)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [enabled, stageRef])
}

// The poster as a collectible: it flips over from a card back, then carries a
// holographic foil and a glare that follow the pointer, with the path's badge.
export const PosterStage = ({
  tier,
  reducedMotion,
  children,
}: {
  tier: Tier
  reducedMotion: boolean
  children: ReactNode
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null)
  usePosterTilt(stageRef, !reducedMotion)
  return (
    <div className='sp-stage' ref={stageRef} data-tier={tier}>
      <div className='sp-stage-card'>
        {children}
        <span className='sp-foil' aria-hidden='true' />
        <span className='sp-glare' aria-hidden='true' />
        <span className='sp-badge' aria-hidden='true'>
          <Gem tier={tier} found />
          {TIER_LABELS[tier]}
        </span>
        {reducedMotion ? null : (
          <span className='sp-back' aria-hidden='true'>
            <Gem tier={tier} found />
          </span>
        )}
      </div>
    </div>
  )
}
