import { describe, expect, it, vi } from 'vitest'
import { shareLink } from './share-link'
import {
  SHARE_ACTIONS,
  nativeSharePayload,
  primaryShareAction,
  shareCaption,
  shareFileName,
  slugifyTitle,
  warmFilmCard,
} from './share-output'

describe('sharing a link', () => {
  const file = new File(['x'], 'a.png', { type: 'image/png' })

  it('puts the link in the text too, because apps drop url beside files', () => {
    const link = 'https://scrollflix.app/?film=949'
    const payload = nativeSharePayload(file, 'Heat', link)
    expect(payload.files).toEqual([file])
    expect(payload.url).toBe(link)
    expect(payload.text).toContain(link)
  })

  it('shares only the file when there is no link', () => {
    const payload = nativeSharePayload(file, 'Heat')
    expect(payload.url).toBeUndefined()
    expect(payload.text).toBeUndefined()
  })

  it('leads with copying the link', () => {
    expect(primaryShareAction).toBe('copy-link')
    expect(SHARE_ACTIONS).toEqual(['copy-link', 'share-image', 'save'])
  })

  it('warms the film card once, and ignores bad ids', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(''))
    vi.stubGlobal('fetch', fetchMock)
    warmFilmCard('c603', 'https://x.test')
    warmFilmCard('603', 'https://x.test')
    warmFilmCard('nope', 'https://x.test')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://x.test/api/og?kind=film&id=603',
    )
    vi.unstubAllGlobals()
  })
})

describe('share helpers', () => {
  it('slugifies titles for file names', () => {
    expect(slugifyTitle('Wreck-It Ralph')).toBe('wreck-it-ralph')
    expect(slugifyTitle('Amélie')).toBe('amelie')
    expect(slugifyTitle('  ...  ')).toBe('movie')
    expect(slugifyTitle('A'.repeat(200)).length).toBeLessThanOrEqual(60)
  })

  it('names the file scrollflix-<title-slug>-<path>.<ext>', () => {
    expect(shareFileName('Paperman', 'frost')).toBe(
      'scrollflix-paperman-frost.png',
    )
    expect(shareFileName('Spirited Away', 'gold', 'webm')).toBe(
      'scrollflix-spirited-away-gold.webm',
    )
  })

  it('leaves the path out for an ordinary pick', () => {
    expect(shareFileName('Paperman', null)).toBe('scrollflix-paperman.png')
  })

  it('captions the path, with Max for Jade', () => {
    expect(shareCaption('frost')).toBe('✦ Shuffle Pro · Frost')
    expect(shareCaption('jade')).toBe('✦ Shuffle Pro Max · Jade')
  })

  it('links to a film and drops anything else on the address', () => {
    expect(shareLink('412-27205', 'https://scrollflix.app/?x=1#y')).toBe(
      'https://scrollflix.app/?film=27205',
    )
  })
})
