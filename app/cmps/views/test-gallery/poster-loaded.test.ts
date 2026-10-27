import { afterEach, describe, expect, it } from 'vitest'
import {
  bestLoadedSize,
  notePosterLoaded,
  notePosterUrlLoaded,
  parsePosterUrl,
  resetLoadedPosters,
  startingPosterUrl,
} from './poster-loaded'

afterEach(resetLoadedPosters)

describe('poster loaded sizes', () => {
  it('reads the size and path from a TMDB url, and nothing else', () => {
    expect(parsePosterUrl('https://image.tmdb.org/t/p/w185/abc.jpg')).toEqual({
      size: 'w185',
      path: 'abc',
    })
    expect(
      parsePosterUrl('https://image.tmdb.org/t/p/w185/abc.jpg?no-cors'),
    ).toEqual({ size: 'w185', path: 'abc' })
    expect(parsePosterUrl('https://example.com/abc.jpg')).toBeNull()
    expect(parsePosterUrl('https://image.tmdb.org/t/p/w300/abc.jpg')).toBeNull()
  })

  it('starts from the largest loaded size below the one about to show', () => {
    notePosterLoaded('abc', 'w92')
    notePosterLoaded('abc', 'w185')
    notePosterLoaded('abc', 'w342')
    expect(bestLoadedSize('abc', 'w342')).toBe('w185')
    expect(bestLoadedSize('abc', 'w500')).toBe('w342')
    expect(bestLoadedSize('abc', 'w92')).toBeNull()
    expect(bestLoadedSize('other')).toBeNull()
  })

  it('falls back to the thumbnail when nothing is loaded', () => {
    const thumb = 'https://image.tmdb.org/t/p/w154/abc.jpg'
    expect(startingPosterUrl('abc', thumb)).toBe(thumb)
    expect(startingPosterUrl(null, thumb)).toBe(thumb)
    notePosterUrlLoaded('https://image.tmdb.org/t/p/w92/abc.jpg')
    expect(startingPosterUrl('abc', thumb)).toBe(
      'https://image.tmdb.org/t/p/w92/abc.jpg',
    )
    notePosterUrlLoaded('https://image.tmdb.org/t/p/w185/abc.jpg')
    expect(startingPosterUrl('abc', thumb)).toBe(
      'https://image.tmdb.org/t/p/w185/abc.jpg',
    )
  })

  it('ignores urls that are not TMDB posters', () => {
    notePosterUrlLoaded('https://example.com/a.jpg')
    expect(bestLoadedSize('a')).toBeNull()
  })
})
