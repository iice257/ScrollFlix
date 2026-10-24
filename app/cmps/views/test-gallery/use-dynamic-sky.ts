import { useEffect, useState } from 'react'
import {
  SKY_REFRESH_MS,
  type Sky,
  type ThemePref,
  clockSky,
  fetchSky,
  readSkyOverride,
  readStoredSky,
  writeStoredSky,
} from '../../../utils/dynamic-weather'

const sameSky = (a: Sky, b: Sky) =>
  a.isDay === b.isDay && a.weather === b.weather

// Pinned sky in development (?weather= and ?daytime=), else the last answer
// from the server, else the device clock.
const initialSky = (): Sky =>
  readSkyOverride(window.location.search, import.meta.env.DEV) ??
  readStoredSky() ??
  clockSky(new Date())

// The sky for the Dynamic theme. It asks the server once on load, then every
// 15 minutes while the page is visible, and does nothing at all (no request,
// no timer) for any other theme. If the server cannot say, the device clock
// decides day or night and the weather is clear.
export const useDynamicSky = (pref: ThemePref): Sky => {
  const [sky, setSky] = useState<Sky>(initialSky)
  const enabled = pref === 'dynamic'

  useEffect(() => {
    if (!enabled) return
    const pinned = readSkyOverride(window.location.search, import.meta.env.DEV)
    if (pinned) {
      setSky((current) => (sameSky(current, pinned) ? current : pinned))
      return
    }

    const controller = new AbortController()
    let timer = 0
    let lastAt = 0

    const apply = (next: Sky) =>
      setSky((current) => (sameSky(current, next) ? current : next))

    const refresh = async () => {
      lastAt = Date.now()
      const fromServer = await fetchSky(fetch, controller.signal)
      if (controller.signal.aborted) return
      if (fromServer) writeStoredSky(fromServer)
      apply(fromServer ?? clockSky(new Date()))
    }

    const schedule = () => {
      window.clearTimeout(timer)
      timer = 0
      if (document.hidden) return
      const wait = Math.max(0, lastAt + SKY_REFRESH_MS - Date.now())
      timer = window.setTimeout(() => {
        void refresh().then(schedule)
      }, wait)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer)
        timer = 0
        return
      }
      // Back on the page after a while away: catch up, then keep the cadence.
      if (Date.now() - lastAt >= SKY_REFRESH_MS) void refresh().then(schedule)
      else schedule()
    }

    void refresh().then(schedule)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled])

  return sky
}
