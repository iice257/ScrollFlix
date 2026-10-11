// Weather: a very fast flick of the globe kicks up rain or snow that streaks
// across the screen for a moment. This file is only the rules; the drawing is
// in weather-layer.tsx.

export type WeatherKind = 'rain' | 'snow'

// The globe has to be turning at least this fast (rad/s) from a drag, not from
// a shuffle. Ordinary drags and the motion blur threshold sit well below it.
export const FLICK_WEATHER_SPEED = 5.4

export type StormPlan = {
  // How long it keeps going after this flick, in ms.
  durationMs: number
  // 0..1: how many particles and how strongly they are drawn.
  intensity: number
}

export const stormPlan = (speed: number): StormPlan => {
  const over = Math.max(0, speed - FLICK_WEATHER_SPEED)
  const level = Math.min(1, over / 2.5)
  return {
    durationMs: Math.round(1800 + level * 1700),
    intensity: 0.55 + level * 0.45,
  }
}

export const pickWeatherKind = (random: () => number): WeatherKind =>
  random() < 0.55 ? 'rain' : 'snow'

// How many particles are alive at an intensity, out of the pool.
export const liveCount = (pool: number, intensity: number) =>
  Math.max(0, Math.min(pool, Math.round(pool * intensity)))
