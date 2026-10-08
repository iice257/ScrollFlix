import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SOUND_SETTINGS,
  LEGACY_EGG_SOUND_KEY,
  SOUND_STORAGE_KEY,
  isCategoryOn,
  parseSoundSettings,
  serializeSoundSettings,
  soundStore,
} from './sound-settings'

describe('sound settings', () => {
  beforeEach(() => {
    window.localStorage.clear()
    soundStore.resetForTests()
  })

  it('is off by default, except the Easter egg sounds', () => {
    const settings = parseSoundSettings(null)
    expect(settings.enabled).toBe(false)
    expect(settings.eggs).toBe(true)
    expect(isCategoryOn(settings, 'ui')).toBe(false)
  })

  it('round-trips through its serialised form', () => {
    const settings = {
      ...DEFAULT_SOUND_SETTINGS,
      enabled: true,
      volume: 0.3,
      categories: { ...DEFAULT_SOUND_SETTINGS.categories, globe: false },
    }
    expect(parseSoundSettings(serializeSoundSettings(settings))).toEqual(
      settings,
    )
  })

  it('falls back field by field on corrupted data', () => {
    expect(parseSoundSettings('not json')).toEqual(DEFAULT_SOUND_SETTINGS)
    const settings = parseSoundSettings(
      JSON.stringify({
        enabled: 'yes',
        volume: 7,
        eggs: false,
        categories: { ui: false, globe: 'no' },
      }),
    )
    expect(settings.enabled).toBe(false)
    expect(settings.volume).toBe(1)
    expect(settings.eggs).toBe(false)
    expect(settings.categories.ui).toBe(false)
    expect(settings.categories.globe).toBe(true)
  })

  it('carries over the old Easter egg switch', () => {
    expect(parseSoundSettings(null, '0').eggs).toBe(false)
    expect(parseSoundSettings(null, '1').eggs).toBe(true)
  })

  it('persists changes and notifies subscribers', () => {
    let calls = 0
    soundStore.subscribe(() => {
      calls += 1
    })
    soundStore.patch({ enabled: true })
    soundStore.setCategory('ui', false)
    expect(calls).toBe(2)
    const stored = parseSoundSettings(
      window.localStorage.getItem(SOUND_STORAGE_KEY),
    )
    expect(stored.enabled).toBe(true)
    expect(stored.categories.ui).toBe(false)
  })

  it('reads the legacy key on first load', () => {
    window.localStorage.setItem(LEGACY_EGG_SOUND_KEY, '0')
    soundStore.resetForTests()
    expect(soundStore.get().eggs).toBe(false)
  })

  it('gates a category on both the master switch and its own', () => {
    const on = { ...DEFAULT_SOUND_SETTINGS, enabled: true }
    expect(isCategoryOn(on, 'globe')).toBe(true)
    expect(
      isCategoryOn(
        { ...on, categories: { ...on.categories, globe: false } },
        'globe',
      ),
    ).toBe(false)
  })
})
