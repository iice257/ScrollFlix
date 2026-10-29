import { CloudSun, Moon, Sun } from 'lucide-react'
import {
  DYNAMIC_TIP,
  type Sky,
  type ThemePref,
  skyLine,
} from '../../../utils/dynamic-weather'
import { cn } from '../../../utils/tw'

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
// rain or snow when it is happening nearby. A line under the switch says what
// Dynamic is, and once it is on gives the sky's one-liner instead.
export const AppearanceSetting = ({
  pref,
  sky,
  onChange,
}: {
  pref: ThemePref
  sky: Sky
  onChange: (pref: ThemePref) => void
}) => (
  <fieldset className='warp-about-setting is-wrap'>
    <legend>Appearance</legend>
    <div className='warp-theme-switch'>
      {OPTIONS.map((option) => (
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
      ))}
    </div>
    <div className='warp-setting-note'>
      {pref === 'dynamic' ? (
        <p className='warp-setting-note-line' aria-live='polite'>
          {skyLine(sky)}
        </p>
      ) : (
        <p>{DYNAMIC_TIP}</p>
      )}
    </div>
  </fieldset>
)
