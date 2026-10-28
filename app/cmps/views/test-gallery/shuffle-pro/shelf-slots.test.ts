import { describe, expect, it } from 'vitest'
import { shelfSlots } from './shelf-slots'

const entry = (firstAt: number) => ({ count: 1, firstAt, lastAt: firstAt })

describe('shelfSlots', () => {
  it('seats eggs in the order they were found', () => {
    const { shown, empty, more } = shelfSlots({
      jade: entry(10),
      frost: entry(30),
    })
    expect(shown.map((egg) => egg.tier)).toEqual(['jade', 'frost'])
    expect(empty).toBe(1)
    expect(more).toBe(0)
  })

  it('keeps three seats and counts the rest', () => {
    const { shown, empty, more } = shelfSlots({
      frost: entry(1),
      amethyst: entry(2),
      jade: entry(3),
      gold: entry(4),
    })
    expect(shown.map((egg) => egg.tier)).toEqual(['frost', 'amethyst', 'jade'])
    expect(empty).toBe(0)
    expect(more).toBe(1)
  })

  it('shows only empty seats before anything is found', () => {
    expect(shelfSlots({})).toEqual({ shown: [], empty: 3, more: 0 })
  })
})
