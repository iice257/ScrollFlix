import { WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

// How long the connection must stay down before the notice appears: a brief
// drop (a lift, a tunnel) should not flash a banner.
export const OFFLINE_NOTICE_AFTER_MS = 10_000

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine

// True once the device has reported no connection for `afterMs` straight. Back
// online clears it at once.
export const useOfflineFor = (afterMs = OFFLINE_NOTICE_AFTER_MS) => {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    let timer = 0
    const sync = () => {
      window.clearTimeout(timer)
      if (isOnline()) setOffline(false)
      else timer = window.setTimeout(() => setOffline(true), afterMs)
    }
    sync()
    window.addEventListener('offline', sync)
    window.addEventListener('online', sync)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('offline', sync)
      window.removeEventListener('online', sync)
    }
  }, [afterMs])
  return offline
}

// The share of the globe's posters that are showing a real picture (read from
// the globe's canvas), or null before there is a globe.
export const readGlobeLoadedShare = (root: ParentNode = document) => {
  const canvas = root.querySelector<HTMLCanvasElement>(
    'canvas[data-pictures-total]',
  )
  const total = Number(canvas?.dataset.picturesTotal)
  if (!canvas || !Number.isFinite(total) || total <= 0) return null
  const loaded = Number(canvas.dataset.picturesLoaded ?? 0)
  return Math.max(0, Math.min(100, Math.floor((loaded / total) * 100)))
}

export const describeGlobeLoad = (share: number | null) =>
  share === null
    ? 'Globe ready'
    : share >= 100
      ? 'Globe fully loaded'
      : `Globe ${share}% loaded`

type OfflineNoticeProps = {
  view: 'globe' | 'index'
  onReturnToGallery: () => void
}

// One notice in one place for both views. The globe keeps working with what it
// has; the index needs the network, so it says so and offers the way back.
export const OfflineNotice = ({
  view,
  onReturnToGallery,
}: OfflineNoticeProps) => {
  const [share, setShare] = useState<number | null>(() =>
    readGlobeLoadedShare(),
  )
  useEffect(() => {
    if (view !== 'globe') return
    setShare(readGlobeLoadedShare())
    const timer = window.setInterval(
      () => setShare(readGlobeLoadedShare()),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [view])

  return (
    <output className='warp-offline' data-view={view}>
      <WifiOff aria-hidden='true' />
      {view === 'globe' ? (
        <span>
          <strong>Offline mode</strong>
          <small>{describeGlobeLoad(share)}</small>
        </span>
      ) : (
        <span>
          <strong>Index doesn't work offline</strong>
          <small>
            Reconnect, or{' '}
            <button type='button' onClick={onReturnToGallery}>
              return to gallery
            </button>
          </small>
        </span>
      )}
    </output>
  )
}
