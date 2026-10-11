import { describe, expect, it } from 'vitest'
import { type ConstellationStar, buildConstellation } from './constellation'

const star = (id: string, x: number, y: number): ConstellationStar => ({
  id,
  x,
  y,
  r: 20,
  depth: 1,
})

describe('buildConstellation', () => {
  it('has no links for fewer than two stars', () => {
    expect(buildConstellation([], 500)).toEqual([])
    expect(buildConstellation([star('a', 0, 0)], 500)).toEqual([])
  })

  it('joins stars with the shortest links, one fewer than the stars', () => {
    const stars = [
      star('a', 0, 0),
      star('b', 100, 0),
      star('c', 200, 0),
      star('d', 100, 90),
    ]
    const links = buildConstellation(stars, 500)
    expect(links).toHaveLength(3)
    const names = links.map(([from, to]) =>
      [stars[from].id, stars[to].id].sort().join(''),
    )
    // a-b, b-c and b-d are the shortest ways to join them.
    expect(names.sort()).toEqual(['ab', 'bc', 'bd'])
  })

  it('leaves out links that are too long, so far apart stars stand alone', () => {
    const stars = [star('a', 0, 0), star('b', 80, 0), star('c', 900, 0)]
    const links = buildConstellation(stars, 200)
    expect(links).toHaveLength(1)
    expect(links[0].map((index) => stars[index].id).sort()).toEqual(['a', 'b'])
  })

  it('keeps separate shapes when two groups are far apart', () => {
    const stars = [
      star('a', 0, 0),
      star('b', 60, 0),
      star('c', 1000, 0),
      star('d', 1060, 0),
    ]
    expect(buildConstellation(stars, 200)).toHaveLength(2)
  })
})
