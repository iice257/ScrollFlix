import { describe, expect, it } from 'vitest'
import {
  SHEET_CLOSE_PX,
  dragVelocity,
  sheetFrame,
  sheetSettle,
} from './sheet-drag'

const limits = { compact: 600, expanded: 800 }

describe('sheetFrame', () => {
  it('grows with an upward drag and stops at the expanded height', () => {
    expect(sheetFrame(600, -50, limits)).toEqual({ height: 650, offset: 0 })
    expect(sheetFrame(600, -500, limits)).toEqual({ height: 800, offset: 0 })
  })

  it('shrinks with a downward drag from expanded, one to one', () => {
    expect(sheetFrame(800, 120, limits)).toEqual({ height: 680, offset: 0 })
  })

  it('moves the sheet down past compact, resisted, so it can be closed', () => {
    const frame = sheetFrame(600, 100, limits)
    expect(frame.height).toBe(600)
    expect(frame.offset).toBeCloseTo(85)
  })
})

describe('sheetSettle', () => {
  it('goes to whichever resting height is nearer', () => {
    expect(sheetSettle({ height: 720, offset: 0 }, 0, limits)).toBe('expanded')
    expect(sheetSettle({ height: 680, offset: 0 }, 0, limits)).toBe('compact')
  })

  it('follows a flick, whatever the position', () => {
    expect(sheetSettle({ height: 620, offset: 0 }, -0.8, limits)).toBe(
      'expanded',
    )
    expect(sheetSettle({ height: 780, offset: 0 }, 0.8, limits)).toBe('compact')
  })

  it('closes after a long pull or a fast throw down from compact', () => {
    expect(
      sheetSettle({ height: 600, offset: SHEET_CLOSE_PX + 1 }, 0, limits),
    ).toBe('close')
    expect(sheetSettle({ height: 600, offset: 30 }, 1.4, limits)).toBe('close')
    expect(sheetSettle({ height: 600, offset: 30 }, 0.1, limits)).toBe(
      'compact',
    )
  })
})

describe('dragVelocity', () => {
  it('reads the last stretch of the drag', () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 10, t: 200 },
      { y: 40, t: 240 },
      { y: 100, t: 280 },
    ]
    expect(dragVelocity(samples)).toBeCloseTo(1.125, 2)
  })

  it('is zero without movement or samples', () => {
    expect(dragVelocity([])).toBe(0)
    expect(dragVelocity([{ y: 5, t: 10 }])).toBe(0)
  })
})
