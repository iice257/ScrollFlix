import { describe, expect, it, vi } from 'vitest'
import {
  handleWeather,
  placeFromHeaders,
  readCurrent,
  roundCoordinate,
  weatherFromCode,
} from '../../api/weather'

const geo = (latitude: string, longitude: string) =>
  new Headers({
    'x-vercel-ip-latitude': latitude,
    'x-vercel-ip-longitude': longitude,
    'x-vercel-ip-timezone': 'Europe/London',
  })

const upstream = (current: Record<string, unknown>, status = 200) =>
  vi.fn(
    async (_url: URL | string, _init?: RequestInit) =>
      new Response(JSON.stringify({ current }), { status }),
  )

const asFetch = (fn: unknown) => fn as typeof fetch

describe('WMO weather codes', () => {
  it('maps drizzle, rain, freezing rain and showers to rain', () => {
    for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82])
      expect(weatherFromCode(code)).toBe('rain')
  })

  it('maps snow, snow grains and snow showers to snow', () => {
    for (const code of [71, 73, 75, 77, 85, 86])
      expect(weatherFromCode(code)).toBe('snow')
  })

  it('counts thunderstorms as rain', () => {
    for (const code of [95, 96, 99]) expect(weatherFromCode(code)).toBe('rain')
  })

  it('leaves everything else clear', () => {
    for (const code of [0, 1, 2, 3, 45, 48, 70, 78, 83, 84, 87])
      expect(weatherFromCode(code)).toBe('clear')
  })
})

describe('readCurrent', () => {
  it('reads day and the code', () => {
    expect(readCurrent({ is_day: 1, weather_code: 63 })).toEqual({
      isDay: true,
      weather: 'rain',
    })
    expect(readCurrent({ is_day: 0, weather_code: 0 })).toEqual({
      isDay: false,
      weather: 'clear',
    })
  })

  it('lets measured snow or rain settle codes that say nothing', () => {
    expect(readCurrent({ is_day: 0, weather_code: 45, snowfall: 0.2 })).toEqual(
      { isDay: false, weather: 'snow' },
    )
    expect(readCurrent({ is_day: 1, weather_code: 3, rain: 0.4 })).toEqual({
      isDay: true,
      weather: 'rain',
    })
  })

  it('rejects an answer without is_day', () => {
    expect(readCurrent({ weather_code: 0 })).toBeNull()
  })
})

describe('place from headers', () => {
  it('rounds to one decimal, about a city', () => {
    expect(roundCoordinate(51.50735)).toBe(51.5)
    expect(roundCoordinate(-0.12776)).toBe(-0.1)
    expect(placeFromHeaders(geo('51.50735', '-0.12776'))).toEqual({
      latitude: 51.5,
      longitude: -0.1,
    })
  })

  it('is null when the headers are missing or nonsense', () => {
    expect(placeFromHeaders(new Headers())).toBeNull()
    expect(placeFromHeaders(geo('abc', '1'))).toBeNull()
    expect(placeFromHeaders(geo('91', '1'))).toBeNull()
    expect(placeFromHeaders(geo('1', '181'))).toBeNull()
  })
})

describe('handleWeather', () => {
  it('asks Open-Meteo about the rounded place and returns only isDay and weather', async () => {
    const fetchImpl = upstream({ is_day: 0, weather_code: 73 })
    const response = await handleWeather(
      geo('60.17332', '24.94102'),
      asFetch(fetchImpl),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ isDay: false, weather: 'snow' })
    const url = new URL(String(fetchImpl.mock.calls[0][0]))
    expect(url.origin).toBe('https://api.open-meteo.com')
    expect(url.searchParams.get('latitude')).toBe('60.2')
    expect(url.searchParams.get('longitude')).toBe('24.9')
    expect(url.searchParams.get('current')).toContain('weather_code')
  })

  it('is private to the caller: never shared-cached', async () => {
    const response = await handleWeather(
      geo('1', '1'),
      asFetch(upstream({ is_day: 1, weather_code: 0 })),
    )
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=600')
  })

  it('answers 204 without calling out when there is no location', async () => {
    const fetchImpl = upstream({ is_day: 1 })
    const response = await handleWeather(new Headers(), asFetch(fetchImpl))
    expect(response.status).toBe(204)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('answers 502, uncached, when Open-Meteo fails or sends rubbish', async () => {
    const failing = vi.fn(async () => {
      throw new Error('down')
    })
    for (const fetchImpl of [
      upstream({}, 500),
      upstream({ weather_code: 1 }),
      failing,
    ]) {
      const response = await handleWeather(geo('1', '1'), asFetch(fetchImpl))
      expect(response.status).toBe(502)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }
  })
})
