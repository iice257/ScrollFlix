import { describe, expect, it } from 'vitest'
import {
  PREROLL_SPAN,
  centeredScrollTop,
  glideStart,
  pickRandomRow,
  prerollWindow,
  usablePick,
  visibleGenreTags,
} from './list-scroll'

const rows = Array.from({ length: 10_000 }, (_, index) => ({ id: `m${index}` }))

describe('pickRandomRow', () => {
  it('reaches every part of the list, not just the first rows', () => {
    expect(pickRandomRow(rows, null, () => 0)?.id).toBe('m0')
    expect(pickRandomRow(rows, null, () => 0.5)?.id).toBe('m5000')
    expect(pickRandomRow(rows, null, () => 0.9999)?.id).toBe('m9999')
  })

  it('never returns the film already showing', () => {
    for (const current of [0, 1, 5000, 9998, 9999]) {
      for (const value of [0, 0.0001, current / rows.length, 0.5, 0.9999]) {
        const picked = pickRandomRow(rows, `m${current}`, () => value)
        expect(picked?.id).not.toBe(`m${current}`)
      }
    }
  })

  it('is uniform over the other rows', () => {
    const small = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const counts = new Map<string, number>()
    const steps = 4000
    for (let step = 0; step < steps; step++) {
      const picked = pickRandomRow(small, 'b', () => (step + 0.5) / steps)
      counts.set(picked?.id ?? '', (counts.get(picked?.id ?? '') ?? 0) + 1)
    }
    expect(counts.get('b')).toBeUndefined()
    for (const id of ['a', 'c', 'd']) {
      expect(counts.get(id)).toBeGreaterThan(1300)
      expect(counts.get(id)).toBeLessThan(1370)
    }
  })

  it('handles empty, single and unknown-current lists', () => {
    expect(pickRandomRow([], null, () => 0.3)).toBeNull()
    expect(pickRandomRow([{ id: 'a' }], 'a', () => 0.3)?.id).toBe('a')
    expect(pickRandomRow(rows, 'gone', () => 0)?.id).toBe('m0')
  })
})

describe('centeredScrollTop', () => {
  const base = { rowHeight: 69, viewportHeight: 800, scrollHeight: 10_000 }

  it('puts the row in the middle of the viewport', () => {
    expect(centeredScrollTop({ ...base, rowTop: 5000 })).toBe(5000 - 400 + 34.5)
  })

  it('clamps at the top and the bottom of the list', () => {
    expect(centeredScrollTop({ ...base, rowTop: 100 })).toBe(0)
    expect(centeredScrollTop({ ...base, rowTop: 9990 })).toBe(9200)
  })

  it('never goes negative when the list is shorter than the viewport', () => {
    expect(centeredScrollTop({ ...base, rowTop: 200, scrollHeight: 500 })).toBe(
      0,
    )
  })
})

describe('glideStart', () => {
  it('glides from where it is when the target is near', () => {
    expect(glideStart(1000, 2500, 800)).toBe(1000)
    expect(glideStart(2500, 1000, 800)).toBe(2500)
  })

  it('jumps close to a far target, from either direction', () => {
    expect(glideStart(0, 100_000, 800)).toBe(100_000 - 1200)
    expect(glideStart(100_000, 0, 800)).toBe(1200)
  })
})

describe('visibleGenreTags', () => {
  const genres = ['Drama', 'Crime', 'Thriller', 'Mystery', 'Romance']

  it('shows the first three genres when nothing is selected', () => {
    expect(visibleGenreTags(genres, [])).toEqual(['Drama', 'Crime', 'Thriller'])
  })

  it('puts a selected genre first, even a late one', () => {
    expect(visibleGenreTags(genres, ['Romance'])).toEqual([
      'Romance',
      'Drama',
      'Crime',
    ])
  })

  it('keeps selected genres in film order and never exceeds the limit', () => {
    expect(visibleGenreTags(genres, ['Mystery', 'Crime'])).toEqual([
      'Crime',
      'Mystery',
      'Drama',
    ])
    expect(visibleGenreTags(genres, genres)).toHaveLength(3)
  })

  it('ignores selected genres the film does not have', () => {
    expect(visibleGenreTags(['Drama'], ['Horror'])).toEqual(['Drama'])
    expect(visibleGenreTags([], ['Horror'])).toEqual([])
  })
})

describe('shuffle preroll', () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({ id: `r${index}` }))

  it('takes the pick and nine rows either side, in list order', () => {
    const window = prerollWindow(rows, 20)
    expect(window).toHaveLength(19)
    expect(window[0].id).toBe('r11')
    expect(window[9].id).toBe('r20')
    expect(window[18].id).toBe('r29')
  })

  it('shrinks at the ends of the list and for a missing pick', () => {
    expect(prerollWindow(rows, 0).map((row) => row.id)).toEqual(
      rows.slice(0, 10).map((row) => row.id),
    )
    expect(prerollWindow(rows, 39)).toHaveLength(10)
    expect(prerollWindow(rows, -1)).toEqual([])
    expect(PREROLL_SPAN).toBe(9)
  })

  it('uses a planned pick only for the same list and a different film', () => {
    const planned = { row: rows[5], rows }
    expect(usablePick(planned, rows, 'r1')).toBe(rows[5])
    expect(usablePick(planned, rows, 'r5')).toBeNull()
    expect(usablePick(planned, [...rows], 'r1')).toBeNull()
    expect(usablePick(null, rows, null)).toBeNull()
  })
})
