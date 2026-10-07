import { beforeEach, describe, expect, it } from 'vitest'
import {
  SAVED_STORAGE_KEY,
  addSaved,
  parseSaved,
  removeSaved,
  savedStore,
} from './saved-store'

describe('saved movies', () => {
  beforeEach(() => {
    window.localStorage.clear()
    savedStore.reset()
  })

  it('reads missing, corrupt and wrongly shaped data as empty', () => {
    expect(parseSaved(null)).toEqual([])
    expect(parseSaved('nope')).toEqual([])
    expect(parseSaved('{"id":"a"}')).toEqual([])
    expect(parseSaved('[1,"a",{"id":3},{"id":"x","savedAt":"soon"}]')).toEqual(
      [],
    )
  })

  it('keeps newest first and drops duplicate ids', () => {
    const parsed = parseSaved(
      JSON.stringify([
        { id: 'a', savedAt: 1 },
        { id: 'b', savedAt: 3 },
        { id: 'a', savedAt: 2 },
      ]),
    )
    expect(parsed.map((entry) => entry.id)).toEqual(['b', 'a'])
  })

  it('adds to the front and re-saving moves a movie to the front', () => {
    const first = addSaved([], 'a', 1)
    const second = addSaved(first, 'b', 2)
    expect(second.map((entry) => entry.id)).toEqual(['b', 'a'])
    const again = addSaved(second, 'a', 3)
    expect(again).toEqual([
      { id: 'a', savedAt: 3 },
      { id: 'b', savedAt: 2 },
    ])
  })

  it('removes a movie', () => {
    const entries = addSaved(addSaved([], 'a', 1), 'b', 2)
    expect(removeSaved(entries, 'a').map((entry) => entry.id)).toEqual(['b'])
    expect(removeSaved(entries, 'zzz')).toEqual(entries)
  })

  it('toggles, persists under a versioned key and notifies subscribers', () => {
    let calls = 0
    const unsubscribe = savedStore.subscribe(() => {
      calls += 1
    })
    expect(savedStore.toggle('42', 100)).toBe(true)
    expect(savedStore.has('42')).toBe(true)
    expect(window.localStorage.getItem(SAVED_STORAGE_KEY)).toContain('"42"')
    expect(savedStore.toggle('42', 200)).toBe(false)
    expect(savedStore.has('42')).toBe(false)
    expect(calls).toBe(2)
    unsubscribe()
  })

  it('survives a reload', () => {
    savedStore.toggle('7', 10)
    savedStore.reset()
    expect(savedStore.get().map((entry) => entry.id)).toEqual(['7'])
  })
})
