import { describe, expect, it } from 'vitest'
import { moodCardVars, paletteFromAccents } from './mood-run'

const inRange = (rgb: number[]) =>
  rgb.length === 3 && rgb.every((v) => v >= 0 && v <= 1)

describe('paletteFromAccents', () => {
  it('keeps every colour in range for one, two and many accents', () => {
    for (const accents of [
      ['#a78bfa'],
      ['#a78bfa', '#ffd23f'],
      ['#ff7a2f', '#ffd23f', '#5eead4', '#ff6b9d', '#f5c542', '#a78bfa'],
    ]) {
      const palette = paletteFromAccents(accents)
      for (const colour of Object.values(palette))
        expect(inRange(colour)).toBe(true)
    }
  })

  it('leads with the first accent and is the same every time', () => {
    const a = paletteFromAccents(['#a78bfa', '#ffd23f'])
    expect(a.c2[0]).toBeCloseTo(0xa7 / 255)
    expect(paletteFromAccents(['#a78bfa', '#ffd23f'])).toEqual(a)
  })

  it('differs when the second world differs', () => {
    expect(paletteFromAccents(['#a78bfa', '#ffd23f'])).not.toEqual(
      paletteFromAccents(['#a78bfa', '#5eead4']),
    )
  })

  it('falls back to white without accents', () => {
    expect(paletteFromAccents([]).c2).toEqual([1, 1, 1])
  })
})

describe('moodCardVars', () => {
  it('gives the card its colour variables', () => {
    const vars = moodCardVars(paletteFromAccents(['#ff6b9d']))
    expect(vars['--sp-c2']).toBe('#ff6b9d')
    expect(vars['--sp-glow']).toBe('255 107 157')
    expect(Object.keys(vars)).toContain('--sp-name-b')
  })
})
