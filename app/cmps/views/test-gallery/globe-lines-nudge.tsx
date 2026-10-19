import { X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { constellationSetting, sessionPathSetting } from './globe-lines'
import {
  LINE_NUDGE_COPY,
  type LineKind,
  markLineNudgeSeen,
  NUDGE_SEEN_AFTER_MS,
  pendingLineNudges,
} from './globe-lines-nudge'
import { PATH_INK } from './session-path'

export type LineNudges = {
  visible: readonly LineKind[]
  // Marks a tip as seen and takes it away (dismissed, or its setting toggled).
  dismiss: (kind: LineKind) => void
}

// Which first-open tips are showing, for as long as the menu is open. Esc
// dismisses them before it closes anything. A tip counts as seen once it has
// been dismissed, its setting was toggled, or the menu was closed after it had
// been on screen a moment (so a remount does not use it up).
export const useLineNudges = (): LineNudges => {
  const [visible, setVisible] = useState<readonly LineKind[]>(() =>
    pendingLineNudges({
      path: sessionPathSetting.isStored,
      links: constellationSetting.isStored,
    }),
  )
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const hasTips = visible.length > 0

  const dismiss = useCallback((kind: LineKind) => {
    markLineNudgeSeen(kind)
    setVisible((current) => current.filter((item) => item !== kind))
  }, [])

  useEffect(() => {
    if (!hasTips) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      for (const kind of visibleRef.current) markLineNudgeSeen(kind)
      setVisible([])
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [hasTips])

  useEffect(() => {
    const openedAt = Date.now()
    return () => {
      if (Date.now() - openedAt < NUDGE_SEEN_AFTER_MS) return
      for (const kind of visibleRef.current) markLineNudgeSeen(kind)
    }
  }, [])

  return { visible, dismiss }
}

type Poster = {
  x: number
  y: number
  w: number
  h: number
  turn: number
  hue: number
  fade: number
}

// A few small posters on the curve of the globe. The big ones are nearest.
const POSTERS: readonly Poster[] = [
  { x: 24, y: 58, w: 17, h: 24, turn: -14, hue: 0, fade: 0.9 },
  { x: 58, y: 30, w: 20, h: 28, turn: -5, hue: 1, fade: 1 },
  { x: 92, y: 52, w: 23, h: 32, turn: 3, hue: 2, fade: 1 },
  { x: 126, y: 28, w: 18, h: 26, turn: 9, hue: 3, fade: 0.95 },
  { x: 140, y: 62, w: 14, h: 20, turn: 17, hue: 4, fade: 0.7 },
  { x: 12, y: 22, w: 11, h: 16, turn: -20, hue: 4, fade: 0.5 },
  { x: 84, y: 11, w: 12, h: 17, turn: -2, hue: 0, fade: 0.55 },
  { x: 60, y: 73, w: 12, h: 16, turn: -8, hue: 3, fade: 0.55 },
]

const POSTER_HUES = [
  ['#46618f', '#1f2c4a'],
  ['#8a4a63', '#3a1d2b'],
  ['#3f8a7c', '#17362f'],
  ['#8d7646', '#3a2f17'],
  ['#6b55a3', '#261c40'],
] as const

// The rose the saved films' hearts and links use on the globe.
const ROSE = { dark: '255, 214, 226', light: '170, 50, 90' } as const

// Where the trail goes, poster to poster (indexes into POSTERS), in the
// colours of a Shuffle Pro path; and which saved posters the links join.
const PATH_STOPS = [0, 1, 2, 3] as const
const PATH_TIERS = ['frost', 'amethyst', 'jade'] as const
const SAVED = [0, 1, 2, 4] as const
const SAVED_LINKS = [
  [0, 1],
  [1, 2],
  [2, 4],
] as const

const heart = (size: number) =>
  `M0 ${size * 0.9} C${-size * 1.5} ${-size * 0.1} ${-size * 0.7} ${-size * 1.1} 0 ${-size * 0.4} C${size * 0.7} ${-size * 1.1} ${size * 1.5} ${-size * 0.1} 0 ${size * 0.9}Z`

// A bowed segment between two posters, like the arcs drawn on the globe.
const arc = (from: Poster, to: Poster, bow: number) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const cx = (from.x + to.x) / 2 + (-dy / length) * bow
  const cy = (from.y + to.y) / 2 + (dx / length) * bow
  return `M${from.x} ${from.y} Q${cx} ${cy} ${to.x} ${to.y}`
}

// What each setting looks like on the globe, as a small cut-out: a patch of
// the poster sphere with the lines drawn the way the real ones are.
export const GlobeLinesArt = ({
  kind,
  light,
}: {
  kind: LineKind
  light: boolean
}) => {
  const uid = useId().replace(/:/g, '')
  const tone = light ? 'light' : 'dark'
  const rose = ROSE[tone]
  const globeLine = light ? '90, 100, 170' : '200, 220, 255'

  return (
    <svg
      className='warp-nudge-art'
      viewBox='0 0 160 84'
      aria-hidden='true'
      focusable='false'
    >
      <defs>
        <radialGradient id={`${uid}-globe`} cx='50%' cy='38%' r='75%'>
          <stop offset='0%' stopColor={light ? '#fffaf0' : '#2a3150'} />
          <stop offset='100%' stopColor={light ? '#e6dcc4' : '#0a0c14'} />
        </radialGradient>
        <clipPath id={`${uid}-clip`}>
          <rect width='160' height='84' rx='9' />
        </clipPath>
        <filter id={`${uid}-glow`} x='-20%' y='-20%' width='140%' height='140%'>
          <feGaussianBlur stdDeviation='2.2' />
        </filter>
        {POSTER_HUES.map(([top, bottom], index) => (
          <linearGradient
            key={top}
            id={`${uid}-poster-${index}`}
            x1='0'
            y1='0'
            x2='0'
            y2='1'
          >
            <stop offset='0%' stopColor={top} />
            <stop offset='100%' stopColor={bottom} />
          </linearGradient>
        ))}
      </defs>
      <g clipPath={`url(#${uid}-clip)`}>
        <rect width='160' height='84' fill={`url(#${uid}-globe)`} />
        <ellipse
          cx='80'
          cy='46'
          rx='120'
          ry='34'
          fill='none'
          stroke={`rgba(${globeLine}, 0.16)`}
          strokeWidth='0.8'
        />
        <ellipse
          cx='80'
          cy='42'
          rx='52'
          ry='96'
          fill='none'
          stroke={`rgba(${globeLine}, 0.14)`}
          strokeWidth='0.8'
        />
        {POSTERS.map((poster) => (
          <g
            key={`${poster.x}-${poster.y}`}
            transform={`translate(${poster.x} ${poster.y}) rotate(${poster.turn})`}
            opacity={poster.fade * (light ? 0.88 : 0.92)}
          >
            <rect
              x={-poster.w / 2}
              y={-poster.h / 2}
              width={poster.w}
              height={poster.h}
              rx='2'
              fill={`url(#${uid}-poster-${poster.hue})`}
            />
            <rect
              x={-poster.w / 2 + 2.5}
              y={poster.h / 2 - 6}
              width={poster.w * 0.55}
              height='1.6'
              rx='0.8'
              fill='rgba(255, 255, 255, 0.4)'
            />
            <rect
              x={-poster.w / 2 + 2.5}
              y={poster.h / 2 - 3.2}
              width={poster.w * 0.34}
              height='1.2'
              rx='0.6'
              fill='rgba(255, 255, 255, 0.22)'
            />
          </g>
        ))}

        {kind === 'path'
          ? PATH_STOPS.slice(1).map((stop, step) => {
              const from = POSTERS[PATH_STOPS[step]]
              const to = POSTERS[stop]
              const rgb = PATH_INK[PATH_TIERS[step]][tone]
              const d = arc(from, to, step % 2 === 0 ? -9 : 9)
              const delay = { animationDelay: `${0.45 + step * 0.35}s` }
              return (
                <g key={`${PATH_STOPS[step]}-${stop}`}>
                  <path
                    className='warp-nudge-draw'
                    pathLength='1'
                    d={d}
                    fill='none'
                    stroke={`rgba(${rgb}, 0.9)`}
                    strokeWidth='4.5'
                    strokeLinecap='round'
                    filter={`url(#${uid}-glow)`}
                    style={delay}
                  />
                  <path
                    className='warp-nudge-draw'
                    pathLength='1'
                    d={d}
                    fill='none'
                    stroke={`rgb(${rgb})`}
                    strokeWidth='1.7'
                    strokeLinecap='round'
                    style={delay}
                  />
                </g>
              )
            })
          : SAVED_LINKS.map(([a, b], step) => (
              <path
                key={`${a}-${b}`}
                className='warp-nudge-draw'
                pathLength='1'
                d={arc(POSTERS[a], POSTERS[b], step % 2 === 0 ? -7 : 7)}
                fill='none'
                stroke={`rgba(${rose}, 0.85)`}
                strokeWidth='1.3'
                strokeLinecap='round'
                style={{ animationDelay: `${0.45 + step * 0.3}s` }}
              />
            ))}

        {kind === 'path'
          ? PATH_STOPS.map((stop, step) => {
              const poster = POSTERS[stop]
              const rgb =
                PATH_INK[PATH_TIERS[Math.min(step, PATH_TIERS.length - 1)]][
                  tone
                ]
              return (
                <g key={stop} transform={`translate(${poster.x} ${poster.y})`}>
                  <circle r='9' fill={`rgba(${rgb}, 0.22)`} />
                  <circle
                    r='4.6'
                    fill='none'
                    stroke={`rgb(${rgb})`}
                    strokeWidth='1.4'
                  />
                  {step === PATH_STOPS.length - 1 ? (
                    <circle
                      className='warp-nudge-pulse'
                      r='8'
                      fill='none'
                      stroke={`rgba(${rgb}, 0.55)`}
                      strokeWidth='1'
                    />
                  ) : null}
                </g>
              )
            })
          : SAVED.map((stop) => {
              const poster = POSTERS[stop]
              return (
                <g key={stop} transform={`translate(${poster.x} ${poster.y})`}>
                  <path
                    d={heart(4.2)}
                    fill={light ? `rgb(${rose})` : 'rgb(255, 246, 249)'}
                    style={{
                      filter: `drop-shadow(0 0 3px rgba(${rose}, 0.95))`,
                    }}
                  />
                </g>
              )
            })}
      </g>
      <rect
        x='0.5'
        y='0.5'
        width='159'
        height='83'
        rx='8.5'
        fill='none'
        stroke={light ? 'rgba(60, 44, 20, 0.14)' : 'rgba(255, 255, 255, 0.1)'}
      />
    </svg>
  )
}

type LineNudgeProps = {
  id: string
  kind: LineKind
  light: boolean
  // Above or below the switch it points at, so it never covers it.
  placement: 'above' | 'below'
  onDismiss: () => void
}

// A small tip beside a setting's switch: a cut-out of the feature on the
// globe and one line saying what it does. Tapping it or its close button
// dismisses it; Esc dismisses it too (see useLineNudges).
export const LineNudge = ({
  id,
  kind,
  light,
  placement,
  onDismiss,
}: LineNudgeProps) => (
  // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: the close button and Esc are the keyboard routes; tapping the tip is a convenience.
  <div className={`warp-nudge is-${placement}`} onClick={onDismiss}>
    <div id={id} role='tooltip' className='warp-nudge-card'>
      <GlobeLinesArt kind={kind} light={light} />
      <p>{LINE_NUDGE_COPY[kind].line}</p>
    </div>
    <button
      type='button'
      className='warp-nudge-close'
      aria-label={`Dismiss tip: ${LINE_NUDGE_COPY[kind].title}`}
      onClick={(event) => {
        event.stopPropagation()
        onDismiss()
      }}
    >
      <X aria-hidden='true' />
    </button>
  </div>
)
