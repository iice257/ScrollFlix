import {
  Check,
  Download,
  Image as ImageIcon,
  Link2,
  RotateCcw,
  Share2,
  Video,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../../../utils/tw'
import type { RecapScene } from './recap-art'
import { SHARE_CLIP_SECONDS, SHARE_HEIGHT, SHARE_WIDTH } from './share-art'
import {
  type ShareInput,
  type ShareRenderable,
  clipExtension,
  clipSupported,
  copyText,
  deliverShare,
  downloadBlob,
  prepareRecapArt,
  prepareShareArt,
  recordShareClip,
  renderShareImage,
  shareFileName,
} from './share-output'

type ShareSheetProps = {
  // A film's pick, or the recap of a person's runs. One of the two.
  input?: ShareInput
  recap?: RecapScene
  link: string
  onClose: () => void
}

type Format = 'image' | 'clip'
type Phase = 'loading' | 'ready' | 'recording' | 'clip-ready' | 'error'

const PREVIEW_SCALE = 0.5
// The preview holds the finished frame this long before it loops.
const PREVIEW_HOLD_SECONDS = 1.6

// The share sheet: a live preview of the artwork, a choice of image or clip,
// and Share / Save / Copy link. Everything is made on this device.
const ShareSheet = ({ input, recap, link, onClose }: ShareSheetProps) => {
  const subject = recap ? 'My Shuffle Pro run' : (input?.title ?? '')
  const heading = recap ? 'Share your run' : 'Share this pick'
  const fileName = (extension?: string) =>
    recap
      ? `scrollflix-my-run.${extension ?? 'png'}`
      : shareFileName(subject, input?.tier ?? null, extension)
  const [format, setFormat] = useState<Format>('image')
  const [phase, setPhase] = useState<Phase>('loading')
  const [progress, setProgress] = useState(0)
  const [clip, setClip] = useState<{
    blob: Blob
    mime: string
    url: string
  } | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const preparedRef = useRef<ShareRenderable | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const recordAbortRef = useRef<AbortController | null>(null)
  const noticeTimerRef = useRef(0)
  const canClip = clipSupported()

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2400)
  }, [])

  // Prepare the artwork once: fonts, the poster, and the cached layers.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the sheet is made for one thing, and closes if that changes
  useEffect(() => {
    let cancelled = false
    const art = recap
      ? prepareRecapArt(recap)
      : input
        ? prepareShareArt(input)
        : Promise.reject(new Error('Nothing to share'))
    void art
      .then((prepared) => {
        if (cancelled) return
        preparedRef.current = prepared
        setPhase('ready')
      })
      .catch(() => {
        if (!cancelled) setPhase('error')
      })
    return () => {
      cancelled = true
      preparedRef.current = null
    }
  }, [])

  // Space and Enter inside the sheet act on its buttons, never on the page's
  // shortcuts (Space shuffles) behind it.
  const sheetRef = useRef<HTMLDialogElement | null>(null)
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const stop = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
    }
    sheet.addEventListener('keydown', stop)
    return () => sheet.removeEventListener('keydown', stop)
  }, [])

  // Free everything when the sheet goes away: an unfinished recording, the
  // clip's object URL and the timers.
  useEffect(
    () => () => {
      recordAbortRef.current?.abort()
      window.clearTimeout(noticeTimerRef.current)
    },
    [],
  )
  useEffect(
    () => () => {
      if (clip) URL.revokeObjectURL(clip.url)
    },
    [clip],
  )

  // The preview canvas: the finished frame for an image, the animation looping
  // for a clip. The loop only runs while the clip preview is on screen.
  useEffect(() => {
    const canvas = canvasRef.current
    const prepared = preparedRef.current
    if (!canvas || !prepared || phase === 'loading' || phase === 'error') return
    if (format === 'clip' && phase === 'clip-ready') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0)

    if (format === 'image') {
      prepared.draw(ctx, SHARE_CLIP_SECONDS)
      return
    }
    let frame = 0
    const start = performance.now()
    const loop = (now: number) => {
      const cycle = SHARE_CLIP_SECONDS + PREVIEW_HOLD_SECONDS
      const t = ((now - start) / 1000) % cycle
      prepared.draw(ctx, Math.min(t, SHARE_CLIP_SECONDS))
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(frame)
  }, [format, phase])

  const chooseFormat = (next: Format) => {
    if (next === format) return
    // Leaving the clip tab mid-recording stops it.
    recordAbortRef.current?.abort()
    recordAbortRef.current = null
    setFormat(next)
    setProgress(0)
    if (phase === 'recording') setPhase('ready')
  }

  const startRecording = async () => {
    const prepared = preparedRef.current
    if (!prepared || phase === 'recording') return
    recordAbortRef.current?.abort()
    const controller = new AbortController()
    recordAbortRef.current = controller
    setClip(null)
    setProgress(0)
    setPhase('recording')
    try {
      const result = await recordShareClip(prepared, {
        signal: controller.signal,
        onProgress: setProgress,
      })
      if (controller.signal.aborted) return
      setClip({ ...result, url: URL.createObjectURL(result.blob) })
      setPhase('clip-ready')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPhase('ready')
      flash('The clip could not be recorded here.')
    } finally {
      if (recordAbortRef.current === controller) recordAbortRef.current = null
    }
  }

  const getFile = async (): Promise<{ blob: Blob; name: string } | null> => {
    const prepared = preparedRef.current
    if (!prepared) return null
    if (format === 'clip') {
      if (!clip) return null
      return {
        blob: clip.blob,
        name: fileName(clipExtension(clip.mime)),
      }
    }
    return {
      blob: await renderShareImage(prepared),
      name: fileName(),
    }
  }

  const share = async () => {
    if (busy) return
    setBusy(true)
    try {
      const file = await getFile()
      if (!file) return
      const result = await deliverShare(file.blob, file.name, subject, link)
      if (result === 'downloaded') flash('Saved to your downloads.')
    } catch {
      flash('Something went wrong. Try saving it instead.')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const file = await getFile()
      if (!file) return
      downloadBlob(file.blob, file.name)
      flash('Saved to your downloads.')
    } catch {
      flash('Could not save it.')
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    flash((await copyText(link)) ? 'Link copied.' : 'Could not copy the link.')
  }

  const needsClip = format === 'clip' && !clip
  const ready = phase !== 'loading' && phase !== 'error'

  return (
    <section className='warp-share-layer' aria-label={heading}>
      <button
        type='button'
        className='warp-share-backdrop'
        aria-label='Close share'
        onClick={onClose}
      />
      <dialog ref={sheetRef} className='warp-share-card' aria-modal='true' open>
        <header className='warp-share-heading'>
          <div>
            <h2>{heading}</h2>
            <p>{subject}</p>
          </div>
          <button
            type='button'
            className='warp-about-drawer-close'
            aria-label='Close share'
            onClick={onClose}
          >
            <X aria-hidden='true' />
          </button>
        </header>

        <div className='warp-share-body'>
          <div className='warp-share-stage' data-phase={phase}>
            {format === 'clip' && clip ? (
              <video
                key={clip.url}
                className='warp-share-video'
                src={clip.url}
                autoPlay
                loop
                muted
                playsInline
                controls={false}
              />
            ) : (
              <canvas
                ref={canvasRef}
                className='warp-share-canvas'
                width={Math.round(SHARE_WIDTH * PREVIEW_SCALE)}
                height={Math.round(SHARE_HEIGHT * PREVIEW_SCALE)}
                aria-label='Preview of the share card'
              />
            )}
            {phase === 'loading' ? (
              <span className='warp-share-overlay'>Preparing your card…</span>
            ) : null}
            {phase === 'error' ? (
              <span className='warp-share-overlay'>
                This card could not be made.
              </span>
            ) : null}
            {phase === 'recording' ? (
              <span className='warp-share-overlay is-recording'>
                <span className='warp-share-rec' aria-hidden='true' />
                Recording{' '}
                {Math.min(
                  SHARE_CLIP_SECONDS,
                  Math.ceil(progress * SHARE_CLIP_SECONDS),
                )}
                s / {SHARE_CLIP_SECONDS}s
                <i
                  style={
                    {
                      '--share-progress': `${Math.round(progress * 100)}%`,
                    } as never
                  }
                />
              </span>
            ) : null}
          </div>

          <div className='warp-share-options'>
            <fieldset className='warp-share-formats'>
              <legend className='sr-only'>Format</legend>
              <button
                type='button'
                aria-pressed={format === 'image'}
                className={cn(format === 'image' && 'is-active')}
                // biome-ignore lint/a11y/noAutofocus: focus moves into the sheet so Space and Esc act on it
                autoFocus
                onClick={() => chooseFormat('image')}
              >
                <ImageIcon aria-hidden='true' />
                Image
              </button>
              <button
                type='button'
                aria-pressed={format === 'clip'}
                className={cn(format === 'clip' && 'is-active')}
                disabled={!canClip}
                title={
                  canClip
                    ? undefined
                    : 'Clips are not supported in this browser'
                }
                onClick={() => chooseFormat('clip')}
              >
                <Video aria-hidden='true' />
                Clip
              </button>
            </fieldset>

            <p className='warp-share-about'>
              {format === 'image'
                ? 'A poster-style card, 1080 × 1350, ready for stories and posts.'
                : `A ${SHARE_CLIP_SECONDS} second animated card, recorded on your device in real time.`}
            </p>

            <div className='warp-share-actions'>
              {needsClip ? (
                <button
                  type='button'
                  className='warp-share-primary'
                  disabled={!ready || phase === 'recording'}
                  onClick={() => void startRecording()}
                >
                  <Video aria-hidden='true' />
                  {phase === 'recording' ? 'Recording…' : 'Create clip'}
                </button>
              ) : (
                <>
                  <button
                    type='button'
                    className='warp-share-primary'
                    disabled={!ready || busy}
                    onClick={() => void share()}
                  >
                    <Share2 aria-hidden='true' />
                    Share
                  </button>
                  <button
                    type='button'
                    className='warp-share-secondary'
                    disabled={!ready || busy}
                    onClick={() => void save()}
                  >
                    <Download aria-hidden='true' />
                    Save
                  </button>
                </>
              )}
              {format === 'clip' && clip ? (
                <button
                  type='button'
                  className='warp-share-secondary'
                  aria-label='Record the clip again'
                  title='Record again'
                  onClick={() => void startRecording()}
                >
                  <RotateCcw aria-hidden='true' />
                </button>
              ) : null}
            </div>

            <button
              type='button'
              className='warp-share-link'
              onClick={() => void copyLink()}
            >
              <Link2 aria-hidden='true' />
              {recap ? 'Copy link to ScrollFlix' : 'Copy link to this film'}
            </button>

            <output className='warp-share-note'>
              {notice || (
                <>
                  <Check aria-hidden='true' /> Made on your device. Nothing is
                  uploaded.
                </>
              )}
            </output>
          </div>
        </div>
      </dialog>
    </section>
  )
}

export default ShareSheet
