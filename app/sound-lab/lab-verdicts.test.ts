import { beforeEach, describe, expect, it } from 'vitest'
import {
  VERDICT_KEY,
  exportVerdicts,
  loadVerdicts,
  saveVerdicts,
  setDecision,
  setLevel,
} from './lab-verdicts'

describe('lab verdicts', () => {
  beforeEach(() => localStorage.clear())

  it('keeps or replaces, and pressing again takes it back', () => {
    let v = setDecision({}, 'hover1', 'keep')
    expect(v.hover1.decision).toBe('keep')
    v = setDecision(v, 'hover1', 'replace')
    expect(v.hover1.decision).toBe('replace')
    v = setDecision(v, 'hover1', 'replace')
    expect(v).toEqual({})
  })

  it('holds a level note alongside a decision', () => {
    let v = setDecision({}, 'tap3', 'keep')
    v = setLevel(v, 'tap3', 'loud')
    expect(v.tap3).toEqual({ decision: 'keep', level: 'loud' })
    v = setLevel(v, 'tap3', 'quiet')
    expect(v.tap3.level).toBe('quiet')
    v = setLevel(v, 'tap3', 'quiet')
    expect(v.tap3.level).toBeUndefined()
    expect(v.tap3.decision).toBe('keep')
  })

  it('persists across a reload', () => {
    const v = setLevel(setDecision({}, 'open2', 'replace'), 'open2', 'quiet')
    saveVerdicts(v)
    expect(loadVerdicts()).toEqual({
      open2: { decision: 'replace', level: 'quiet' },
    })
  })

  it('shrugs off damaged storage', () => {
    localStorage.setItem(VERDICT_KEY, '{not json')
    expect(loadVerdicts()).toEqual({})
    localStorage.setItem(
      VERDICT_KEY,
      JSON.stringify({ a: { decision: 'nope' }, b: { level: 'loud' } }),
    )
    expect(Object.keys(loadVerdicts())).toEqual(['b'])
    expect(loadVerdicts().b.level).toBe('loud')
  })

  it('exports grouped lists in natural order', () => {
    let v = setDecision({}, 'hover10', 'replace')
    v = setDecision(v, 'hover2', 'replace')
    v = setDecision(v, 'gold-a', 'keep')
    v = setLevel(v, 'gold-a', 'loud')
    v = setLevel(v, 'cue:hover', 'quiet')
    const out = exportVerdicts(v, new Date('2026-10-14T00:00:00Z'))
    expect(out.replace).toEqual(['hover2', 'hover10'])
    expect(out.keep).toEqual(['gold-a'])
    expect(out.tooLoud).toEqual(['gold-a'])
    expect(out.tooQuiet).toEqual(['cue:hover'])
    expect(out.exportedAt).toBe('2026-10-14T00:00:00.000Z')
  })
})
