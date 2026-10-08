import { describe, expect, it } from 'vitest'
import { shareLink } from './share-link'
import { shareCaption, shareFileName, slugifyTitle } from './share-output'

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
