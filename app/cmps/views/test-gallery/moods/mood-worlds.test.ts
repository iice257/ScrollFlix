import { describe, expect, it } from 'vitest'
import {
  MOOD_WORLDS,
  advanceBlendHint,
  describeBlend,
  describeFit,
  nextPanelIndex,
  noteShuffleForNudge,
  toggleMood,
} from './mood-worlds'

describe('describeFit', () => {
  it('says how many films fit', () => {
    expect(describeFit(212)).toBe('212 films fit')
    expect(describeFit(1204)).toBe('1,204 films fit')
  })

  it('uses the singular for one film', () => {
    expect(describeFit(1)).toBe('1 film fits')
  })
})

describe('nextPanelIndex', () => {
  it('steps along the row and stops at the ends', () => {
    expect(nextPanelIndex(2, 'ArrowRight', 6)).toBe(3)
    expect(nextPanelIndex(2, 'ArrowLeft', 6)).toBe(1)
    expect(nextPanelIndex(5, 'ArrowRight', 6)).toBe(5)
    expect(nextPanelIndex(0, 'ArrowLeft', 6)).toBe(0)
  })

  it('jumps to the first and last with Home and End', () => {
    expect(nextPanelIndex(3, 'Home', 6)).toBe(0)
    expect(nextPanelIndex(3, 'End', 6)).toBe(5)
  })

  it('ignores other keys and an empty row', () => {
    expect(nextPanelIndex(3, 'ArrowDown', 6)).toBeNull()
    expect(nextPanelIndex(0, 'Tab', 6)).toBeNull()
    expect(nextPanelIndex(0, 'ArrowRight', 0)).toBeNull()
  })
})

describe('advanceBlendHint', () => {
  it('waits until exactly one world is chosen, then shows', () => {
    expect(advanceBlendHint('pending', 0)).toBe('pending')
    expect(advanceBlendHint('pending', 1)).toBe('showing')
  })

  it('goes away for good once a second world is chosen', () => {
    expect(advanceBlendHint('showing', 1)).toBe('showing')
    expect(advanceBlendHint('showing', 2)).toBe('done')
    expect(advanceBlendHint('done', 1)).toBe('done')
  })

  it('stays showing while one world is un-picked and picked again', () => {
    expect(advanceBlendHint('showing', 0)).toBe('showing')
  })
})

describe('toggleMood', () => {
  it('adds and removes a world', () => {
    expect(toggleMood([], 'dark')).toEqual(['dark'])
    expect(toggleMood(['dark'], 'dark')).toEqual([])
  })

  it('blends two worlds', () => {
    expect(toggleMood(['dark'], 'weird')).toEqual(['dark', 'weird'])
  })

  it('replaces the oldest when a third is chosen', () => {
    expect(toggleMood(['dark', 'weird'], 'funny')).toEqual(['weird', 'funny'])
  })
})

describe('describeBlend', () => {
  it('names the chosen worlds in order', () => {
    expect(describeBlend(['dark', 'funny'])).toBe('After dark  +  Laugh it off')
    expect(describeBlend([])).toBe('')
  })
})

describe('mood worlds', () => {
  it('has one world per mood filter, each with a unique id', () => {
    const ids = MOOD_WORLDS.map((world) => world.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(6)
  })
})

describe('noteShuffleForNudge', () => {
  it('fires on the third quick shuffle', () => {
    let state = noteShuffleForNudge([], 1000)
    expect(state.fire).toBe(false)
    state = noteShuffleForNudge(state.recent, 6000)
    expect(state.fire).toBe(false)
    state = noteShuffleForNudge(state.recent, 12000)
    expect(state.fire).toBe(true)
    expect(state.recent).toEqual([])
  })

  it('forgets shuffles that were too long ago', () => {
    let state = noteShuffleForNudge([], 1000)
    state = noteShuffleForNudge(state.recent, 2000)
    state = noteShuffleForNudge(state.recent, 90000)
    expect(state.fire).toBe(false)
    expect(state.recent).toEqual([90000])
  })
})
