import { ArrowRight, X } from 'lucide-react'
import { useEffect } from 'react'
import './mood-entry.css'
import { MOOD_WORLDS } from './mood-worlds'

// Six small dots, one in each world's colour: the mood page's mark.
const Palette = () => (
  <span className='mood-dots' aria-hidden='true'>
    {MOOD_WORLDS.map((world) => (
      <i key={world.id} style={{ background: world.accent }} />
    ))}
  </span>
)

type OpenProps = { onOpen: () => void }

// The line above the dock on Home.
export const MoodLine = ({ onOpen }: OpenProps) => (
  <div className='mood-line'>
    <span className='mood-line-text'>How are you feeling?</span>
    <button type='button' className='mood-line-button' onClick={onOpen}>
      <Palette />
      <span>Pick your mood</span>
      <ArrowRight aria-hidden='true' />
    </button>
  </div>
)

// The slot on the Filters page. It is a way in, not the page itself.
export const MoodFunnel = ({ onOpen }: OpenProps) => (
  <button type='button' className='mood-funnel' onClick={onOpen}>
    <Palette />
    <span className='mood-funnel-copy'>
      <strong>Not sure what you want?</strong>
      <small>Tell us how you are feeling and we will narrow it down.</small>
    </span>
    <span className='mood-funnel-go'>
      Pick your mood
      <ArrowRight aria-hidden='true' />
    </span>
  </button>
)

type NudgeProps = OpenProps & { onDismiss: () => void }

const NUDGE_VISIBLE_MS = 9000

// A small pop-up offered after a few quick shuffles in a row. It leaves on its
// own and never comes back in the same visit.
export const MoodNudge = ({ onOpen, onDismiss }: NudgeProps) => {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, NUDGE_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  return (
    <aside className='mood-nudge' aria-label='Suggestion'>
      <Palette />
      <span className='mood-nudge-text'>Not landing on anything?</span>
      <button type='button' className='mood-nudge-go' onClick={onOpen}>
        Pick your mood
      </button>
      <button
        type='button'
        className='mood-nudge-close'
        aria-label='Dismiss'
        onClick={onDismiss}
      >
        <X aria-hidden='true' />
      </button>
      <i className='mood-nudge-timer' />
    </aside>
  )
}
