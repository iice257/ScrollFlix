import { ExternalLink, X } from 'lucide-react'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { soundStore } from '../../../../audio/sound-settings'
import {
  FATAL_PLAYER_ERRORS,
  READY_TIMEOUT_MS,
  markTrailerDead,
  nextKey,
  readDeadTrailers,
  youtubeSearchUrl,
} from './trailer-logic'

// The slice of the YouTube IFrame API this sheet uses.
type YouTubePlayer = { destroy: () => void; playVideo: () => void }
type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      host: string
      playerVars: Record<string, number>
      events: {
        onReady: () => void
        onError: (event: { data: number }) => void
      }
    },
  ) => YouTubePlayer
}
declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

const IFRAME_API_URL = 'https://www.youtube.com/iframe_api'

// The IFrame API script loads the first time a trailer opens, never before,
// and once. A failed load is not remembered, so the next open tries again.
let apiPromise: Promise<YouTubeApi> | null = null
const loadYouTubeApi = (): Promise<YouTubeApi> => {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube API missing'))
    }
    const script = document.createElement('script')
    script.src = IFRAME_API_URL
    script.async = true
    script.onerror = () => reject(new Error('YouTube API blocked'))
    document.head.append(script)
  }).catch((error: unknown) => {
    apiPromise = null
    throw error
  })
  return apiPromise
}

// Drag the handle down this far to close the sheet on a phone.
const DRAG_CLOSE_PX = 110

type TrailerSheetProps = {
  keys: string[]
  title: string
  year?: string
  onClose: () => void
}

// The trailer player: a full-height sheet on phones, a centred 16:9 player on
// desktop. It tries each key in turn and, when none plays, says so and points
// to YouTube.
const TrailerSheet = ({ keys, title, year, onClose }: TrailerSheetProps) => {
  const sheetRef = useRef<HTMLDialogElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState<ReadonlySet<string>>(readDeadTrailers)
  const [ready, setReady] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)
  const key = nextKey(keys, failed)

  const giveUp = useCallback((deadKey: string) => {
    markTrailerDead(deadKey)
    setFailed((current) => new Set(current).add(deadKey))
  }, [])

  // Focus goes into the sheet and comes back to the button that opened it.
  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  // App sounds stay quiet while a trailer plays, then come back as they were.
  useEffect(() => {
    const before = soundStore.get()
    soundStore.patch({ enabled: false, eggs: false })
    let restored = false
    const restore = () => {
      if (restored) return
      restored = true
      soundStore.patch({ enabled: before.enabled, eggs: before.eggs })
    }
    window.addEventListener('pagehide', restore)
    return () => {
      window.removeEventListener('pagehide', restore)
      restore()
    }
  }, [])

  // Escape closes this sheet before the card behind it; Tab stays inside.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const sheet = sheetRef.current
      if (!sheet) return
      const stops = [
        ...sheet.querySelectorAll<HTMLElement>('button, a[href], iframe'),
      ]
      if (!stops.length) return
      const first = stops[0]
      const last = stops[stops.length - 1]
      const active = document.activeElement
      if (!sheet.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  // One player per key. A fatal error, or no "ready" within ten seconds,
  // marks the key dead and moves on to the next one.
  useEffect(() => {
    const stage = stageRef.current
    if (!key || !stage) return
    let cancelled = false
    let player: YouTubePlayer | null = null
    const mount = document.createElement('div')
    stage.append(mount)
    setReady(false)
    const timer = window.setTimeout(() => {
      if (!cancelled) giveUp(key)
    }, READY_TIMEOUT_MS)
    loadYouTubeApi().then(
      (YT) => {
        if (cancelled) return
        player = new YT.Player(mount, {
          videoId: key,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            autoplay: 1,
          },
          events: {
            onReady: () => {
              if (cancelled) return
              window.clearTimeout(timer)
              setReady(true)
              player?.playVideo()
            },
            onError: (event) => {
              if (cancelled || !FATAL_PLAYER_ERRORS.has(event.data)) return
              window.clearTimeout(timer)
              giveUp(key)
            },
          },
        })
      },
      () => {
        // The player script itself could not load: no key can play.
        if (cancelled) return
        window.clearTimeout(timer)
        setFailed(new Set(keys))
      },
    )
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      try {
        player?.destroy()
      } catch {
        // The player may already be gone.
      }
      mount.remove()
    }
  }, [key, keys, giveUp])

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragStart.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStart.current === null) return
    setDragY(Math.max(0, event.clientY - dragStart.current))
  }
  const endDrag = () => {
    if (dragStart.current === null) return
    dragStart.current = null
    if (dragY > DRAG_CLOSE_PX) onClose()
    else setDragY(0)
  }

  const heading = year && /^\d{4}$/.test(year) ? `${title} (${year})` : title

  return (
    <section className='warp-trailer-layer' aria-label={`Trailer: ${heading}`}>
      <button
        type='button'
        className='warp-trailer-backdrop'
        aria-label='Close trailer'
        tabIndex={-1}
        onClick={onClose}
      />
      <dialog
        ref={sheetRef}
        className='warp-trailer-card'
        aria-modal='true'
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        open
      >
        <button
          type='button'
          className='warp-trailer-grip'
          aria-label='Drag down to close the trailer'
          tabIndex={-1}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className='warp-trailer-handle' />
        </button>
        <header className='warp-trailer-heading'>
          <div>
            <h2>Trailer</h2>
            <p>{heading}</p>
          </div>
          <button
            ref={closeRef}
            type='button'
            className='warp-about-drawer-close'
            aria-label='Close trailer'
            onClick={onClose}
          >
            <X aria-hidden='true' />
          </button>
        </header>
        {key ? (
          <div className={`warp-trailer-stage${ready ? ' is-ready' : ''}`}>
            <div ref={stageRef} className='warp-trailer-player' />
            <span className='warp-trailer-loading' aria-hidden='true' />
          </div>
        ) : (
          <div className='warp-trailer-stage is-failed' role='alert'>
            <p>This trailer can't play here.</p>
            <a
              className='warp-trailer-youtube'
              href={youtubeSearchUrl(title, year)}
              target='_blank'
              rel='noopener noreferrer'
              onClick={onClose}
            >
              <ExternalLink aria-hidden='true' size={15} strokeWidth={2.6} />
              Watch on YouTube
            </a>
          </div>
        )}
      </dialog>
    </section>
  )
}

export default TrailerSheet
