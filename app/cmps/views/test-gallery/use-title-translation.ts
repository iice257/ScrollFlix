import { useCallback, useEffect, useRef, useState } from 'react'
import {
  detectTitleLanguage,
  hasNonLatinLetters,
  readTranslatePreference,
  translateTitle,
  translationSupported,
  writeTranslatePreference,
} from './title-translation'

// How long "Couldn't translate this title here" stays up.
export const TRANSLATE_FAILURE_MS = 4000

// State for the small translate button beside a film's title: whether it
// should show at all, whether it is on, and the English title once it is
// ready.
//
// The button is the fallback for titles the catalogue has no English version
// of, so it never shows when `hasOriginalTitle` is true. The first translation
// for a language is started inside the click handler, because the browser only
// downloads a language pack when a click allows it. Later titles translate on
// their own once the pack is on the device.
export const useTitleTranslation = (
  title: string,
  { hasOriginalTitle = false }: { hasOriginalTitle?: boolean } = {},
) => {
  const [enabled, setEnabled] = useState(readTranslatePreference)
  const [language, setLanguage] = useState<string | null>(null)
  const [available, setAvailable] = useState(false)
  const [english, setEnglish] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 0..1 while a language pack downloads, otherwise null.
  const [progress, setProgress] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  // Which title the latest request belongs to, so a slow answer for a film
  // that is no longer open is dropped.
  const requestId = useRef(0)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  // Is this title worth offering a translation for? Looking at it never
  // downloads anything.
  useEffect(() => {
    requestId.current += 1
    setAvailable(false)
    setLanguage(null)
    setEnglish(null)
    setBusy(false)
    setProgress(null)
    setFailed(false)
    if (hasOriginalTitle || !translationSupported()) return
    let cancelled = false
    void (async () => {
      const detected = await detectTitleLanguage(title)
      if (cancelled) return
      setLanguage(detected)
      // Other alphabets are certainly not English; Latin titles need the
      // detector to say so.
      setAvailable(detected ? detected !== 'en' : hasNonLatinLetters(title))
    })()
    return () => {
      cancelled = true
    }
  }, [hasOriginalTitle, title])

  // With the preference on, translate quietly when a pack is already here.
  // If it needs a download, the button stays offered and the click does it.
  useEffect(() => {
    if (!available || !enabledRef.current) return
    const id = requestId.current
    void translateTitle(title, language).then((result) => {
      if (id !== requestId.current) return
      if (result.status === 'translated') setEnglish(result.text)
    })
  }, [available, language, title])

  useEffect(() => {
    if (!failed) return
    const timer = window.setTimeout(
      () => setFailed(false),
      TRANSLATE_FAILURE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [failed])

  // Runs in the click handler. Nothing is awaited before the browser call.
  const toggle = useCallback(() => {
    if (enabled && english) {
      setEnabled(false)
      writeTranslatePreference(false)
      return
    }
    setEnabled(true)
    writeTranslatePreference(true)
    setFailed(false)
    if (english) return
    const id = requestId.current
    setBusy(true)
    void translateTitle(title, language, {
      gesture: true,
      onProgress: (fraction) => {
        if (id === requestId.current) setProgress(fraction)
      },
    }).then((result) => {
      if (id !== requestId.current) return
      setBusy(false)
      setProgress(null)
      if (result.status === 'translated') setEnglish(result.text)
      else if (result.status === 'english') setAvailable(false)
      else {
        // Back to off, so the button does not look switched on.
        setEnabled(false)
        writeTranslatePreference(false)
        setFailed(true)
      }
    })
  }, [enabled, english, language, title])

  return { available, enabled, english, busy, progress, failed, toggle }
}
