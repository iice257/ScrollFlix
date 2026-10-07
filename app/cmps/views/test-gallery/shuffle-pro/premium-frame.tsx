import { useEffect, useRef, useState } from 'react'
import { TIER_LABELS, type Tier } from './shuffle-pro-logic'
import { PALETTES } from './sky-pass'

const rgb = ([r, g, b]: [number, number, number], alpha = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`

// "✦ Shuffle Pro · Frost", or "✦ Shuffle Pro Max · Jade" for the immersive path.
export const premiumEyebrowText = (tier: Tier) =>
  `Shuffle Pro${tier === 'jade' ? ' Max' : ''} · ${TIER_LABELS[tier]}`

export const PremiumEyebrow = ({ tier }: { tier: Tier }) => (
  <p className='sp-eyebrow' data-tier={tier}>
    <span aria-hidden='true'>✦</span> {premiumEyebrowText(tier)}
  </p>
)

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

// Ornate corner flourish for Gold's foil lining, drawn once and mirrored.
const GoldCorner = ({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) => (
  <svg
    className='sp-gold-corner'
    data-corner={corner}
    viewBox='0 0 64 64'
    aria-hidden='true'
  >
    <path
      d='M4 60V30C4 15 15 4 30 4H60'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
    />
    <path
      d='M12 60V34C12 22 22 12 34 12H60'
      fill='none'
      stroke='currentColor'
      strokeWidth='0.8'
      strokeLinecap='round'
      opacity='0.7'
    />
    <path
      d='M4 4 C14 6 20 12 22 22 C12 20 6 14 4 4Z'
      fill='currentColor'
      opacity='0.85'
    />
    <circle cx='30' cy='30' r='2.2' fill='currentColor' />
    <path
      d='M30 22V26M30 34V38M22 30H26M34 30H38'
      stroke='currentColor'
      strokeWidth='1'
      strokeLinecap='round'
    />
  </svg>
)

type PremiumFrameProps = {
  tier: Tier
  reducedMotion: boolean
}

// The premium frame's moving parts. The border and glow come from CSS on the
// card itself; this adds the foil sheen, Gold's flourishes and the particles.
export const PremiumFrame = ({ tier, reducedMotion }: PremiumFrameProps) => (
  <>
    {reducedMotion ? null : <span className='sp-sheen' aria-hidden='true' />}
    {tier === 'gold' ? (
      <>
        <GoldCorner corner='tl' />
        <GoldCorner corner='tr' />
        <GoldCorner corner='bl' />
        <GoldCorner corner='br' />
      </>
    ) : null}
    {reducedMotion ? null : <EdgeParticles tier={tier} />}
  </>
)
