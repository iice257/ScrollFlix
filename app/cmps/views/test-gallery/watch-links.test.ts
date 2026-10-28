import { describe, expect, it } from 'vitest'
import { youtubeWatchHref } from './watch-links'

describe('youtubeWatchHref', () => {
  it('points at the first trailer key that is not dead', () => {
    expect(youtubeWatchHref(['a', 'b'], new Set(['a']), 'Heat', '1995')).toBe(
      'https://www.youtube.com/watch?v=b',
    )
  })

  it('falls back to a YouTube search with no keys or only dead ones', () => {
    const search =
      'https://www.youtube.com/results?search_query=Heat%201995%20trailer'
    expect(youtubeWatchHref(undefined, new Set(), 'Heat', '1995')).toBe(search)
    expect(youtubeWatchHref(['a'], new Set(['a']), 'Heat', '1995')).toBe(search)
  })
})
