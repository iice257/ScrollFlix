import { useEffect, useRef } from 'react'
import { readReducedMotion } from './shuffle-pro/use-shuffle-pro'

export type AmbientKind = 'rain' | 'snow'

type Drop = {
  x: number
  y: number
  // Speed and size factors in 0..1, fixed for the particle's life.
  a: number
  b: number
}

const COUNT = 90
const MAX_DPR = 1.5
// Drawn at half the display rate: the layer is atmosphere, not the hero.
const FRAME_MS = 1000 / 30

// Light rain or drifting snow over the whole page, for the Dynamic theme.
// pointer-events are off, so the globe and every control work through it. It
// draws about 90 particles at 30 fps on a small canvas, stops while the tab is
// hidden or `paused` (a film card is open, or Shuffle Pro is running its own
// sky), and with reduced motion it draws one still frame and never animates.
export const AmbientWeather = ({
  kind,
  light,
  paused,
}: {
  kind: AmbientKind | null
  light: boolean
  paused: boolean
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!kind || !canvas || !ctx) return
    const still = readReducedMotion(null)
    let frame = 0
    let last = 0
    let width = 0
    let height = 0
    const drops: Drop[] = []

    const size = () => {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drops.length = 0
      for (let index = 0; index < COUNT; index += 1) {
        drops.push({
          x: Math.random() * (width + 200) - 100,
          y: Math.random() * height,
          a: Math.random(),
          b: Math.random(),
        })
      }
    }

    const rainInk = light ? '70, 92, 130' : '196, 214, 255'
    const snowInk = light ? '90, 110, 150' : '255, 255, 255'

    const draw = (dt: number, now: number) => {
      ctx.clearRect(0, 0, width, height)
      if (kind === 'rain') {
        ctx.lineCap = 'round'
        ctx.lineWidth = 1.2
        for (const drop of drops) {
          const speed = 780 + drop.a * 420
          const slant = 90 + drop.b * 60
          drop.x += slant * dt
          drop.y += speed * dt
          if (drop.y > height + 30) {
            drop.y = -40 - Math.random() * 80
            drop.x = Math.random() * (width + 200) - 100
          }
          const length = 14 + drop.a * 14
          ctx.strokeStyle = `rgba(${rainInk}, ${0.35 + drop.b * 0.4})`
          ctx.beginPath()
          ctx.moveTo(drop.x, drop.y)
          ctx.lineTo(drop.x - (slant / speed) * length, drop.y - length)
          ctx.stroke()
        }
        return
      }
      for (const drop of drops) {
        drop.x += (Math.sin(now / 900 + drop.a * 9) * 14 + 8) * dt
        drop.y += (34 + drop.a * 46) * dt
        if (drop.y > height + 8) {
          drop.y = -8 - Math.random() * 40
          drop.x = Math.random() * (width + 200) - 100
        }
        ctx.fillStyle = `rgba(${snowInk}, ${0.45 + drop.a * 0.45})`
        ctx.beginPath()
        ctx.arc(drop.x, drop.y, 1 + drop.b * 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick)
      if (now - last < FRAME_MS) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      draw(dt, now)
    }

    const stop = () => {
      window.cancelAnimationFrame(frame)
      frame = 0
    }

    const start = () => {
      if (frame || paused || document.hidden || still) return
      last = performance.now()
      frame = window.requestAnimationFrame(tick)
    }

    const handleVisibility = () => {
      if (document.hidden) stop()
      else start()
    }

    const handleResize = () => {
      size()
      if (still || paused) draw(0, 0)
    }

    size()
    // One still frame for reduced motion; otherwise the loop runs.
    if (still) draw(0, 0)
    else start()
    window.addEventListener('resize', handleResize)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stop()
      ctx.clearRect(0, 0, width, height)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [kind, light, paused])

  if (!kind) return null
  return (
    <canvas
      ref={canvasRef}
      className='warp-ambient-weather'
      data-weather={kind}
      role='presentation'
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        // Above the globe, below the dock, cards and menus.
        zIndex: 3,
        opacity: paused ? 0 : 0.42,
        transition: 'opacity 400ms ease',
      }}
    />
  )
}
