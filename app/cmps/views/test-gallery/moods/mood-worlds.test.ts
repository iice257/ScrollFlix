import { describe, expect, it } from 'vitest'
import {
  MOOD_WORLDS,
  describeBlend,
  noteShuffleForNudge,
  toggleMood,
} from './mood-worlds'

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
