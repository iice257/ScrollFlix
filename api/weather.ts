// GET /api/weather: is it day where the visitor is, and is it raining or
// snowing. The place comes from Vercel's IP geolocation headers and is used
// only to ask Open-Meteo for the current conditions. Coordinates are rounded
// to about a city, are never logged or stored, and are not in the response,
// which carries only `{ isDay, weather }`.

export type Weather = 'clear' | 'rain' | 'snow'

export type WeatherReply = { isDay: boolean; weather: Weather }

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const UPSTREAM_TIMEOUT_MS = 4000

// One decimal place is about 11 km: a city, not a street.
export const roundCoordinate = (value: number) => Math.round(value * 10) / 10

// WMO weather codes. Only rain and snow are tracked; fog, cloud and the rest
// are deliberately "clear".
export const weatherFromCode = (code: number): Weather => {
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow'
  // Thunderstorms (95 to 99) come with rain.
  if (code >= 95 && code <= 99) return 'rain'
  return 'clear'
}

type Current = {
  is_day?: unknown
  weather_code?: unknown
  rain?: unknown
  snowfall?: unknown
}

const positive = (value: unknown) => typeof value === 'number' && value > 0

// The code decides; measured snow or rain only settles the codes that say
// nothing about precipitation (fog, overcast).
export const readCurrent = (current: Current): WeatherReply | null => {
  if (typeof current.is_day !== 'number') return null
  const code =
    typeof current.weather_code === 'number' ? current.weather_code : 0
  let weather = weatherFromCode(code)
  if (weather === 'clear') {
    if (positive(current.snowfall)) weather = 'snow'
    else if (positive(current.rain)) weather = 'rain'
  }
  return { isDay: current.is_day === 1, weather }
}

// Parses Vercel's geo headers into a rounded place, or null when they are
// missing (local development, or an IP with no known location).
export const placeFromHeaders = (headers: Headers) => {
  const latitude = Number(headers.get('x-vercel-ip-latitude'))
  const longitude = Number(headers.get('x-vercel-ip-longitude'))
  if (
    !headers.get('x-vercel-ip-latitude') ||
    !headers.get('x-vercel-ip-longitude') ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null
  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  }
}

const json = (body: WeatherReply, cacheControl: string) =>
  new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Depends on who is asking, so it must never sit in a shared cache.
      'Cache-Control': cacheControl,
    },
  })

const empty = (status: number) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })

export const handleWeather = async (
  headers: Headers,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> => {
  const place = placeFromHeaders(headers)
  // No place to ask about: the page falls back to the visitor's own clock.
  if (!place) return empty(204)
  const url = new URL(OPEN_METEO)
  url.searchParams.set('latitude', String(place.latitude))
  url.searchParams.set('longitude', String(place.longitude))
  url.searchParams.set('current', 'is_day,rain,snowfall,weather_code')
  url.searchParams.set('timezone', 'auto')
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!response.ok) return empty(502)
    const body = (await response.json()) as { current?: Current }
    const reply = body.current ? readCurrent(body.current) : null
    if (!reply) return empty(502)
    return json(reply, 'private, max-age=600')
  } catch {
    return empty(502)
  }
}

export function GET(request: Request) {
  return handleWeather(request.headers)
}
