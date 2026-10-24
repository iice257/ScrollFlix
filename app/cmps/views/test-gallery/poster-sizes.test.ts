import { describe, expect, it } from 'vitest'
import {
  backdropUrl,
  pickBackdropSize,
  pickPosterSize,
  posterSrcSet,
  posterUrl,
} from './poster-sizes'

describe('poster-sizes', () => {
  it('builds TMDB urls', () => {
    expect(posterUrl('abc', 'w500')).toBe(
      'https://image.tmdb.org/t/p/w500/abc.jpg',
    )
    expect(backdropUrl('abc', 'w780')).toBe(
      'https://image.tmdb.org/t/p/w780/abc.jpg',
    )
  })

  it('picks the smallest sufficient poster size', () => {
    expect(pickPosterSize(300)).toBe('w342')
    expect(pickPosterSize(92)).toBe('w92')
    expect(pickPosterSize(93)).toBe('w154')
    expect(pickPosterSize(5000)).toBe('w780')
  })

  it('picks backdrop sizes', () => {
    expect(pickBackdropSize(700)).toBe('w780')
    expect(pickBackdropSize(1600)).toBe('w1280')
  })

  it('builds the detail srcset', () => {
    expect(posterSrcSet('abc')).toBe(
      'https://image.tmdb.org/t/p/w342/abc.jpg 342w, https://image.tmdb.org/t/p/w500/abc.jpg 500w, https://image.tmdb.org/t/p/w780/abc.jpg 780w',
    )
  })
})
