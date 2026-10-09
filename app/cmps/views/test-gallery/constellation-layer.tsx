import { useEffect, useMemo, useRef } from 'react'
import { buildConstellation } from './constellation'
import type {
  InfiniteMovieMenuControl,
  PosterPoint,
} from './infinite-movie-menu'

const MAX_STARS = 24
const MAX_DPR = 1.5

type ConstellationLayerProps = {
  controlRef: { current: InfiniteMovieMenuControl | null }
  // The saved films' ids, newest first.
  ids: readonly string[]
  // Whether the globe is what is showing and the setting is on.
  active: boolean
  light: boolean
}

// Joins the saved films that are on the globe into a shape of light. It never
// runs a loop of its own: it redraws when the globe has drawn a frame (which
// only happens when something moved), when the saved list changes, and when
// the window is resized.
export const ConstellationLayer = ({
  controlRef,
  ids,
  active,
  light,
}: ConstellationLayerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const idSet = useMemo(() => new Set(ids.slice(0, MAX_STARS)), [ids])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const control = controlRef.current
    if (!canvas || !ctx || !control) return
    if (!active || idSet.size < 2) {
      canvas.style.display = 'none'
      return
    }
    canvas.style.display = 'block'
    let width = 0
    let height = 0
    let dpr = 1

    const resize = () => {
      dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const line = light ? '120, 80, 10' : '255, 218, 130'
    const glow = light ? '150, 100, 10' : '255, 205, 100'

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      // Only the saved films that are actually on screen take part.
      const points: PosterPoint[] = control
        .getPosterPoints(idSet)
        .filter(
          (point) =>
            point.left + point.width > 0 &&
            point.left < width &&
            point.top + point.height > 0 &&
            point.top < height,
        )
      if (points.length < 1) return
      const stars = points.map((point) => ({
        id: point.id,
        x: point.left + point.width / 2,
        y: point.top + point.height / 2,
        r: Math.max(point.width, point.height) / 2,
        depth: point.depth,
      }))
      const links = buildConstellation(stars, Math.min(width, height) * 0.7)

      ctx.lineCap = 'round'
      for (const [from, to] of links) {
        const a = stars[from]
        const b = stars[to]
        const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        gradient.addColorStop(0, `rgba(${line}, 0.62)`)
        gradient.addColorStop(0.5, `rgba(${line}, 0.28)`)
        gradient.addColorStop(1, `rgba(${line}, 0.62)`)
        ctx.strokeStyle = gradient
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      for (const star of stars) {
        // A soft halo, a ring around the poster and a bright point at its heart.
        const halo = ctx.createRadialGradient(
          star.x,
          star.y,
          0,
          star.x,
          star.y,
          star.r * 1.5,
        )
        halo.addColorStop(0, `rgba(${glow}, 0.32)`)
        halo.addColorStop(1, `rgba(${glow}, 0)`)
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.r * 1.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = `rgba(${line}, 0.7)`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(star.x, star.y, Math.max(5, star.r * 0.16), 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = light
          ? 'rgba(120, 80, 10, 0.95)'
          : 'rgba(255, 244, 214, 0.95)'
        ctx.beginPath()
        ctx.arc(star.x, star.y, Math.max(2.4, star.r * 0.07), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    resize()
    draw()
    control.setOnFrame(draw)
    const onResize = () => {
      resize()
      draw()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      control.setOnFrame(null)
      ctx.clearRect(0, 0, width, height)
    }
  }, [controlRef, idSet, active, light])

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
