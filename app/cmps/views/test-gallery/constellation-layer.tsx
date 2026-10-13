import { useEffect, useMemo, useRef } from 'react'
import { buildConstellation } from './constellation'
import type {
  InfiniteMovieMenuControl,
  PosterProjector,
  PosterWorld,
} from './infinite-movie-menu'
import { PATH_INK, type PathPoint } from './session-path'

const MAX_HEARTS = 24
const MAX_DPR = 1.5
const ARC_STEPS = 26
// Redraws at most this often for the twinkle; a still globe costs one pass.
const TWINKLE_FRAME_MS = 1000 / 30
const DRAW_IN_MS = 900
// Links are drawn this far above the globe's surface so they float over it.
const LIFT = 1.018

type ConstellationLayerProps = {
  controlRef: { current: InfiniteMovieMenuControl | null }
  // The saved films' ids, newest first.
  ids: readonly string[]
  // The session path: every film this visit has landed on, in order.
  path: readonly PathPoint[]
  // Whether the globe is what is showing and the setting is on.
  active: boolean
  light: boolean
}

type Vec3 = { x: number; y: number; z: number }

// A stable 0..1 number for an id, so every star twinkles on its own beat.
const hashUnit = (id: string) => {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}

// How much of a point on the sphere can be seen: 0 behind the horizon, 1 well
// in front of it. Links fade out as they go round the edge.
const facing = (z: number, radius: number) =>
  Math.min(1, Math.max(0, (z / radius - 0.02) / 0.22))

// Points along the great circle between two posters, a little above the
// surface, so a link follows the globe instead of cutting through it.
const sphereArc = (a: Vec3, b: Vec3, radius: number): Vec3[] => {
  const dot = (a.x * b.x + a.y * b.y + a.z * b.z) / (radius * radius)
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)))
  const sin = Math.sin(angle)
  const out: Vec3[] = []
  for (let step = 0; step <= ARC_STEPS; step += 1) {
    const u = step / ARC_STEPS
    let x: number
    let y: number
    let z: number
    if (sin < 1e-3) {
      x = a.x + (b.x - a.x) * u
      y = a.y + (b.y - a.y) * u
      z = a.z + (b.z - a.z) * u
    } else {
      const wa = Math.sin((1 - u) * angle) / sin
      const wb = Math.sin(u * angle) / sin
      x = a.x * wa + b.x * wb
      y = a.y * wa + b.y * wb
      z = a.z * wa + b.z * wb
    }
    out.push({ x: x * LIFT, y: y * LIFT, z: z * LIFT })
  }
  return out
}

