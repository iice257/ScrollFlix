// Sound settings: one small versioned object in localStorage.
//
// Everything is off by default except the Easter egg sounds: the master
// switch gates the interface sounds (ticks, panels, cards), while `eggs`
// gates the Shuffle Pro whoosh, chime and landing on their own. Nothing
// touches Web Audio from here; this module is plain data.

export const SOUND_STORAGE_KEY = 'scrollflix.sound.v1'
// The pre-v1 switch for the whoosh alone ('0' = off, anything else = on).
export const LEGACY_EGG_SOUND_KEY = 'wtw:sound:egg'

export const SOUND_CATEGORIES = ['ui', 'globe', 'shuffle', 'details'] as const
export type SoundCategory = (typeof SOUND_CATEGORIES)[number]

export const SOUND_CATEGORY_LABELS: Record<SoundCategory, string> = {
  ui: 'Buttons and panels',
  globe: 'Globe ticks',
  shuffle: 'Shuffle',
  details: 'Movie cards',
}

export type SoundSettings = {
  // Interface sounds. Off until someone turns them on.
  enabled: boolean
  // 0..1, applied to everything including the Easter egg sounds.
  volume: number
  // The Shuffle Pro whoosh, chime and landing. On by default.
  eggs: boolean
  categories: Record<SoundCategory, boolean>
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: false,
  volume: 0.6,
  eggs: true,
  categories: { ui: true, globe: true, shuffle: true, details: true },
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// Reads whatever is stored, never throws, and falls back per field.
export const parseSoundSettings = (
  raw: string | null,
  legacyEgg: string | null = null,
): SoundSettings => {
  const base: SoundSettings = {
    ...DEFAULT_SOUND_SETTINGS,
    categories: { ...DEFAULT_SOUND_SETTINGS.categories },
  }
  if (legacyEgg === '0') base.eggs = false
  if (!raw) return base
  try {
    const parsed = JSON.parse(raw) as Partial<SoundSettings> & { v?: number }
    if (!parsed || typeof parsed !== 'object') return base
    if (typeof parsed.enabled === 'boolean') base.enabled = parsed.enabled
    if (typeof parsed.eggs === 'boolean') base.eggs = parsed.eggs
    if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
      base.volume = clamp01(parsed.volume)
    }
    const categories = parsed.categories as
      | Partial<Record<SoundCategory, unknown>>
      | undefined
    if (categories && typeof categories === 'object') {
      for (const category of SOUND_CATEGORIES) {
        const value = categories[category]
        if (typeof value === 'boolean') base.categories[category] = value
      }
    }
    return base
  } catch {
    return base
  }
}

export const serializeSoundSettings = (settings: SoundSettings) =>
  JSON.stringify({ v: 1, ...settings })

const listeners = new Set<() => void>()
let current: SoundSettings | null = null

const readStored = (): SoundSettings => {
  try {
    return parseSoundSettings(
      window.localStorage.getItem(SOUND_STORAGE_KEY),
      window.localStorage.getItem(LEGACY_EGG_SOUND_KEY),
    )
  } catch {
    return parseSoundSettings(null)
  }
}

export const soundStore = {
  get: (): SoundSettings => {
    current ??= readStored()
    return current
  },
  patch: (change: Partial<Omit<SoundSettings, 'categories'>>) => {
    soundStore.replace({ ...soundStore.get(), ...change })
  },
  setCategory: (category: SoundCategory, enabled: boolean) => {
    const settings = soundStore.get()
    soundStore.replace({
      ...settings,
      categories: { ...settings.categories, [category]: enabled },
    })
  },
  replace: (next: SoundSettings) => {
    current = next
    try {
      window.localStorage.setItem(
        SOUND_STORAGE_KEY,
        serializeSoundSettings(next),
      )
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
    for (const listener of listeners) listener()
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  // Tests start from a clean slate.
  resetForTests: () => {
    current = null
    listeners.clear()
  },
}

// Whether a sound of this category may play right now.
export const isCategoryOn = (
  settings: SoundSettings,
  category: SoundCategory,
) => settings.enabled && settings.categories[category]
