// Small pieces the Pass the globe screens share: the player dot, the poster,
// the two-tap "end the game" button, and the count-up number.

import { useEffect, useRef, useState } from 'react'
import { cn } from '../../../../utils/tw'
import type { PartyMode, RoundMode } from './party-logic'

export const PLAYER_COLORS = [
  '#ff7a2f',
  '#a78bfa',
  '#ffd23f',
  '#ff6b9d',
  '#5eead4',
  '#60a5fa',
]

export const colorOf = (index: number) =>
  PLAYER_COLORS[index % PLAYER_COLORS.length]

// What a screen needs to draw a film it only knows by id.
export type PartyMovieInfo = {
  id: string
  title: string
  posterUrl: string | null
  posterDetailUrl?: string | null
  year: string
  rating: string | null
}

export const MODE_LABELS: Record<PartyMode, string> = {
  year: 'When was it?',
  rating: 'Rate it',
  crowd: 'Crowd pleaser',
  mixed: 'Mixed',
}

export const MODE_BLURBS: Record<PartyMode, string> = {
  year: 'Guess the release year. Closer scores more.',
  rating: 'Guess the TMDB rating, out of 10.',
  crowd: 'The others vote on your landing.',
  mixed: 'A new mode every round.',
}

export const ROUND_PROMPTS: Record<RoundMode, string> = {
  year: 'When was it released?',
  rating: 'What is its rating?',
  crowd: 'Would you watch it?',
}

export const Dot = ({
  index,
  name,
  size = 'md',
}: {
  index: number
  name: string
  size?: 'sm' | 'md'
}) => (
  <span
    className={cn('party-dot', size === 'sm' && 'is-small')}
    style={{ background: colorOf(index) }}
    aria-hidden='true'
  >
    {name.trim().charAt(0).toUpperCase() || index + 1}
  </span>
)

export const Poster = ({
  src,
  title,
  className,
}: {
  src: string | null | undefined
  title: string
  className?: string
}) => (
  <span className={cn('party-poster', className)}>
    {src ? (
      <img
        src={src}
        alt=''
        decoding='async'
        draggable={false}
        crossOrigin='anonymous'
      />
    ) : null}
    <span className='party-poster-title' aria-hidden='true'>
      {title}
    </span>
  </span>
)

// Esc closes the screen, ahead of the page's own Esc handling.
export const useEscape = (onEscape: (() => void) | null) => {
  useEffect(() => {
    if (!onEscape) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onEscape()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onEscape])
}

// Ending a game takes two taps, so a stray tap on a phone can't lose it.
export const EndButton = ({ onEnd }: { onEnd: () => void }) => {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(timer)
  }, [armed])
  return (
    <button
      type='button'
      className={cn('party-quit', armed && 'is-armed')}
      onClick={() => (armed ? onEnd() : setArmed(true))}
    >
      {armed ? 'Tap again to end the game' : 'End game'}
    </button>
  )
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// A number that counts up to its value, then stays put.
export const useCountUp = (target: number, duration = 1100) => {
  const [value, setValue] = useState(() =>
    prefersReducedMotion() ? target : 0,
  )
  const frame = useRef(0)
  useEffect(() => {
    if (prefersReducedMotion() || target <= 0) {
      setValue(target)
      return
    }
    const started = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(target * eased))
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration])
  return value
}
