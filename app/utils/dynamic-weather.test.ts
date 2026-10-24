import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clockIsDay,
  clockSky,
  fetchSky,
  parseSky,
  parseThemePref,
  readSkyOverride,
  readStoredSky,
  resolveDynamic,
  resolveTheme,
  skyLine,
  writeStoredSky,
} from './dynamic-weather'

const at = (hour: number, minute = 0) => new Date(2026, 9, 20, hour, minute)

const reply = (status: number, body?: unknown) =>
  vi.fn(
    async () => new Response(body ? JSON.stringify(body) : null, { status }),
  ) as unknown as typeof fetch

describe('theme preference', () => {
  it('keeps known choices and falls back to dark for anything else', () => {
    expect(parseThemePref('dynamic')).toBe('dynamic')
    expect(parseThemePref('light')).toBe('light')
    expect(parseThemePref('dark')).toBe('dark')
    expect(parseThemePref('sepia')).toBe('dark')
    expect(parseThemePref(null)).toBe('dark')
    expect(parseThemePref(undefined)).toBe('dark')
  })
})

describe('clock fallback', () => {
  it('counts 07:00 to 19:00 as day', () => {
    expect(clockIsDay(at(6, 59))).toBe(false)
    expect(clockIsDay(at(7, 0))).toBe(true)
    expect(clockIsDay(at(12))).toBe(true)
    expect(clockIsDay(at(18, 59))).toBe(true)
    expect(clockIsDay(at(19, 0))).toBe(false)
    expect(clockIsDay(at(0))).toBe(false)
  })

  it('is always clear weather', () => {
    expect(clockSky(at(12))).toEqual({ isDay: true, weather: 'clear' })
    expect(clockSky(at(23))).toEqual({ isDay: false, weather: 'clear' })
  })
})

describe('theme resolution', () => {
  it('maps day to the light theme and night to the dark one', () => {
    expect(resolveDynamic({ isDay: true, weather: 'clear' })).toEqual({
      theme: 'light',
      effect: null,
    })
    expect(resolveDynamic({ isDay: false, weather: 'clear' })).toEqual({
      theme: 'dark',
      effect: null,
    })
  })

  it('adds rain or snow as an effect, by day or night', () => {
    expect(resolveDynamic({ isDay: true, weather: 'rain' })).toEqual({
      theme: 'light',
      effect: 'rain',
    })
    expect(resolveDynamic({ isDay: false, weather: 'snow' })).toEqual({
      theme: 'dark',
      effect: 'snow',
    })
  })

  it('ignores the sky unless the theme is dynamic', () => {
    const night = { isDay: false, weather: 'snow' } as const
    expect(resolveTheme('light', night)).toBe('light')
    expect(resolveTheme('dark', { isDay: true, weather: 'clear' })).toBe('dark')
    expect(resolveTheme('dynamic', night)).toBe('dark')
    expect(resolveTheme('dynamic', { isDay: true, weather: 'rain' })).toBe(
      'light',
    )
  })
})

describe('sky parsing', () => {
  it('accepts only the server shape', () => {
    expect(parseSky({ isDay: true, weather: 'rain' })).toEqual({
      isDay: true,
      weather: 'rain',
    })
    expect(parseSky({ isDay: 1, weather: 'rain' })).toBeNull()
    expect(parseSky({ isDay: true, weather: 'fog' })).toBeNull()
    expect(parseSky(null)).toBeNull()
    expect(parseSky('rain')).toBeNull()
  })
})

describe('fetchSky', () => {
  it('returns the server sky', async () => {
    const fetchImpl = reply(200, { isDay: false, weather: 'snow' })
    expect(await fetchSky(fetchImpl)).toEqual({
      isDay: false,
      weather: 'snow',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/weather',
      expect.objectContaining({ credentials: 'omit' }),
    )
  })

  it('returns null on an empty answer, an error, a bad body or no network', async () => {
    expect(await fetchSky(reply(204))).toBeNull()
    expect(await fetchSky(reply(502))).toBeNull()
    expect(await fetchSky(reply(200, { nope: true }))).toBeNull()
    const offline = vi.fn(async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch
    expect(await fetchSky(offline)).toBeNull()
  })
})

describe('dev override', () => {
  it('does nothing outside development', () => {
    expect(readSkyOverride('?weather=rain&daytime=night', false)).toBeNull()
  })

  it('pins the sky from the query', () => {
    expect(readSkyOverride('?weather=snow&daytime=night', true)).toEqual({
      isDay: false,
      weather: 'snow',
    })
    expect(readSkyOverride('?weather=rain&daytime=day', true)).toEqual({
      isDay: true,
      weather: 'rain',
    })
  })

  it('lets either value stand alone', () => {
    expect(readSkyOverride('?daytime=day', true, at(23))).toEqual({
      isDay: true,
      weather: 'clear',
    })
    expect(readSkyOverride('?weather=rain', true, at(23))).toEqual({
      isDay: false,
      weather: 'rain',
    })
    expect(readSkyOverride('?other=1', true)).toBeNull()
  })
})

describe('stored sky', () => {
  afterEach(() => window.localStorage.clear())

  it('keeps only the result, and only for an hour', () => {
    writeStoredSky({ isDay: true, weather: 'rain' }, 1000)
    expect(window.localStorage.getItem('wtw:dynamic-sky')).toBe(
      JSON.stringify({ at: 1000, sky: { isDay: true, weather: 'rain' } }),
    )
    expect(readStoredSky(1000 + 60_000)).toEqual({
      isDay: true,
      weather: 'rain',
    })
    expect(readStoredSky(1000 + 61 * 60_000)).toBeNull()
  })

  it('ignores a corrupt entry', () => {
    window.localStorage.setItem('wtw:dynamic-sky', '{oops')
    expect(readStoredSky()).toBeNull()
  })
})

describe('contextual line', () => {
  it('follows the sky', () => {
    expect(skyLine({ isDay: false, weather: 'clear' })).toBe('cozy night?')
    expect(skyLine({ isDay: true, weather: 'clear' })).toBe('bright out there')
    expect(skyLine({ isDay: true, weather: 'rain' })).toBe(
      'is it raining outside?',
    )
    expect(skyLine({ isDay: false, weather: 'snow' })).toBe(
      'it might be snowing...',
    )
  })
})
