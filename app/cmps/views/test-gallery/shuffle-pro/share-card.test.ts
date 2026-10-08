import { describe, expect, it } from 'vitest'
import { shareCaption, shareFileName, slugifyTitle } from './share-card'

describe('share card helpers', () => {
  it('slugifies titles for file names', () => {
    expect(slugifyTitle('Wreck-It Ralph')).toBe('wreck-it-ralph')
    expect(slugifyTitle('Amélie')).toBe('amelie')
    expect(slugifyTitle('  ...  ')).toBe('movie')
    expect(slugifyTitle('A'.repeat(200)).length).toBeLessThanOrEqual(60)
  })

  it('names the file scrollflix-<title-slug>-<path>.png', () => {
    expect(shareFileName('Paperman', 'frost')).toBe(
      'scrollflix-paperman-frost.png',
    )
    expect(shareFileName('Spirited Away', 'gold')).toBe(
      'scrollflix-spirited-away-gold.png',
    )
  })

  it('captions the path, with Max for Jade', () => {
    expect(shareCaption('frost')).toBe('✦ Shuffle Pro · Frost')
    expect(shareCaption('jade')).toBe('✦ Shuffle Pro Max · Jade')
  })
})
