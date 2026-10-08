import { ChevronsRight, Dices, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../../../utils/tw'

type EnterProps = {
  onEnter: () => void
  hint: boolean
}

// The circular button that goes full screen (immersive mode). Sits in the top
// bar beside "Let's Watch" on desktop and top right on phones.
export const ImmersiveEnterButton = ({ onEnter, hint }: EnterProps) => (
  <span className='warp-immersive-wrap'>
    <button
      type='button'
      className='warp-cta warp-immersive-button'
      aria-label='Go full screen'
      onClick={onEnter}
    >
      <Maximize2 aria-hidden='true' />
    </button>
    {hint ? (
      <span className='warp-fullscreen-tip' role='tooltip'>
        Go full screen for maximum immersion
      </span>
    ) : null}
  </span>
)

type ExitProps = { onExit: () => void }

export const ImmersiveExitPill = ({ onExit }: ExitProps) => (
  <button
    type='button'
    className='warp-immersive-exit'
    aria-label='Exit full screen'
    onClick={onExit}
  >
    <Minimize2 aria-hidden='true' />
    <span>Exit</span>
  </button>
)

type CornerProps = {
  skip: boolean
  disabled?: boolean
  onShuffle: () => void
  onSkip: () => void
}

// Bottom-right circle while immersive: shuffles at rest, and pops into a
// skip chevron while a spin is running.
export const ImmersiveCorner = ({
  skip,
  disabled,
  onShuffle,
  onSkip,
}: CornerProps) => (
  <button
    type='button'
    className={cn('warp-immersive-corner', skip && 'is-skip')}
    aria-label={skip ? 'Skip to the movie' : 'Shuffle to a random movie'}
    disabled={disabled && !skip}
    onClick={skip ? onSkip : onShuffle}
  >
    {skip ? (
      <ChevronsRight key='skip' className='is-pop' aria-hidden='true' />
    ) : (
      <Dices key='shuffle' aria-hidden='true' />
    )}
  </button>
)
