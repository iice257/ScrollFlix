import { describe, expect, it } from 'vitest'
import {
  MAX_HINT_SHOWS,
  TILT_HINT_KEY,
  nextTiltHint,
  readTiltHint,
  shouldShowTiltHint,
  writeTiltHint,
} from './tilt-hint-memory'

const memoryStorage = (initial?: string) => {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
  }
}

describe('tilt hint memory', () => {
  it('shows on a first visit', () => {
    expect(shouldShowTiltHint(readTiltHint(memoryStorage()))).toBe(true)
  })

  it('stops after the maximum number of showings', () => {
    let memory = readTiltHint(null)
    for (let i = 0; i < MAX_HINT_SHOWS; i++) {
      expect(shouldShowTiltHint(memory)).toBe(true)
      memory = nextTiltHint(memory, 'shown')
    }
    expect(shouldShowTiltHint(memory)).toBe(false)
  })

  it('stops for good once tilt is detected', () => {
    const memory = nextTiltHint({ shows: 1, done: false }, 'detected')
    expect(memory.done).toBe(true)
    expect(shouldShowTiltHint(memory)).toBe(false)
  })

  it('round-trips through storage', () => {
    const storage = memoryStorage()
    writeTiltHint(storage, { shows: 1, done: true })
    expect(readTiltHint(storage)).toEqual({ shows: 1, done: true })
    expect(TILT_HINT_KEY).toContain('tilt')
  })

  it('ignores corrupt or hostile stored values', () => {
    expect(readTiltHint(memoryStorage('not json'))).toEqual({
      shows: 0,
      done: false,
    })
    expect(readTiltHint(memoryStorage('{"shows":"x","done":"yes"}'))).toEqual({
      shows: 0,
      done: false,
    })
  })

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(readTiltHint(broken)).toEqual({ shows: 0, done: false })
    expect(() => writeTiltHint(broken, { shows: 1, done: false })).not.toThrow()
  })
})
