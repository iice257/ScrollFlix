import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { pickWeighted } from '../moods/taste'
import { goldenHourStore } from './golden-hour'
import {
  createWhoosh,
  playLandingThud,
  playPeakChime,
} from './shuffle-pro-audio'
import {
  type ControllerSnapshot,
  ShuffleProController,
} from './shuffle-pro-controller'
import {
  startPresentationMusic,
  stopPresentationMusic,
} from './shuffle-pro-music'
import { cancelTierPreload, startTierPreload } from './shuffle-pro-preload'
import { shuffleProStore } from './shuffle-pro-store'

type Context = {
  theme: 'dark' | 'light'
  immersive: boolean
  // The movies on the globe; a landing never picks the current one.
  visibleMovies: readonly { id: string }[]
  currentId: string | null
  // A relative chance per film for the landing pick (the saved films' taste).
  weightOf?: (movie: { id: string }) => number
  // Closes overlays before a run takes over the screen.
  prepare: () => void
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export const readReducedMotion = (override: boolean | null) => {
  if (override !== null) return override
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.(REDUCED_MOTION_QUERY).matches ||
    new URLSearchParams(window.location.search).has('reduced-motion')
  )
}

// A random movie on the globe other than the current one.
export const pickOtherMovie = <T extends { id: string }>(
  movies: readonly T[],
  currentId: string | null,
  random: () => number,
  // A relative chance per film; the saved films' taste uses it to lean the pick.
  weightOf?: (movie: T) => number,
) => {
  if (!movies.length) return null
  if (movies.length === 1) return movies[0].id
  if (weightOf) {
    const others = movies.filter((movie) => movie.id !== currentId)
    const picked = pickWeighted(others, weightOf, random)
    if (picked) return picked.id
  }
  let index = Math.floor(random() * movies.length)
  if (movies[index].id === currentId) index = (index + 1) % movies.length
  return movies[index].id
}

// Owns one controller for the page and keeps its dependencies current without
// ever rebuilding it.
export const useShuffleProController = (context: Context) => {
  const contextRef = useRef(context)
  contextRef.current = context
  const reducedMotionOverride = useRef<boolean | null>(null)

  const [controller] = useState(
    () =>
      new ShuffleProController({
        now: () => performance.now(),
        random: Math.random,
        raf: (callback) => window.requestAnimationFrame(callback),
        caf: (id) => window.cancelAnimationFrame(id),
        getTheme: () => contextRef.current.theme,
        isImmersive: () => contextRef.current.immersive,
        isReducedMotion: () => readReducedMotion(reducedMotionOverride.current),
        getFound: () => shuffleProStore.get().found,
        isGoldenHour: () => goldenHourStore.get(),
        recordRun: (tier) => shuffleProStore.recordRun(tier),
        onStreak: (streak) => shuffleProStore.recordStreak(streak),
        createWhoosh,
        prewarmTier: (tier) => {
          if (tier) startTierPreload(tier)
          else cancelTierPreload()
        },
        onCue: (cue, tier) => {
          if (cue === 'peak') {
            playPeakChime(tier)
            startPresentationMusic(tier)
          } else if (cue === 'land') playLandingThud(tier)
          else stopPresentationMusic()
        },
        pickTarget: () =>
          pickOtherMovie(
            contextRef.current.visibleMovies,
            contextRef.current.currentId,
            Math.random,
            contextRef.current.weightOf,
          ),
        prepare: () => contextRef.current.prepare(),
        vibrate: (pattern) => {
          try {
            navigator.vibrate?.(pattern)
          } catch {
            // Vibration is unsupported or blocked.
          }
        },
      }),
  )

  useEffect(() => () => controller.dispose(), [controller])

  const snapshot: ControllerSnapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )

  return { controller, snapshot, reducedMotionOverride }
}
