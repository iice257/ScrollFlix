import { useEffect, useRef } from 'react'
import { readReducedMotion } from './shuffle-pro/use-shuffle-pro'
import {
  type WeatherKind,
  liveCount,
  pickWeatherKind,
  stormPlan,
} from './weather-logic'

export type WeatherStorm = (speed: number, direction: number) => void

type Particle = {
  x: number
  y: number
  // Speed and size factors in 0..1, fixed for the particle's life.
  a: number
  b: number
}

const POOL = 120
const MAX_DPR = 1.5

type Storm = {
  kind: WeatherKind
  direction: number
  intensity: number
  target: number
  until: number
  light: boolean
}

// Rain or snow across the whole screen after a very fast flick. The canvas is
// hidden and nothing runs until a storm starts, and the frame loop stops when
// it ends.
export const WeatherLayer = ({
  register,
}: {
  // Hands the page the function that starts a storm.
  register: (storm: WeatherStorm | null) => void
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let frame = 0
    let last = 0
    let width = 0
    let height = 0
    let dpr = 1
    let storm: Storm | null = null
    const particles: Particle[] = []

    const size = () => {
      dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const seed = () => {
      particles.length = 0
      for (let index = 0; index < POOL; index += 1) {
        particles.push({
          x: Math.random() * (width + 400) - 200,
          y: Math.random() * height,
          a: Math.random(),
          b: Math.random(),
        })
      }
    }

    const stop = () => {
      window.cancelAnimationFrame(frame)
      frame = 0
      storm = null
      ctx.clearRect(0, 0, width, height)
      canvas.style.display = 'none'
    }

    const tick = (now: number) => {
      const current = storm
      if (!current) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // Ease in, and ease out once the flick has died away.
      const goal = now < current.until ? current.target : 0
      current.intensity += (goal - current.intensity) * Math.min(1, dt * 3.2)
      if (goal === 0 && current.intensity < 0.02) {
        stop()
        return
      }

      ctx.clearRect(0, 0, width, height)
      const alive = liveCount(POOL, current.intensity)
      const lean = current.direction
      if (current.kind === 'rain') {
        ctx.lineCap = 'round'
        ctx.lineWidth = 1.5
        for (let index = 0; index < alive; index += 1) {
          const p = particles[index]
          const speed = 1500 + p.a * 1100
          const slant = lean * (380 + p.b * 360)
          p.x += slant * dt
          p.y += speed * dt
          if (p.y > height + 40 || p.x < -260 || p.x > width + 260) {
            p.y = -60 - Math.random() * 120
            p.x = Math.random() * (width + 400) - 200
          }
          const length = 0.03 * speed
          const alpha = (0.32 + p.b * 0.4) * current.intensity
          ctx.strokeStyle = current.light
            ? `rgba(70, 92, 130, ${alpha})`
            : `rgba(196, 214, 255, ${alpha})`
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - (slant / speed) * length, p.y - length)
          ctx.stroke()
        }
      } else {
        for (let index = 0; index < alive; index += 1) {
          const p = particles[index]
          const fall = 90 + p.a * 120
          p.x +=
            (lean * (80 + p.b * 160) + Math.sin(now / 520 + p.a * 9) * 26) * dt
          p.y += fall * dt
          if (p.y > height + 12 || p.x < -60 || p.x > width + 60) {
            p.y = -12 - Math.random() * 60
            p.x = Math.random() * (width + 120) - 60
          }
          const radius = 1.2 + p.b * 2.4
          const alpha = (0.42 + p.a * 0.46) * current.intensity
          ctx.fillStyle = current.light
            ? `rgba(90, 110, 150, ${alpha})`
            : `rgba(255, 255, 255, ${alpha})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      frame = window.requestAnimationFrame(tick)
    }

    const start: WeatherStorm = (speed, direction) => {
      if (readReducedMotion(null)) return
      const plan = stormPlan(speed)
      const now = performance.now()
      if (storm) {
        // Already raining: keep it going and let the new flick lean it.
        storm.until = Math.max(storm.until, now + plan.durationMs)
        storm.target = Math.max(storm.target, plan.intensity)
        storm.direction = direction
        return
      }
      size()
      seed()
      storm = {
        kind: pickWeatherKind(Math.random),
        direction,
        intensity: 0,
        target: plan.intensity,
        until: now + plan.durationMs,
        light:
          document.querySelector('.warp-shell')?.getAttribute('data-theme') ===
          'light',
      }
      canvas.style.display = 'block'
      last = now
      frame = window.requestAnimationFrame(tick)
    }

    register(start)
    return () => {
      register(null)
      stop()
    }
  }, [register])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'none',
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  )
}
