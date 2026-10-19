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

  it('legacy ids read back migrated', () => {
    const parsed = parseSaved(
      JSON.stringify([
        { id: '0-27205', savedAt: 5 },
        { id: 'c11', savedAt: 4 },
        // The same film saved under an old id and its new one: one entry.
        { id: '412-155', savedAt: 3 },
        { id: 'c155', savedAt: 2 },
      ]),
    )
    expect(parsed).toEqual([
      { id: 'c27205', savedAt: 5 },
      { id: 'c11', savedAt: 4 },
      { id: 'c155', savedAt: 3 },
    ])
  })

  it('finds a film saved under an old id through the store', () => {
    window.localStorage.setItem(
      SAVED_STORAGE_KEY,
      JSON.stringify([{ id: '9-27205', savedAt: 1 }]),
    )
    savedStore.reset()
    expect(savedStore.has('c27205')).toBe(true)
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
