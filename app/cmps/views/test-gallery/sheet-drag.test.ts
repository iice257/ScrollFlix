import { describe, expect, it } from 'vitest'
import {
  SHEET_FLICK_SPEED,
  SHEET_RESIST,
  SHEET_THRESHOLD_PX,
  dragVelocity,
  sheetDecision,
  sheetOffset,
} from './sheet-drag'

describe('sheetOffset', () => {
  it('follows a downward drag one to one', () => {
    expect(sheetOffset(0, 200)).toBe(0)
    expect(sheetOffset(130, 200)).toBe(130)
    expect(sheetOffset(130, 0)).toBe(130)
  })

  it('follows an upward drag one to one for as far as the sheet can grow', () => {
    expect(sheetOffset(-80, 200)).toBe(-80)
    expect(sheetOffset(-200, 200)).toBe(-200)
  })

  it('resists a pull past the end of the travel', () => {
    expect(sheetOffset(-300, 200)).toBeCloseTo(-(200 + 100 * SHEET_RESIST))
    // Already expanded: there is no room, so all of it is resisted.
    expect(sheetOffset(-100, 0)).toBeCloseTo(-100 * SHEET_RESIST)
  })
})

describe('sheetDecision', () => {
  it('closes a compact sheet pulled down far enough, or thrown down', () => {
    expect(sheetDecision(SHEET_THRESHOLD_PX, 0, false)).toBe('close')
    expect(sheetDecision(10, SHEET_FLICK_SPEED, false)).toBe('close')
  })

  it('shrinks an expanded sheet pulled down instead of closing it', () => {
    expect(sheetDecision(SHEET_THRESHOLD_PX + 40, 0, true)).toBe('compact')
    expect(sheetDecision(10, SHEET_FLICK_SPEED + 0.2, true)).toBe('compact')
  })

  it('opens a compact sheet pulled up far enough, or thrown up', () => {
    expect(sheetDecision(-SHEET_THRESHOLD_PX, 0, false)).toBe('expanded')
    expect(sheetDecision(-10, -SHEET_FLICK_SPEED, false)).toBe('expanded')
  })

  it('puts a short pull back where it was', () => {
    expect(sheetDecision(SHEET_THRESHOLD_PX - 1, 0.1, false)).toBe('compact')
    expect(sheetDecision(-(SHEET_THRESHOLD_PX - 1), -0.1, false)).toBe(
      'compact',
    )
    expect(sheetDecision(-20, 0, true)).toBe('expanded')
    expect(sheetDecision(20, 0, true)).toBe('expanded')
  })

  it('follows the pull when a late flick points the other way', () => {
    expect(sheetDecision(-80, 0.6, false)).toBe('expanded')
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
