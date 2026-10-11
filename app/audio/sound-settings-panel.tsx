import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { cn } from '../utils/tw'
import { playCue, unlockAudio } from './sound-engine'
import {
  SOUND_CATEGORIES,
  SOUND_CATEGORY_LABELS,
  type SoundSettings,
  soundStore,
} from './sound-settings'

export const useSoundSettings = (): SoundSettings =>
  useSyncExternalStore(soundStore.subscribe, soundStore.get, soundStore.get)

const OnOff = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) => (
  <fieldset className='warp-about-setting'>
    <legend>{label}</legend>
    <div className='warp-theme-switch'>
      {([true, false] as const).map((option) => (
        <button
          type='button'
          key={String(option)}
          aria-pressed={value === option}
          className={cn(value === option && 'is-active')}
          onClick={() => onChange(option)}
        >
          {option ? (
            <Volume2 aria-hidden='true' />
          ) : (
            <VolumeX aria-hidden='true' />
          )}
          {option ? 'On' : 'Off'}
        </button>
      ))}
    </div>
  </fieldset>
)

// Everything about sound: the master switch, volume, the Easter egg sounds
// (which have their own switch because they are on by default) and, once the
// master is on, one chip per category.
export const SoundSettingsPanel = ({
  categories = true,
}: {
  // The compact drawer leaves the per-category chips to the full page.
  categories?: boolean
}) => {
  const settings = useSoundSettings()
  const previewTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(previewTimer.current), [])

  const preview = (cue: Parameters<typeof playCue>[0]) => {
    window.clearTimeout(previewTimer.current)
    previewTimer.current = window.setTimeout(() => playCue(cue), 140)
  }

  return (
    <div className='warp-sound-settings'>
      <OnOff
        label='Sound'
        value={settings.enabled}
        onChange={(enabled) => {
          unlockAudio()
          soundStore.patch({ enabled })
          if (enabled) preview('confirm')
        }}
      />
      {settings.enabled ? (
        <>
          <fieldset className='warp-about-setting'>
            <legend>Volume</legend>
            <input
              className='warp-volume'
              type='range'
              min={0}
              max={100}
              step={1}
              value={Math.round(settings.volume * 100)}
              aria-label='Volume'
              style={
                { '--volume': `${Math.round(settings.volume * 100)}%` } as never
              }
              onChange={(event) => {
                unlockAudio()
                soundStore.patch({ volume: Number(event.target.value) / 100 })
                preview('confirm')
              }}
            />
          </fieldset>
          {categories ? (
            <fieldset className='warp-about-setting is-wrap'>
              <legend>Plays on</legend>
              <div className='warp-sound-chips'>
                {SOUND_CATEGORIES.map((category) => (
                  <button
                    type='button'
                    key={category}
                    aria-pressed={settings.categories[category]}
                    className={cn(settings.categories[category] && 'is-active')}
                    onClick={() =>
                      soundStore.setCategory(
                        category,
                        !settings.categories[category],
                      )
                    }
                  >
                    {SOUND_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
        </>
      ) : null}
      <OnOff
        label='Easter egg sounds'
        value={settings.eggs}
        onChange={(eggs) => {
          unlockAudio()
          soundStore.patch({ eggs })
        }}
      />
    </div>
  )
}

// A quiet "Sound off" / "Sound on" link under the loading card, so the choice
// is made before the site is ready. Off by default: only the Easter egg
// sounds play until it is turned on.
export const LoaderSoundToggle = () => {
  const settings = useSoundSettings()
  return (
    <button
      type='button'
      className='warp-preloader-sound'
      aria-pressed={settings.enabled}
      title={
        settings.enabled
          ? 'Turn interface sounds off'
          : 'Interface sounds are off. Easter egg sounds stay on.'
      }
      onClick={() => {
        unlockAudio()
        soundStore.patch({ enabled: !settings.enabled })
        if (!settings.enabled) {
          window.setTimeout(() => playCue('confirm'), 140)
        }
      }}
    >
      Sound {settings.enabled ? 'on' : 'off'}
    </button>
  )
}
