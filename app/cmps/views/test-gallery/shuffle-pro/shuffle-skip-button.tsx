import { ChevronsRight, Dices } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { cn } from '../../../../utils/tw'

type ShuffleSkipButtonProps = {
  // While a spin is active the button becomes Skip.
  skip: boolean
  disabled?: boolean
  onShuffle: () => void
  onSkip: () => void
}

// The dock's Shuffle button. During a spin the dice and "Shuffle" crossfade to
// a chevron and "Skip", and the pill's width eases between the two.
export const ShuffleSkipButton = ({
  skip,
  disabled,
  onShuffle,
  onSkip,
}: ShuffleSkipButtonProps) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const lastWidth = useRef<number | null>(null)

  // Animate the width between the natural widths of the two labels. On narrow
  // screens the label is hidden and the button is a fixed circle: nothing to do.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when `skip` flips
  useLayoutEffect(() => {
    const button = buttonRef.current
    const label = labelRef.current
    if (!button || !label) return
    if (getComputedStyle(label).display === 'none') {
      lastWidth.current = null
      return
    }
    button.style.width = ''
    const next = button.getBoundingClientRect().width
    const previous = lastWidth.current
    lastWidth.current = next
    if (previous === null || Math.abs(previous - next) < 1) return
    button.style.width = `${previous}px`
    void button.offsetWidth
    button.style.width = `${next}px`
    const done = () => {
      button.style.width = ''
      button.removeEventListener('transitionend', done)
    }
    button.addEventListener('transitionend', done)
    const fallback = window.setTimeout(done, 400)
    return () => window.clearTimeout(fallback)
  }, [skip])

  return (
    <button
      ref={buttonRef}
      type='button'
      className={cn('warp-shuffle-button', skip && 'is-skip')}
      aria-label={skip ? 'Skip to the movie' : 'Shuffle to a random movie'}
      disabled={disabled && !skip}
      onClick={skip ? onSkip : onShuffle}
    >
      <span className='warp-shuffle-icons' aria-hidden='true'>
        <Dices className='warp-shuffle-icon is-shuffle' />
        <ChevronsRight className='warp-shuffle-icon is-skip' />
      </span>
      <span className='warp-shuffle-label' ref={labelRef} aria-hidden='true'>
        <span className='is-shuffle'>Shuffle</span>
        <span className='is-skip'>Skip</span>
      </span>
    </button>
  )
}
