import { describe, expect, it } from 'vitest'
import { moreLinks, whereToWatchUrl } from './more-links'

describe('moreLinks', () => {
  it('uses ids where there are some', () => {
    const links = moreLinks({
      id: 'c27205',
      title: 'Inception',
      year: '2010',
      imdbId: 'tt1375666',
    })
    expect(links.map((link) => link.id)).toEqual([
      'imdb',
      'letterboxd',
      'rotten-tomatoes',
      'wikipedia',
      'trakt',
    ])
    expect(links[0].href).toBe('https://www.imdb.com/title/tt1375666/')
    expect(links[1].href).toBe('https://letterboxd.com/tmdb/27205/')
    expect(links[4].href).toBe(
      'https://trakt.tv/search/tmdb/27205?id_type=movie',
    )
  })

  it('searches when there is no id, and never links to TMDB', () => {
    const links = moreLinks({ id: 'x', title: 'Heat', year: '1995' })
    expect(links[0].href).toBe('https://www.imdb.com/find/?q=Heat%201995&s=tt')
    for (const link of links) expect(link.href).not.toMatch(/themoviedb/)
  })
})

describe('whereToWatchUrl', () => {
  it('searches Google for the film', () => {
    expect(whereToWatchUrl('Heat', '1995')).toBe(
      'https://www.google.com/search?q=where%20to%20watch%20Heat%201995',
    )
    expect(whereToWatchUrl('Heat', '----')).toBe(
      'https://www.google.com/search?q=where%20to%20watch%20Heat',
    )
  })
})
