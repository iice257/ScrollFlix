import { CloudSun, Moon, Sun, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
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

// The one-time tip by the Dynamic option, the first time the menu opens, saying
// what Dynamic is. Like the other first-open tips it is a courtesy: storage
// that is missing or blocked just means it may show again.
const HINT_SEEN_KEY = 'wtw:dynamic-theme-hint:v1'

// Seen once it was dismissed, Dynamic was chosen, or the menu was closed after
// it had been on screen a moment (a remount does not use it up).
const HINT_SEEN_AFTER_MS = 1500

const TIP_SETTLE_MS = 450

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

// `blocked` holds the hint back while another first-open tip is on screen, so
// two tips never stack on the same part of the menu.
export const useDynamicHint = (
  pref: ThemePref,
  blocked: boolean,
): DynamicHint => {
  const [seen, setSeen] = useState(hasSeenDynamicHint)
  const visible = !seen && !blocked && pref !== 'dynamic'
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
// rain or snow when it is happening nearby. One tip says what Dynamic is: it
// shows on the first open of the menu and on hover or focus of the option, and
// has a close button; tapping outside closes it too. Once Dynamic is on, a
// note under the switch gives the sky's one-liner.
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
  const dynamic = pref === 'dynamic'
  const [hovered, setHovered] = useState(false)
  // Let the menu finish sliding in before the first-open tip is placed.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), TIP_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [])
  const open = hovered || (hint.visible && settled)
  const close = () => {
    setHovered(false)
    hint.dismiss()
  }
  return (
    <fieldset className='warp-about-setting is-wrap'>
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
              <Tooltip key={option} open={open} onOpenChange={setHovered}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent
                  className='warp-details-tip warp-theme-tip overflow-visible pr-9'
                  side='top'
                  sideOffset={8}
                  aria-label={DYNAMIC_TIP}
                  // Esc belongs to the menu behind the tip, not to the tip.
                  onEscapeKeyDown={(event) => event.preventDefault()}
                  onPointerDownOutside={hint.dismiss}
                >
                  <p>{DYNAMIC_TIP}</p>
                  <button
                    type='button'
                    className='warp-theme-tip-close'
                    aria-label='Close'
                    onClick={close}
                  >
                    <X aria-hidden='true' />
                  </button>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
      {dynamic ? (
        <div className='warp-setting-note'>
          <p className='warp-setting-note-line' aria-live='polite'>
            {skyLine(sky)}
          </p>
        </div>
      ) : null}
    </fieldset>
  )
}
