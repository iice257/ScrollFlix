import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_PATH,
  PATH_STORAGE_KEY,
  addToPath,
  parsePath,
  sessionPathStore,
} from './session-path'

describe('addToPath', () => {
  it('adds landings in order', () => {
    let path = addToPath([], 'a', null, 1)
    path = addToPath(path, 'b', null, 2)
    expect(path.map((point) => point.id)).toEqual(['a', 'b'])
  })

  it('does not repeat the same film twice in a row', () => {
    const path = addToPath(addToPath([], 'a', null, 1), 'a', null, 2)
    expect(path).toHaveLength(1)
  })

  it('upgrades the latest point when a path is found on it', () => {
    const path = addToPath(addToPath([], 'a', null, 1), 'a', 'jade', 2)
    expect(path).toEqual([{ id: 'a', tier: 'jade', at: 1 }])
  })

  it('lets a film come back later in the path', () => {
    let path = addToPath([], 'a', null, 1)
    path = addToPath(path, 'b', null, 2)
    path = addToPath(path, 'a', null, 3)
    expect(path.map((point) => point.id)).toEqual(['a', 'b', 'a'])
  })

  it('keeps only the most recent points', () => {
    let path = addToPath([], 'start', null, 0)
    for (let index = 0; index < MAX_PATH + 5; index += 1) {
      path = addToPath(path, `film-${index}`, null, index)
    }
    expect(path).toHaveLength(MAX_PATH)
    expect(path[path.length - 1].id).toBe(`film-${MAX_PATH + 4}`)
  })
})

describe('parsePath', () => {
  it('reads what was saved and ignores anything else', () => {
    expect(parsePath(null)).toEqual([])
    expect(parsePath('nope')).toEqual([])
    expect(parsePath('{"a":1}')).toEqual([])
    expect(
      parsePath(
        '[{"id":"a","tier":"frost"},{"id":"b","tier":"bogus"},{"x":1}]',
      ),
    ).toEqual([
      { id: 'a', tier: 'frost', at: 0 },
      { id: 'b', tier: null, at: 0 },
    ])
  })

  it('migrates ids from before catalogue v2', () => {
    expect(
      parsePath('[{"id":"12-27205","tier":"gold"},{"id":"c11","tier":null}]'),
    ).toEqual([
      { id: 'c27205', tier: 'gold', at: 0 },
      { id: 'c11', tier: null, at: 0 },
    ])
  })
})

describe('sessionPathStore persistence', () => {
  afterEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    sessionPathStore.reset()
  })

  it('keeps the path in local storage, so it outlives the tab', () => {
    sessionPathStore.reset()
    sessionPathStore.add('c1')
    sessionPathStore.add('c2', 'jade')
    expect(
      JSON.parse(window.localStorage.getItem(PATH_STORAGE_KEY) ?? '[]'),
    ).toEqual([
      { id: 'c1', tier: null },
      { id: 'c2', tier: 'jade' },
    ])
    // A new visit reads it back.
    sessionPathStore.reset()
    expect(sessionPathStore.get().map((point) => point.id)).toEqual([
      'c1',
      'c2',
    ])
  })

  it('adopts a path an older visit left in session storage', () => {
    window.sessionStorage.setItem(
      PATH_STORAGE_KEY,
      JSON.stringify([{ id: 'c9', tier: null }]),
    )
    sessionPathStore.reset()
    expect(sessionPathStore.get().map((point) => point.id)).toEqual(['c9'])
    sessionPathStore.add('c10')
    expect(window.sessionStorage.getItem(PATH_STORAGE_KEY)).toBeNull()
    expect(
      JSON.parse(window.localStorage.getItem(PATH_STORAGE_KEY) ?? '[]'),
    ).toHaveLength(2)
  })
})