// Joins the saved films with thin links and marks each with a small heart, and
// draws the session path over them. Links run round the globe. Everything
// twinkles very gently, so while the layer is showing it redraws about 30
// times a second (never when the tab is hidden or reduced motion is on).
export const ConstellationLayer = ({
  controlRef,
  ids,
  path,
  active,
  light,
}: ConstellationLayerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const idSet = useMemo(() => new Set(ids.slice(0, MAX_HEARTS)), [ids])
  const wanted = useMemo(() => {
    const all = new Set(idSet)
    for (const point of path) all.add(point.id)
    return all
  }, [idSet, path])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const control = controlRef.current
    if (!canvas || !ctx || !control) return
    if (!active || (idSet.size < 1 && path.length < 2)) {
      canvas.style.display = 'none'
      return
    }
    canvas.style.display = 'block'
    let width = 0
    let height = 0
    let dpr = 1
    let seconds = 0
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches

    const resize = () => {
      dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // White starlight on the dark globe; deep ink on the light one, where
    // white would vanish. Hearts take a faint rose tint.
    const line = light ? '46, 56, 112' : '236, 243, 255'
    const glow = light ? '90, 100, 170' : '200, 220, 255'
    const core = light ? '36, 44, 100' : '255, 255, 255'
    const rose = light ? '170, 50, 90' : '255, 214, 226'

    // A polyline round the globe: each piece fades with how much of it faces
    // the viewer, and only the first `fraction` of it is drawn.
    const strokeArc = (
      samples: Vec3[],
      project: PosterProjector,
      radius: number,
      rgb: string,
      alpha: number,
      lineWidth: number,
      fraction = 1,
    ) => {
      const last = Math.max(1, Math.round((samples.length - 1) * fraction))
      ctx.lineWidth = lineWidth
      let from: [number, number] | null = null
      let fromSeen = 0
      for (let index = 0; index <= last; index += 1) {
        const sample = samples[index]
        const at = project(sample.x, sample.y, sample.z)
        const seen = facing(sample.z, radius)
        if (from && at) {
          const visible = Math.min(fromSeen, seen)
          if (visible > 0.01) {
            ctx.strokeStyle = `rgba(${rgb}, ${alpha * visible})`
            ctx.beginPath()
            ctx.moveTo(from[0], from[1])
            ctx.lineTo(at[0], at[1])
            ctx.stroke()
          }
        }
        from = at
        fromSeen = seen
      }
    }

    // A four-point glint: two thin crossed streaks and a bright heart.
    const sparkle = (
      x: number,
      y: number,
      size: number,
      alpha: number,
      rgb: string,
    ) => {
      if (alpha <= 0.02) return
      ctx.save()
      ctx.translate(x, y)
      ctx.globalAlpha = Math.min(1, alpha)
      ctx.fillStyle = `rgb(${rgb})`
      for (const turn of [0, Math.PI / 2]) {
        ctx.save()
        ctx.rotate(turn)
        ctx.beginPath()
        ctx.moveTo(-size, 0)
        ctx.quadraticCurveTo(0, size * 0.1, size, 0)
        ctx.quadraticCurveTo(0, -size * 0.1, -size, 0)
        ctx.fill()
        ctx.restore()
      }
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(1.4, size * 0.16), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const heart = (x: number, y: number, size: number, alpha: number) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.globalAlpha = Math.min(1, alpha)
      ctx.shadowColor = `rgba(${rose}, 0.9)`
      ctx.shadowBlur = size * 1.1
      ctx.fillStyle = `rgb(${light ? rose : '255, 246, 249'})`
      ctx.beginPath()
      ctx.moveTo(0, size * 0.9)
      ctx.bezierCurveTo(
        -size * 1.5,
        -size * 0.1,
        -size * 0.7,
        -size * 1.1,
        0,
        -size * 0.4,
      )
      ctx.bezierCurveTo(
        size * 0.7,
        -size * 1.1,
        size * 1.5,
        -size * 0.1,
        0,
        size * 0.9,
      )
      ctx.fill()
      ctx.restore()
    }

    const twinkle = (id: string) => {
      const seed = hashUnit(id)
      const speed = 1.2 + seed * 1.8
      return 0.7 + 0.3 * Math.sin(seconds * speed + seed * 40)
    }

    const drawSaved = (
      world: Map<string, PosterWorld>,
      project: PosterProjector,
      radius: number,
    ) => {
      const saved = [...idSet]
        .map((id) => world.get(id))
        .filter((point): point is PosterWorld => Boolean(point))
      if (saved.length < 1) return
      ctx.lineCap = 'round'
      // Thin links between the nearest saved films, round the globe.
      const links = buildConstellation(
        saved.map((point) => ({ ...point, r: 0, depth: 0 })),
        radius * 1.25,
      )
      for (const [from, to] of links) {
        strokeArc(
          sphereArc(saved[from], saved[to], radius),
          project,
          radius,
          rose,
          0.34,
          1,
        )
      }
      for (const point of saved) {
        const seen = facing(point.z, radius)
        if (seen <= 0.05) continue
        const at = project(point.x, point.y, point.z)
        if (!at) continue
        const bright = twinkle(point.id)
        heart(
          at[0],
          at[1],
          6 + 3 * (point.z / radius),
          seen * (0.55 + 0.4 * bright),
        )
      }
    }

    const drawPath = (
      world: Map<string, PosterWorld>,
      project: PosterProjector,
      radius: number,
    ) => {
      if (path.length < 2) return
      const now = Date.now()
      ctx.lineCap = 'round'
      let previous: PosterWorld | null = null
      let lastShown: { point: PosterWorld; entry: PathPoint } | null = null
      for (const entry of path) {
        const here = world.get(entry.id)
        if (!here) {
          previous = null
          continue
        }
        const rgb = entry.tier
          ? PATH_INK[entry.tier][light ? 'light' : 'dark']
          : null
        if (previous && previous.id !== here.id) {
          const drawIn = entry.at
            ? Math.min(1, Math.max(0.04, (now - entry.at) / DRAW_IN_MS))
            : 1
          const samples = sphereArc(previous, here, radius)
          ctx.shadowColor = `rgba(${rgb ?? glow}, 0.9)`
          ctx.shadowBlur = rgb ? 14 : 5
          strokeArc(
            samples,
            project,
            radius,
            rgb ?? line,
            rgb ? 0.95 : 0.6,
            rgb ? 3.2 : 1.5,
            drawIn,
          )
          ctx.shadowBlur = 0
          if (rgb) {
            // A glint rides the coloured link.
            const u = (seconds * 0.35) % 1
            const sample = samples[Math.round(u * ARC_STEPS)]
            const at = project(sample.x, sample.y, sample.z)
            if (at) {
              sparkle(
                at[0],
                at[1],
                8,
                Math.sin(u * Math.PI) * facing(sample.z, radius),
                rgb,
              )
            }
          }
        }
        previous = here
        lastShown = { point: here, entry }
      }
      // The points themselves.
      const drawn = new Set<string>()
      for (const entry of path) {
        if (drawn.has(entry.id)) continue
        const point = world.get(entry.id)
        if (!point) continue
        drawn.add(entry.id)
        const seen = facing(point.z, radius)
        if (seen <= 0.05) continue
        const at = project(point.x, point.y, point.z)
        if (!at) continue
        const rgb = entry.tier
          ? PATH_INK[entry.tier][light ? 'light' : 'dark']
          : null
        const bright = twinkle(entry.id)
        ctx.globalAlpha = seen
        if (rgb) {
          const reach = 46
          const halo = ctx.createRadialGradient(
            at[0],
            at[1],
            0,
            at[0],
            at[1],
            reach,
          )
          halo.addColorStop(0, `rgba(${rgb}, ${0.4 + 0.2 * bright})`)
          halo.addColorStop(1, `rgba(${rgb}, 0)`)
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(at[0], at[1], reach, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowColor = `rgba(${rgb}, 1)`
          ctx.shadowBlur = 14
          ctx.strokeStyle = `rgba(${rgb}, 1)`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(at[0], at[1], 9, 0, Math.PI * 2)
          ctx.stroke()
          ctx.shadowBlur = 0
          sparkle(at[0], at[1], 12 + 5 * bright, 0.7 + 0.3 * bright, rgb)
        } else {
          sparkle(at[0], at[1], 5 + 3 * bright, 0.45 + 0.4 * bright, core)
        }
        ctx.globalAlpha = 1
      }
      // "You are here": a slow ring on the newest point.
      if (lastShown) {
        const { point } = lastShown
        const seen = facing(point.z, radius)
        const at = project(point.x, point.y, point.z)
        if (at && seen > 0.05) {
          const pulse = 0.5 + 0.5 * Math.sin(seconds * 2)
          ctx.strokeStyle = `rgba(${line}, ${(0.18 + 0.2 * pulse) * seen})`
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.arc(at[0], at[1], 13 + 4 * pulse, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      const worldPoints = control.getPosterWorld(wanted)
      if (worldPoints.length < 1) return
      const world = new Map(worldPoints.map((point) => [point.id, point]))
      const first = worldPoints[0]
      const radius = Math.hypot(first.x, first.y, first.z)
      if (radius <= 0) return
      const project = control.getProjector()
      drawSaved(world, project, radius)
      drawPath(world, project, radius)
    }

    resize()
    draw()
    control.setOnFrame(draw)

    // The twinkle: a gentle timer on top of the globe's own redraws.
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick)
      if (document.hidden || now - last < TWINKLE_FRAME_MS) return
      last = now
      seconds = now / 1000
      draw()
    }
    if (!reduced) raf = window.requestAnimationFrame(tick)

    const onResize = () => {
      resize()
      draw()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      control.setOnFrame(null)
      ctx.clearRect(0, 0, width, height)
    }
  }, [controlRef, idSet, path, wanted, active, light])

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
