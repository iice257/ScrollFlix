import { describe, expect, it } from 'vitest'
import { buildPosterIndex } from './poster-index'

describe('poster index', () => {
  it('first instance wins', () => {
    const index = buildPosterIndex([{ id: 'a' }, { id: 'b' }], 5)
    expect(index.get('a')).toBe(0)
    expect(index.get('b')).toBe(1)
    expect(index.size).toBe(2)
  })

  it('maps every film once when the globe is as big as the set', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect([...buildPosterIndex(items, 3)]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
  })

  it('knows nothing about films that are not on the globe', () => {
    expect(buildPosterIndex([{ id: 'a' }], 4).get('z')).toBeUndefined()
    expect(buildPosterIndex([], 4).size).toBe(0)
  })
})
