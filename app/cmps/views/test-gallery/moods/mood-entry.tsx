import { ArrowRight, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import './mood-entry.css'
import {
  FIRST_PROMPT,
  type MoodPrompt,
  type PromptContext,
  contextFor,
  dayPart,
  pickPrompt,
} from './mood-prompt'
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

// The prompt changes at most this often, however fast the skips come.
const PROMPT_MIN_GAP_MS = 8000
// A quiet spell before the line offers a nudge, and the pace it moves at
// after that.
const PROMPT_IDLE_MS = 25000
const PROMPT_IDLE_ROTATE_MS = 45000

// The line's words: plain at first, then following the visitor's skips and
// quiet spells (see mood-prompt.ts).
const useMoodPrompt = (skips: number): MoodPrompt => {
  const [prompt, setPrompt] = useState<MoodPrompt>(FIRST_PROMPT)
  const lastChangeRef = useRef(0)
  const change = useCallback((context: PromptContext) => {
    lastChangeRef.current = Date.now()
    setPrompt((previous) =>
      pickPrompt(context, dayPart(new Date().getHours()), previous),
    )
  }, [])

  useEffect(() => {
    if (!skips) return
    const wait = Math.max(
      0,
      lastChangeRef.current + PROMPT_MIN_GAP_MS - Date.now(),
    )
    const timer = window.setTimeout(
      () => change(contextFor(skips, false)),
      wait,
    )
    return () => window.clearTimeout(timer)
  }, [skips, change])

  // biome-ignore lint/correctness/useExhaustiveDependencies: a skip restarts the quiet spell
  useEffect(() => {
    let rotate = 0
    const timer = window.setTimeout(() => {
      change('idle')
      rotate = window.setInterval(() => change('time'), PROMPT_IDLE_ROTATE_MS)
    }, PROMPT_IDLE_MS)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(rotate)
    }
  }, [skips, change])

  return prompt
}

type MoodLineProps = OpenProps & {
  // Shuffles since the visitor last opened the moods.
  skips: number
}

// The line above the dock on Home.
export const MoodLine = ({ onOpen, skips }: MoodLineProps) => {
  const prompt = useMoodPrompt(skips)
  return (
    <div className='mood-line'>
      <span className='mood-line-text mood-swap' key={prompt.lead}>
        {prompt.lead}
      </span>
      <button type='button' className='mood-line-button' onClick={onOpen}>
        <Palette />
        <span className='mood-swap' key={prompt.cta}>
          {prompt.cta}
        </span>
        <ArrowRight aria-hidden='true' />
      </button>
    </div>
  )
}

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
