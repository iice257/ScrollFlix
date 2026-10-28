import { describe, expect, it } from 'vitest'
import {
  CTAS,
  FIRST_PROMPT,
  PROMPT_BUDGET,
  contextFor,
  dayPart,
  pickPrompt,
} from './mood-prompt'

describe('dayPart', () => {
  it('splits the day', () => {
    expect([4, 5, 11, 12, 17, 18, 21, 22, 23, 0].map(dayPart)).toEqual([
      'night',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
      'night',
      'night',
    ])
  })
})

describe('contextFor', () => {
  it('follows skips first, then a quiet spell', () => {
    expect(contextFor(0, false)).toBe('time')
    expect(contextFor(0, true)).toBe('idle')
    expect(contextFor(1, false)).toBe('skip')
    expect(contextFor(3, true)).toBe('skip')
    expect(contextFor(4, false)).toBe('skips')
  })
})

describe('pickPrompt', () => {
  it('always fits between the phone corner buttons', () => {
    for (const context of ['skip', 'skips', 'idle', 'time'] as const)
      for (const part of ['morning', 'afternoon', 'evening', 'night'] as const)
        for (let step = 0; step < 60; step += 1) {
          const next = pickPrompt(context, part, FIRST_PROMPT)
          expect(next.lead.length + next.cta.length).toBeLessThanOrEqual(
            PROMPT_BUDGET,
          )
        }
  })

  it('never repeats the previous lead-in or label', () => {
    let previous = FIRST_PROMPT
    for (let step = 0; step < 200; step += 1) {
      const next = pickPrompt('skip', 'evening', previous)
      expect(next.lead).not.toBe(previous.lead)
      expect(next.cta).not.toBe(previous.cta)
      expect(CTAS).toContain(next.cta)
      previous = next
    }
  })

  it('draws from the pool of its context', () => {
    expect(pickPrompt('skips', 'morning', FIRST_PROMPT, () => 0).lead).toBe(
      'Nothing landing?',
    )
    expect(pickPrompt('time', 'night', FIRST_PROMPT, () => 0).lead).toBe(
      'Late night mood?',
    )
  })

  it('does not say tonight in the morning', () => {
    for (let step = 0; step < 100; step += 1)
      expect(pickPrompt('time', 'morning', FIRST_PROMPT).lead).not.toMatch(
        /tonight|late night/i,
      )
  })
})
