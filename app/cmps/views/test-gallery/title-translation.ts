// English titles for films whose catalogue entry has no English title.
//
// Most films get theirs from the catalogue itself (the English title plus a
// quiet "Original title" line), which works on every phone. This is only the
// fallback for the rest: the browser's own on-device Translator and Language
// Detector APIs, where they exist (desktop Chrome and Edge). Nothing is sent
// to a server. The first use for a language may need a download, and the
// browser only allows that from a click, so the first call for a language
// must run inside the click handler. Where the APIs are missing the control
// stays hidden.

type LanguageDetectorLike = {
  detect: (
    text: string,
  ) => Promise<{ detectedLanguage: string; confidence: number }[]>
}
type TranslatorLike = { translate: (text: string) => Promise<string> }
type DownloadMonitor = {
  addEventListener: (
    type: 'downloadprogress',
    listener: (event: { loaded: number }) => void,
  ) => void
}
type CreateOptions = {
  monitor?: (monitor: DownloadMonitor) => void
}

type TranslationGlobals = {
  Translator?: {
    availability: (options: {
      sourceLanguage: string
      targetLanguage: string
    }) => Promise<string>
    create: (
      options: {
        sourceLanguage: string
        targetLanguage: string
      } & CreateOptions,
    ) => Promise<TranslatorLike>
  }
  LanguageDetector?: {
    availability?: () => Promise<string>
    create: (options?: CreateOptions) => Promise<LanguageDetectorLike>
  }
}

const api = () => globalThis as unknown as TranslationGlobals

export const translationSupported = () =>
  typeof globalThis !== 'undefined' &&
  Boolean(api().Translator) &&
  Boolean(api().LanguageDetector)

const LATIN = /\p{Script=Latin}/u

// True when the title has letters outside the Latin alphabet (Greek,
// Cyrillic, Arabic, Hebrew, Thai, CJK and so on): certainly not English.
export const hasNonLatinLetters = (title: string) => {
  for (const char of title) {
    if (/\p{L}/u.test(char) && !LATIN.test(char)) return true
  }
  return false
}

const MIN_CONFIDENCE = 0.6

export type TranslationOptions = {
  // True inside a click: downloads are allowed and the work starts at once.
  // Otherwise only what is already on the device is used.
  gesture?: boolean
  // 0..1 while a language pack downloads.
  onProgress?: (fraction: number) => void
}

const toMonitor =
  (onProgress?: (fraction: number) => void) => (monitor: DownloadMonitor) => {
    monitor.addEventListener('downloadprogress', (event) => {
      onProgress?.(Math.min(1, Math.max(0, event.loaded)))
    })
  }

const languageCache = new Map<string, string | null>()
let detectorPromise: Promise<LanguageDetectorLike | null> | null = null

// The detector, or null. Outside a click it is only created when the browser
// says its model is already on the device. A failure is not remembered, so
// the next click gets a fresh try.
const getDetector = (options: TranslationOptions) => {
  if (detectorPromise) return detectorPromise
  const create = async () => {
    const Detector = api().LanguageDetector
    if (!Detector) return null
    if (!options.gesture && Detector.availability) {
      if ((await Detector.availability()) !== 'available') return null
    }
    return Detector.create({ monitor: toMonitor(options.onProgress) })
  }
  const pending = create().catch(() => null)
  detectorPromise = pending
  void pending.then((detector) => {
    if (!detector && detectorPromise === pending) detectorPromise = null
  })
  return pending
}

// The title's language as a BCP 47 code, or null if it can't tell. Titles are
// short, so a low-confidence guess counts as "unknown".
export const detectTitleLanguage = async (
  title: string,
  options: TranslationOptions = {},
) => {
  if (languageCache.has(title)) return languageCache.get(title) ?? null
  let language: string | null = null
  let answered = false
  try {
    const detector = await getDetector(options)
    if (detector) {
      const [best] = await detector.detect(title)
      answered = true
      if (best && best.confidence >= MIN_CONFIDENCE) {
        language = best.detectedLanguage
      }
    }
  } catch {
    language = null
  }
  // Only a real answer is remembered, not "the detector wasn't ready".
  if (answered) {
    if (languageCache.size > 400) languageCache.clear()
    languageCache.set(title, language)
  }
  return language
}

const translationCache = new Map<string, string>()
const translators = new Map<string, Promise<TranslatorLike | null>>()

const getTranslator = (sourceLanguage: string, options: TranslationOptions) => {
  const existing = translators.get(sourceLanguage)
  if (existing) return existing
  const create = async () => {
    const Translator = api().Translator
    if (!Translator) return null
    const pair = { sourceLanguage, targetLanguage: 'en' }
    // In a click, create straight away so the click's permission is still
    // valid for a download. Elsewhere, only use a pack that is already here.
    if (
      !options.gesture &&
      (await Translator.availability(pair)) !== 'available'
    ) {
      return null
    }
    return Translator.create({
      ...pair,
      monitor: toMonitor(options.onProgress),
    })
  }
  const pending = create().catch(() => null)
  translators.set(sourceLanguage, pending)
  // A translator that could not be made is not remembered.
  void pending.then((translator) => {
    if (!translator && translators.get(sourceLanguage) === pending) {
      translators.delete(sourceLanguage)
    }
  })
  return pending
}

export type TranslationResult =
  // The English title.
  | { status: 'translated'; text: string }
  // The title is already English, so there is nothing to show.
  | { status: 'english' }
  // The browser could not do it (no pack, offline, or not allowed here).
  | { status: 'failed' }

// Pass `gesture: true` when this is started from a click: that is the only
// time the browser may download a translation pack.
export const translateTitle = async (
  title: string,
  knownLanguage?: string | null,
  options: TranslationOptions = {},
): Promise<TranslationResult> => {
  const cached = translationCache.get(title)
  if (cached) return { status: 'translated', text: cached }
  try {
    const language =
      knownLanguage ?? (await detectTitleLanguage(title, options))
    if (!language) return { status: 'failed' }
    if (language === 'en') return { status: 'english' }
    const translator = await getTranslator(language, options)
    if (!translator) return { status: 'failed' }
    const translated = (await translator.translate(title))?.trim()
    if (!translated) return { status: 'failed' }
    if (translated.toLowerCase() === title.toLowerCase()) {
      return { status: 'english' }
    }
    if (translationCache.size > 400) translationCache.clear()
    translationCache.set(title, translated)
    return { status: 'translated', text: translated }
  } catch {
    return { status: 'failed' }
  }
}

// The English title, or null if it is already English or can't be translated.
export const translateTitleToEnglish = async (
  title: string,
  knownLanguage?: string | null,
  options: TranslationOptions = {},
) => {
  const result = await translateTitle(title, knownLanguage, options)
  return result.status === 'translated' ? result.text : null
}

// Tests start from a clean slate.
export const resetTranslationCaches = () => {
  languageCache.clear()
  translationCache.clear()
  translators.clear()
  detectorPromise = null
}

export const TRANSLATE_TITLES_STORAGE_KEY = 'wtw:translate-titles'

export const readTranslatePreference = () => {
  try {
    return window.localStorage.getItem(TRANSLATE_TITLES_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const writeTranslatePreference = (enabled: boolean) => {
  try {
    window.localStorage.setItem(
      TRANSLATE_TITLES_STORAGE_KEY,
      enabled ? '1' : '0',
    )
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
}
