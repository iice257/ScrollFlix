// Turning the share artwork into things that can leave the page: a PNG, a
// short video clip recorded on the device, the native share sheet, a download
// and a link. Nothing is uploaded anywhere.

import { filmLinkId } from '../landing'
import { TIER_LABELS, type Tier } from '../shuffle-pro/shuffle-pro-logic'
import {
  type PreparedShare,
  SHARE_CLIP_SECONDS,
  SHARE_HEIGHT,
  SHARE_WIDTH,
  type ShareScene,
  type ShareSource,
  drawShare,
  drawShareFinal,
  prepareShare,
} from './share-art'

export const slugifyTitle = (title: string) =>
  title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'movie'

export const shareFileName = (
  title: string,
  tier: Tier | null,
  extension = 'png',
) => `scrollflix-${slugifyTitle(title)}${tier ? `-${tier}` : ''}.${extension}`

export const shareCaption = (tier: Tier) =>
  `✦ Shuffle Pro${tier === 'jade' ? ' Max' : ''} · ${TIER_LABELS[tier]}`

// A film's page: the app opens straight onto it.
export const shareLink = (movieId: string, base = window.location.href) => {
  const url = new URL(base)
  url.search = ''
  url.hash = ''
  url.searchParams.set('film', filmLinkId(movieId))
  return url.toString()
}

const loadPoster = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })

const loadFonts = async () => {
  try {
    await Promise.all([
      document.fonts?.load('950 52px "DM Sans"'),
      document.fonts?.load('900 64px "DM Sans"'),
      document.fonts?.load('850 24px "DM Sans"'),
      document.fonts?.load('700 32px "DM Sans"'),
    ])
  } catch {
    // Fall back to the system font.
  }
}

export type ShareInput = Omit<ShareScene, 'poster'> & { posterUrl: string }

const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png') =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type))

// Everything the sheet needs: the prepared artwork and a fresh poster. If the
// poster taints the canvas (no CORS), the artwork falls back to the path's
// colours in its place.
export const prepareShareArt = async (input: ShareInput) => {
  await loadFonts()
  const poster: ShareSource | null = await loadPoster(input.posterUrl)
  const scene: ShareScene = { ...input, poster }
  let prepared = prepareShare(scene)
  // Try one draw: a tainted canvas throws on read-back.
  const probe = document.createElement('canvas')
  probe.width = 8
  probe.height = 8
  try {
    const ctx = probe.getContext('2d')
    if (ctx && poster) {
      ctx.drawImage(poster, 0, 0, 8, 8)
      ctx.getImageData(0, 0, 1, 1)
    }
  } catch {
    prepared = prepareShare({ ...scene, poster: null })
  }
  return prepared
}

// The still image: the finished frame at full size.
export const renderShareImage = async (prepared: PreparedShare) => {
  const canvas = document.createElement('canvas')
  canvas.width = SHARE_WIDTH
  canvas.height = SHARE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  drawShareFinal(ctx, prepared)
  const blob = await canvasToBlob(canvas)
  canvas.width = 0
  if (!blob) throw new Error('Could not render the share image')
  return blob
}

// ------------------------------------------------------------------- clip

const CLIP_SCALE = 0.75
const CLIP_FPS = 30

const CLIP_MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

export const clipMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return null
  return (
    CLIP_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
  )
}

export const clipSupported = () =>
  clipMimeType() !== null &&
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function'

export const clipExtension = (mime: string) =>
  mime.startsWith('video/mp4') ? 'mp4' : 'webm'

// The next frame: animation frames when the page is being painted, with a
// timer as a backstop so a recording keeps moving when frames are paused.
const nextFrame = (callback: (now: number) => void) => {
  let done = false
  const run = () => {
    if (done) return
    done = true
    window.cancelAnimationFrame(raf)
    window.clearTimeout(timer)
    callback(performance.now())
  }
  const raf = window.requestAnimationFrame(run)
  const timer = window.setTimeout(run, 48)
  return () => {
    done = true
    window.cancelAnimationFrame(raf)
    window.clearTimeout(timer)
  }
}

// Records the artwork playing, in real time, to a video blob. Aborting stops
// the recorder, releases the stream and rejects; nothing is left running.
export const recordShareClip = (
  prepared: PreparedShare,
  options: {
    onProgress?: (fraction: number) => void
    signal?: AbortSignal
  } = {},
) =>
  new Promise<{ blob: Blob; mime: string }>((resolve, reject) => {
    const mime = clipMimeType()
    if (!mime || !clipSupported()) {
      reject(new Error('Clips are not supported in this browser'))
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(SHARE_WIDTH * CLIP_SCALE)
    canvas.height = Math.round(SHARE_HEIGHT * CLIP_SCALE)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas is unavailable'))
      return
    }
    const stream = canvas.captureStream(CLIP_FPS)
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000,
    })
    const chunks: Blob[] = []
    let cancelFrame: (() => void) | null = null
    let finished = false

    const cleanup = () => {
      finished = true
      cancelFrame?.()
      for (const track of stream.getTracks()) track.stop()
      canvas.width = 0
      options.signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      if (finished) return
      cleanup()
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        // Already stopped.
      }
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    options.signal?.addEventListener('abort', onAbort)
    if (options.signal?.aborted) {
      onAbort()
      return
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onerror = () => {
      if (finished) return
      cleanup()
      reject(new Error('Recording failed'))
    }
    recorder.onstop = () => {
      if (finished) return
      cleanup()
      const blob = new Blob(chunks, { type: mime })
      if (blob.size === 0) reject(new Error('The recording was empty'))
      else resolve({ blob, mime })
    }

    const startedAt = performance.now()
    recorder.start(250)
    const tick = (now: number) => {
      if (finished) return
      const t = (now - startedAt) / 1000
      ctx.setTransform(CLIP_SCALE, 0, 0, CLIP_SCALE, 0, 0)
      drawShare(ctx, prepared, Math.min(t, SHARE_CLIP_SECONDS))
      options.onProgress?.(Math.min(1, t / SHARE_CLIP_SECONDS))
      if (t >= SHARE_CLIP_SECONDS + 0.15) {
        // One last frame is already drawn; let the recorder flush.
        recorder.stop()
        return
      }
      cancelFrame = nextFrame(tick)
    }
    cancelFrame = nextFrame(tick)
  })

// ----------------------------------------------------------------- deliver

export type DeliverResult = 'shared' | 'downloaded' | 'cancelled'

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const canShareFile = (blob: Blob, fileName: string) => {
  try {
    const file = new File([blob], fileName, { type: blob.type })
    return Boolean(navigator.canShare?.({ files: [file] }))
  } catch {
    return false
  }
}

// Shares the file with the native sheet when files are supported, otherwise
// downloads it.
export const deliverShare = async (
  blob: Blob,
  fileName: string,
  title: string,
  url?: string,
): Promise<DeliverResult> => {
  const file = new File([blob], fileName, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, ...(url ? { url } : {}) })
      return 'shared'
    } catch (error) {
      // The user dismissing the sheet is not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
    }
  }
  downloadBlob(blob, fileName)
  return 'downloaded'
}

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
