// English titles for films whose title isn't English, shown on request.
//
// The catalogue only carries one title per film, so this uses the browser's
// own on-device Translator and Language Detector APIs where they exist
// (Chrome and Edge). Nothing is sent to a server, nothing runs until the
// reader turns it on, and where the APIs are missing the control stays
// hidden. Results are cached for the session.

type LanguageDetectorLike = {
  detect: (
    text: string,
  ) => Promise<{ detectedLanguage: string; confidence: number }[]>
}
type TranslatorLike = { translate: (text: string) => Promise<string> }

type TranslationGlobals = {
  Translator?: {
    availability: (options: {
      sourceLanguage: string
      targetLanguage: string
    }) => Promise<string>
    create: (options: {
      sourceLanguage: string
      targetLanguage: string
    }) => Promise<TranslatorLike>
  }
  LanguageDetector?: {
    create: () => Promise<LanguageDetectorLike>
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

const languageCache = new Map<string, string | null>()
let detectorPromise: Promise<LanguageDetectorLike | null> | null = null

const getDetector = () => {
  detectorPromise ??= (async () => {
    try {
      return (await api().LanguageDetector?.create()) ?? null
    } catch {
      return null
    }
  })()
  return detectorPromise
}

// The title's language as a BCP 47 code, or null if it can't tell. Titles are
// short, so a low-confidence guess counts as "unknown".
export const detectTitleLanguage = async (title: string) => {
  if (languageCache.has(title)) return languageCache.get(title) ?? null
  let language: string | null = null
  try {
    const detector = await getDetector()
    const [best] = (await detector?.detect(title)) ?? []
    if (best && best.confidence >= MIN_CONFIDENCE) {
      language = best.detectedLanguage
    }
  } catch {
    language = null
  }
  if (languageCache.size > 400) languageCache.clear()
  languageCache.set(title, language)
  return language
}

const translationCache = new Map<string, string | null>()
const translators = new Map<string, Promise<TranslatorLike | null>>()

const getTranslator = (sourceLanguage: string) => {
  let pending = translators.get(sourceLanguage)
  if (!pending) {
    pending = (async () => {
      try {
        const Translator = api().Translator
        if (!Translator) return null
        const options = { sourceLanguage, targetLanguage: 'en' }
        if ((await Translator.availability(options)) === 'unavailable') {
          return null
        }
        return await Translator.create(options)
      } catch {
        return null
      }
    })()
    translators.set(sourceLanguage, pending)
  }
  return pending
}

// The English title, or null if it is already English or can't be translated.
// Must be called from a user gesture the first time for a language: the
// browser may need to download its translation pack.
export const translateTitleToEnglish = async (
  title: string,
  knownLanguage?: string | null,
) => {
  if (translationCache.has(title)) return translationCache.get(title) ?? null
  let result: string | null = null
  try {
    const language = knownLanguage ?? (await detectTitleLanguage(title))
    if (language && language !== 'en') {
      const translator = await getTranslator(language)
      const translated = (await translator?.translate(title))?.trim()
      if (translated && translated.toLowerCase() !== title.toLowerCase()) {
        result = translated
      }
    }
  } catch {
    result = null
  }
  if (translationCache.size > 400) translationCache.clear()
  translationCache.set(title, result)
  return result
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
