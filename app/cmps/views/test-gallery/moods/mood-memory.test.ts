import { describe, expect, it } from 'vitest'
import { parseLandings } from './mood-memory'

describe('parseLandings', () => {
  it('reads saved counts', () => {
    expect(parseLandings('{"dark":2,"funny":1}')).toEqual({ dark: 2, funny: 1 })
  })

  it('drops junk and unknown worlds', () => {
    expect(
      parseLandings('{"dark":"x","funny":-1,"nope":3,"weird":2.9}'),
    ).toEqual({ weird: 2 })
  })

  it('falls back to empty', () => {
    expect(parseLandings(null)).toEqual({})
    expect(parseLandings('not json')).toEqual({})
  })
})
