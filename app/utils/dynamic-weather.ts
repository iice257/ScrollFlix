// The "Dynamic" theme: light by day and dark by night where the visitor is,
// with rain or snow in the air while it is happening nearby. The place comes
// from the visitor's IP, on the server (api/weather.ts), rounded to a city and
// never stored. Nothing here asks the browser for location. Only rain and snow
// are tracked; every other kind of weather is "clear".

export type SkyWeather = 'clear' | 'rain' | 'snow'

export type Sky = { isDay: boolean; weather: SkyWeather }

export type ThemePref = 'dark' | 'light' | 'dynamic'

export const THEME_PREFS: readonly ThemePref[] = ['dark', 'light', 'dynamic']

// Anything stored that is not a known choice (an old build, a hand edit)
// falls back to the default dark theme.
export const parseThemePref = (value: unknown): ThemePref =>
  value === 'light' || value === 'dynamic' ? value : 'dark'

// Without a server answer, day is 07:00 to 19:00 on the device's clock.
export const DAY_STARTS_HOUR = 7
export const DAY_ENDS_HOUR = 19

export const clockIsDay = (now: Date) => {
  const hour = now.getHours()
  return hour >= DAY_STARTS_HOUR && hour < DAY_ENDS_HOUR
}

export const clockSky = (now: Date): Sky => ({
  isDay: clockIsDay(now),
  weather: 'clear',
})

// What the page does with a sky: the theme tokens it already has, plus the
// ambient layer. Day is the light theme, night the dark one.
export const resolveDynamic = (sky: Sky) => ({
  theme: sky.isDay ? ('light' as const) : ('dark' as const),
  effect: sky.weather === 'clear' ? null : sky.weather,
})

export const resolveTheme = (pref: ThemePref, sky: Sky) =>
  pref === 'dynamic' ? resolveDynamic(sky).theme : pref

// Accepts only the exact shape the server sends.
export const parseSky = (value: unknown): Sky | null => {
  if (!value || typeof value !== 'object') return null
  const { isDay, weather } = value as Record<string, unknown>
  if (typeof isDay !== 'boolean') return null
  if (weather !== 'clear' && weather !== 'rain' && weather !== 'snow')
    return null
  return { isDay, weather }
}

export const SKY_ENDPOINT = '/api/weather'
export const SKY_REFRESH_MS = 15 * 60 * 1000

// Asks the server for the sky near the visitor. Any failure, an empty answer
// (no location known, as in local development) or a bad body returns null and
// the caller uses the clock.
export const fetchSky = async (
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Sky | null> => {
  try {
    const response = await fetchImpl(SKY_ENDPOINT, {
      signal,
      credentials: 'omit',
      cache: 'no-cache',
    })
    if (response.status !== 200) return null
    return parseSky(await response.json())
  } catch {
    return null
  }
}

// Development only: ?weather=rain|snow|clear and ?daytime=day|night pin the
// sky for testing. Either one alone is enough; the other follows the clock.
export const readSkyOverride = (
  search: string,
  isDev: boolean,
  now: Date = new Date(),
): Sky | null => {
  if (!isDev) return null
  const params = new URLSearchParams(search)
  const weather = params.get('weather')
  const daytime = params.get('daytime')
  if (weather === null && daytime === null) return null
  const base = clockSky(now)
  return {
    isDay: daytime === 'day' ? true : daytime === 'night' ? false : base.isDay,
    weather:
      weather === 'rain' || weather === 'snow' || weather === 'clear'
        ? weather
        : 'clear',
  }
}

// Only the result is remembered (never a place), so a repeat visit paints the
// right theme at once instead of flashing the wrong one.
const SKY_STORAGE_KEY = 'wtw:dynamic-sky'
const SKY_STORED_FOR_MS = 60 * 60 * 1000

export const readStoredSky = (now: number = Date.now()): Sky | null => {
  try {
    const raw = window.localStorage.getItem(SKY_STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as { at?: unknown; sky?: unknown }
    if (typeof stored.at !== 'number' || now - stored.at > SKY_STORED_FOR_MS)
      return null
    return parseSky(stored.sky)
  } catch {
    return null
  }
}

export const writeStoredSky = (sky: Sky, now: number = Date.now()) => {
  try {
    window.localStorage.setItem(
      SKY_STORAGE_KEY,
      JSON.stringify({ at: now, sky }),
    )
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
}

// Copy. The neutral line is the tooltip; the privacy line says where the
// location comes from; the contextual line follows the sky.
export const DYNAMIC_TIP =
  'Follows your daylight and weather. Light by day, dark by night, with rain or snow when it is happening near you.'

export const DYNAMIC_PRIVACY =
  'Location comes from your IP, rounded to your city, and is never stored.'

export const skyLine = (sky: Sky) => {
  if (sky.weather === 'rain') return 'is it raining outside?'
  if (sky.weather === 'snow') return 'it might be snowing...'
  return sky.isDay ? 'bright out there' : 'cozy night?'
}
