import { CloudSun, Moon, Sun, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  DYNAMIC_PRIVACY,
  DYNAMIC_TIP,
  type Sky,
  type ThemePref,
  skyLine,
} from '../../../utils/dynamic-weather'
import { cn } from '../../../utils/tw'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip'

// The one-time hint under Appearance, the first time the menu opens, saying
// what Dynamic is. Like the other first-open tips it is a courtesy: storage
// that is missing or blocked just means it may show again.
const HINT_SEEN_KEY = 'wtw:dynamic-theme-hint:v1'

// Seen once it was dismissed, Dynamic was chosen, or the menu was closed after
// it had been on screen a moment (a remount does not use it up).
const HINT_SEEN_AFTER_MS = 1500

export const hasSeenDynamicHint = () => {
  try {
    return window.localStorage.getItem(HINT_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

const markDynamicHintSeen = () => {
  try {
    window.localStorage.setItem(HINT_SEEN_KEY, '1')
  } catch {
    // Private mode or blocked storage: nothing to remember it with.
  }
}

export type DynamicHint = {
  visible: boolean
  dismiss: () => void
}

export const useDynamicHint = (pref: ThemePref): DynamicHint => {
  const [seen, setSeen] = useState(hasSeenDynamicHint)
  const visible = !seen && pref !== 'dynamic'
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  const dismiss = useCallback(() => {
    markDynamicHintSeen()
    setSeen(true)
  }, [])

  // Choosing Dynamic answers the hint.
  useEffect(() => {
    if (pref === 'dynamic') dismiss()
  }, [pref, dismiss])

  useEffect(() => {
    if (!visible) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      dismiss()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [visible, dismiss])

  useEffect(() => {
    const openedAt = Date.now()
    return () => {
      if (!visibleRef.current) return
      if (Date.now() - openedAt >= HINT_SEEN_AFTER_MS) markDynamicHintSeen()
    }
  }, [])

  return { visible, dismiss }
}

const OPTIONS = ['dark', 'light', 'dynamic'] as const

const LABELS: Record<ThemePref, string> = {
  dark: 'Dark',
  light: 'Light',
  dynamic: 'Dynamic',
}

const OptionIcon = ({ option }: { option: ThemePref }) =>
  option === 'dark' ? (
    <Moon aria-hidden='true' />
  ) : option === 'light' ? (
    <Sun aria-hidden='true' />
  ) : (
    <CloudSun aria-hidden='true' />
  )

// Dark, Light, or Dynamic: light by day and dark by night where you are, with
// rain or snow when it is happening nearby. Under the switch, Dynamic says
// where the location comes from; before it is chosen, a one-time hint says
// what it is.
export const AppearanceSetting = ({
  pref,
  sky,
  hint,
  onChange,
}: {
  pref: ThemePref
  sky: Sky
  hint: DynamicHint
  onChange: (pref: ThemePref) => void
}) => {
  const noteId = useId()
  const dynamic = pref === 'dynamic'
  const showNote = dynamic || hint.visible
  return (
    <fieldset
      className='warp-about-setting is-wrap'
      aria-describedby={showNote ? noteId : undefined}
    >
      <legend>Appearance</legend>
      <TooltipProvider delayDuration={300}>
        <div className='warp-theme-switch'>
          {OPTIONS.map((option) => {
            const button = (
              <button
                type='button'
                key={option}
                aria-pressed={pref === option}
                className={cn(pref === option && 'is-active')}
                onClick={() => onChange(option)}
              >
                <OptionIcon option={option} />
                {LABELS[option]}
              </button>
            )
            if (option !== 'dynamic') return button
            return (
              <Tooltip key={option}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent
                  className='warp-details-tip warp-theme-tip'
                  side='top'
                  sideOffset={8}
                >
                  <span>{DYNAMIC_TIP}</span>
                  <span>{DYNAMIC_PRIVACY}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
      {showNote ? (
        <div
          id={noteId}
          className={cn('warp-setting-note', dynamic && 'is-live')}
        >
          {dynamic ? (
            <>
              <p className='warp-setting-note-line' aria-live='polite'>
                {skyLine(sky)}
              </p>
              <p>{DYNAMIC_PRIVACY}</p>
            </>
          ) : (
            <>
              <p>{DYNAMIC_TIP}</p>
              <p>{DYNAMIC_PRIVACY}</p>
              <button
                type='button'
                className='warp-setting-note-close'
                aria-label='Dismiss tip: Dynamic theme'
                onClick={hint.dismiss}
              >
                <X aria-hidden='true' />
              </button>
            </>
          )}
        </div>
      ) : null}
    </fieldset>
  )
}
