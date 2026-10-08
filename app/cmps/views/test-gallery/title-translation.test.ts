import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  detectTitleLanguage,
  hasNonLatinLetters,
  resetTranslationCaches,
  translateTitleToEnglish,
  translationSupported,
} from './title-translation'

describe('hasNonLatinLetters', () => {
  it('flags titles in other alphabets', () => {
    expect(hasNonLatinLetters('Ο Θεός Αγαπάει το Χαβιάρι')).toBe(true)
    expect(hasNonLatinLetters('千と千尋の神隠し')).toBe(true)
    expect(hasNonLatinLetters('Бригада')).toBe(true)
  })

  it('leaves Latin titles, digits and punctuation alone', () => {
    expect(hasNonLatinLetters('Amélie')).toBe(false)
    expect(hasNonLatinLetters('Se7en')).toBe(false)
    expect(hasNonLatinLetters('Mission: Impossible - 2')).toBe(false)
  })
})

describe('translation support', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetTranslationCaches()
  })

  it('is unsupported without the browser APIs', () => {
    expect(translationSupported()).toBe(false)
  })

  it('detects a language and translates through the browser APIs', async () => {
    const translate = vi.fn(async () => 'Portraits In A Sea Of Lies')
    vi.stubGlobal('LanguageDetector', {
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'es', confidence: 0.92 }],
      }),
    })
    vi.stubGlobal('Translator', {
      availability: async () => 'available',
      create: async () => ({ translate }),
    })
    expect(translationSupported()).toBe(true)
    expect(await detectTitleLanguage('Retratos en un mar de mentiras')).toBe(
      'es',
    )
    expect(
      await translateTitleToEnglish('Retratos en un mar de mentiras'),
    ).toBe('Portraits In A Sea Of Lies')
    // The second call is served from the cache.
    await translateTitleToEnglish('Retratos en un mar de mentiras')
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it('returns null for a title that is already English', async () => {
    vi.stubGlobal('LanguageDetector', {
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'en', confidence: 0.99 }],
      }),
    })
    vi.stubGlobal('Translator', {
      availability: async () => 'available',
      create: async () => ({ translate: async () => 'x' }),
    })
    expect(await translateTitleToEnglish('The Social Network x')).toBeNull()
  })

  it('treats a low-confidence guess as unknown', async () => {
    vi.stubGlobal('LanguageDetector', {
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'fr', confidence: 0.2 }],
      }),
    })
    expect(await detectTitleLanguage('Zzz low confidence')).toBeNull()
  })
})
