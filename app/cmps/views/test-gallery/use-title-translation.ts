import { useCallback, useEffect, useState } from 'react'
import {
  detectTitleLanguage,
  hasNonLatinLetters,
  readTranslatePreference,
  translateTitleToEnglish,
  translationSupported,
  writeTranslatePreference,
} from './title-translation'

// State for the small translate button beside a film's title: whether it
// should show at all (the title isn't English and the browser can translate),
// whether it is on, and the English title once it is ready.
export const useTitleTranslation = (title: string) => {
  const [enabled, setEnabled] = useState(readTranslatePreference)
  const [language, setLanguage] = useState<string | null>(null)
  const [available, setAvailable] = useState(false)
  const [english, setEnglish] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Is this title worth offering a translation for?
  useEffect(() => {
    setAvailable(false)
    setLanguage(null)
    setEnglish(null)
    if (!translationSupported()) return
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
  }, [title])

  // Translate when it is on and offered.
  useEffect(() => {
    if (!enabled || !available) {
      setEnglish(null)
      return
    }
    let cancelled = false
    setBusy(true)
    void translateTitleToEnglish(title, language).then((result) => {
      if (cancelled) return
      setEnglish(result)
      setBusy(false)
    })
    return () => {
      cancelled = true
      setBusy(false)
    }
  }, [available, enabled, language, title])

  const toggle = useCallback(() => {
    setEnabled(!enabled)
    writeTranslatePreference(!enabled)
  }, [enabled])

  return { available, enabled, english, busy, toggle }
}
