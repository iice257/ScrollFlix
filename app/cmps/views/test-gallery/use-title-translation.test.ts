import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTranslationCaches } from './title-translation'
import {
  TRANSLATE_FAILURE_MS,
  useTitleTranslation,
} from './use-title-translation'

const GREEK = 'Ο Θεός Αγαπάει το Χαβιάρι'

type Created = { options: unknown; gesture: boolean }

// Browser APIs where the translation pack must be downloaded, which the real
// browser only allows from a click.
const stubApis = ({
  availability = 'downloadable',
  failCreate = false,
}: { availability?: string; failCreate?: boolean } = {}) => {
  const created: Created[] = []
  const translate = vi.fn(async () => 'God Loves Caviar')
  vi.stubGlobal('LanguageDetector', {
    availability: async () => 'available',
    create: async () => ({
      detect: async () => [{ detectedLanguage: 'el', confidence: 0.95 }],
    }),
  })
  vi.stubGlobal('Translator', {
    availability: async () => availability,
    create: vi.fn(async (options: unknown) => {
      created.push({ options, gesture: clicking })
      if (failCreate) throw new Error('NotAllowedError')
      return { translate }
    }),
  })
  return { created, translate }
}

// True only while a click handler is running, standing in for the browser's
// "user activation" check.
let clicking = false
const click = (fn: () => void) => {
  clicking = true
  try {
    fn()
  } finally {
    clicking = false
  }
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  resetTranslationCaches()
})

describe('useTitleTranslation', () => {
  it('stays hidden when the browser has no translation APIs', async () => {
    const { result } = renderHook(() => useTitleTranslation(GREEK))
    await act(async () => {})
    expect(result.current.available).toBe(false)
  })

  it('stays hidden when the catalogue has an original title', async () => {
    stubApis()
    const { result } = renderHook(() =>
      useTitleTranslation(GREEK, { hasOriginalTitle: true }),
    )
    await act(async () => {})
    expect(result.current.available).toBe(false)
  })

  it('is offered for a non-English title and does not translate on its own', async () => {
    const { created } = stubApis()
    const { result } = renderHook(() => useTitleTranslation(GREEK))
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(result.current.english).toBeNull()
    expect(created).toHaveLength(0)
  })

  it('creates the translator inside the click', async () => {
    const { created } = stubApis()
    const { result } = renderHook(() => useTitleTranslation(GREEK))
    await waitFor(() => expect(result.current.available).toBe(true))

    act(() => click(result.current.toggle))
    await waitFor(() => expect(result.current.english).toBe('God Loves Caviar'))
    expect(created).toHaveLength(1)
    expect(created[0].gesture).toBe(true)
    expect(result.current.enabled).toBe(true)
    expect(result.current.failed).toBe(false)
  })

  it('says so, then clears the message, when translating fails', async () => {
    stubApis({ failCreate: true })
    const { result } = renderHook(() => useTitleTranslation(GREEK))
    await waitFor(() => expect(result.current.available).toBe(true))

    // Catch the timer that is meant to clear the message.
    const realSetTimeout = window.setTimeout.bind(window)
    let clear: (() => void) | null = null
    const spy = vi.spyOn(window, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      if (ms === TRANSLATE_FAILURE_MS) {
        clear = fn
        return 0
      }
      return realSetTimeout(fn, ms)
    }) as typeof window.setTimeout)
    try {
      act(() => click(result.current.toggle))
      await waitFor(() => expect(result.current.failed).toBe(true))
      expect(result.current.english).toBeNull()
      expect(result.current.busy).toBe(false)
      expect(clear).not.toBeNull()
      act(() => clear?.())
      expect(result.current.failed).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })

  it('turns the English title off again on a second click', async () => {
    stubApis()
    const { result } = renderHook(() => useTitleTranslation(GREEK))
    await waitFor(() => expect(result.current.available).toBe(true))
    act(() => click(result.current.toggle))
    await waitFor(() => expect(result.current.english).not.toBeNull())
    act(() => click(result.current.toggle))
    expect(result.current.enabled).toBe(false)
  })

  it('translates a later title by itself once the pack is on the device', async () => {
    stubApis({ availability: 'available' })
    window.localStorage.setItem('wtw:translate-titles', '1')
    const { result } = renderHook(() => useTitleTranslation(GREEK))
    await waitFor(() => expect(result.current.english).toBe('God Loves Caviar'))
  })

  it('does not download a pack on its own when the preference is on', async () => {
    const { created } = stubApis({ availability: 'downloadable' })
    window.localStorage.setItem('wtw:translate-titles', '1')
    const { result } = renderHook(() => useTitleTranslation(GREEK))
    await waitFor(() => expect(result.current.available).toBe(true))
    await act(async () => {})
    expect(result.current.english).toBeNull()
    expect(created).toHaveLength(0)
  })
})
