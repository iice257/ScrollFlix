import { useSyncExternalStore } from 'react'
import { cn } from '../../../../utils/tw'
import type { ShuffleProController } from './shuffle-pro-controller'
import './demo-streak-chip.css'
import { STREAK_RULES } from './shuffle-pro-logic'

// Dev mode only (local development; never in a production build): where the two automatic triggers stand, read from the
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
  const spinsNear = spins >= spinsGoal - 1
  const shufflesNear = shuffles >= shufflesGoal - 1
  // One action short of a guaranteed run, the label names what comes next.
  const spinsTier = immersive ? 'Jade' : 'Frost'
  const shufflesTier = immersive ? 'Jade' : 'Amethyst'

  return (
    <output
      className='warp-demo-chip'
      aria-label={`Dev mode: ${spins} of ${spinsGoal} big spins${spinsNear ? `, ${spinsTier} next` : ''}, ${shuffles} of ${shufflesGoal} shuffles${shufflesNear ? `, ${shufflesTier} next` : ''}`}
    >
      <span className={cn('warp-demo-chip-item', spinsNear && 'is-near')}>
        <span className='warp-demo-chip-label'>
          {spinsNear ? `${spinsTier} next` : 'Big spins'}
        </span>
        <span className='warp-demo-chip-value'>
          {spins} / {spinsGoal}
        </span>
      </span>
      <span className='warp-demo-chip-divider' aria-hidden='true' />
      <span className={cn('warp-demo-chip-item', shufflesNear && 'is-near')}>
        <span className='warp-demo-chip-label'>
          {shufflesNear ? `${shufflesTier} next` : 'Shuffles'}
        </span>
        <span className='warp-demo-chip-value'>
          {shuffles} / {shufflesGoal}
        </span>
      </span>
    </output>
  )
}
