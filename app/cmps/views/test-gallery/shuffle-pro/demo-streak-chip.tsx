import { useSyncExternalStore } from 'react'
import { cn } from '../../../../utils/tw'
import type { ShuffleProController } from './shuffle-pro-controller'
import { STREAK_RULES } from './shuffle-pro-logic'

// Demo mode only: where the two automatic triggers stand, read from the
// controller's own streak state. It re-renders on a streak change, never per
// frame, and the gallery around it is not touched.
export const DemoStreakChip = ({
  controller,
  immersive,
}: {
  controller: ShuffleProController
  immersive: boolean
}) => {
  const streak = useSyncExternalStore(
    controller.subscribeStreak,
    controller.getStreak,
    controller.getStreak,
  )
  const spinsGoal = immersive
    ? STREAK_RULES.immersive.bigSpinRun
    : STREAK_RULES.normal.bigSpinRun
  const shufflesGoal = immersive
    ? STREAK_RULES.immersive.streak
    : STREAK_RULES.normal.streakRoll
  const spins = Math.min(streak.bigSpinRun, spinsGoal)
  const shuffles = Math.min(streak.streak, shufflesGoal)

  return (
    <output
      className='warp-demo-chip'
      aria-label={`Demo mode: ${spins} of ${spinsGoal} big spins, ${shuffles} of ${shufflesGoal} shuffles`}
    >
      <span
        className={cn(
          'warp-demo-chip-item',
          spins >= spinsGoal - 1 && 'is-near',
        )}
      >
        <span className='warp-demo-chip-label'>Big spins</span>
        <span className='warp-demo-chip-value'>
          {spins} / {spinsGoal}
        </span>
      </span>
      <span className='warp-demo-chip-divider' aria-hidden='true' />
      <span
        className={cn(
          'warp-demo-chip-item',
          shuffles >= shufflesGoal - 1 && 'is-near',
        )}
      >
        <span className='warp-demo-chip-label'>Shuffles</span>
        <span className='warp-demo-chip-value'>
          {shuffles} / {shufflesGoal}
        </span>
      </span>
    </output>
  )
}
