import { describe, expect, it } from 'vitest'
import { buildScore } from './shuffle-pro-music'

const TIERS = ['frost', 'amethyst', 'jade', 'gold'] as const

describe('buildScore', () => {
  it.each(TIERS)('keeps every %s note inside the piece and audible', (tier) => {
    const { notes, length } = buildScore(tier)
    expect(notes.length).toBeGreaterThan(20)
    for (const note of notes) {
      expect(note.at).toBeGreaterThanOrEqual(0)
      expect(note.at).toBeLessThan(length)
      expect(note.hz).toBeGreaterThan(30)
      expect(note.hz).toBeLessThan(5000)
      expect(note.gain).toBeGreaterThan(0)
      expect(note.gain).toBeLessThan(0.2)
    }
  })

  it.each(TIERS)('ends %s on a held final chord', (tier) => {
    const { notes, length } = buildScore(tier)
    const finals = notes.filter((note) => note.kind === 'final')
    expect(finals.length).toBeGreaterThanOrEqual(8)
    const lastStart = Math.max(...finals.map((note) => note.at))
    expect(lastStart).toBeGreaterThan(8)
    expect(lastStart).toBeLessThan(length)
  })

  it('is the same every time and different for every path', () => {
    expect(buildScore('gold')).toEqual(buildScore('gold'))
    const keys = TIERS.map((tier) => JSON.stringify(buildScore(tier)))
    expect(new Set(keys).size).toBe(TIERS.length)
  })

  it('stays within a sensible length', () => {
    for (const tier of TIERS) {
      const { length } = buildScore(tier)
      expect(length).toBeGreaterThan(12)
      expect(length).toBeLessThan(24)
    }
  })
})
