import { describe, expect, it } from 'vitest'
import { MAX_PATH, addToPath, parsePath } from './session-path'

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
})
