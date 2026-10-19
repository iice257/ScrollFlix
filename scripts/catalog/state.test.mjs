import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { details, fakeClient, film } from './fixtures/details.mjs'
import {
  fetchFilms,
  mergeChanges,
  readMeta,
  readState,
  writeState,
} from './state.mjs'

let dir
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'catalog-state-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('state', () => {
  it('round trips films and meta through the state files', async () => {
    const films = new Map([
      [2, film(2, { title: 'Émile 🎬' })],
      [1, film(1)],
    ])
    const meta = { lastSync: '2026-10-18', minVotes: 10, count: 2, version: 2 }
    await writeState(dir, films, meta)
    const back = await readState(dir)
    expect([...back.keys()]).toEqual([1, 2])
    expect(back.get(2)).toEqual(films.get(2))
    expect(await readMeta(dir)).toEqual(meta)
  })

  it('reads an empty state when nothing was written', async () => {
    expect((await readState(dir)).size).toBe(0)
    expect(await readMeta(dir)).toBeNull()
  })
})

describe('mergeChanges', () => {
  it('merge keeps avgColour when posterPath unchanged', () => {
    const prev = new Map([[1, film(1, { avgColour: '112233' })]])
    const refreshed = { ...film(1, { title: 'Renamed' }), avgColour: undefined }
    const next = mergeChanges(prev, new Map([[1, refreshed]]), 1)
    expect(next.get(1).title).toBe('Renamed')
    expect(next.get(1).avgColour).toBe('112233')
  })

  it('drops the colour when the poster changed', () => {
    const prev = new Map([[1, film(1, { avgColour: '112233' })]])
    const refreshed = {
      ...film(1, { posterPath: 'other' }),
      avgColour: undefined,
    }
    const next = mergeChanges(prev, new Map([[1, refreshed]]), 1)
    expect(next.get(1).avgColour).toBeUndefined()
  })

  it('drops null entries and films under minVotes, and leaves prev alone', () => {
    const prev = new Map([
      [1, film(1)],
      [2, film(2)],
      [3, film(3, { voteCount: 50 })],
    ])
    const next = mergeChanges(
      prev,
      new Map([
        [1, null],
        [3, film(3, { voteCount: 5 })],
      ]),
      10,
    )
    expect([...next.keys()]).toEqual([2])
    expect(prev.size).toBe(3)
  })

  it('adds new films', () => {
    const next = mergeChanges(new Map(), new Map([[7, film(7)]]), 1)
    expect(next.get(7).title).toBe('Film 7')
  })
})

describe('fetchFilms', () => {
  const colourOf = async () => 'c0ffee'

  it('removed and posterless films drop', async () => {
    const client = fakeClient({
      movies: new Map([
        [1, details(1)],
        [2, details(2, { poster_path: null })],
        // 3 is gone from TMDB (404 -> null)
      ]),
    })
    const prev = new Map([
      [1, film(1)],
      [2, film(2)],
      [3, film(3)],
    ])
    const { changed, failedIds } = await fetchFilms({
      client,
      ids: [1, 2, 3],
      prev,
      colourOf,
    })
    expect(failedIds).toEqual([])
    const next = mergeChanges(prev, changed, 1)
    expect([...next.keys()]).toEqual([1])
  })

  it('a dead poster (colour null) drops the film', async () => {
    const client = fakeClient({ movies: new Map([[1, details(1)]]) })
    const { changed } = await fetchFilms({
      client,
      ids: [1],
      prev: new Map(),
      colourOf: async () => null,
    })
    expect(changed.get(1)).toBeNull()
  })

  it('reuses the previous colour without fetching when the poster is unchanged', async () => {
    const client = fakeClient({ movies: new Map([[1, details(1)]]) })
    const prev = new Map([[1, film(1, { avgColour: '010203' })]])
    let colourCalls = 0
    const { changed } = await fetchFilms({
      client,
      ids: [1],
      prev,
      colourOf: async () => {
        colourCalls += 1
        return 'ffffff'
      },
    })
    expect(colourCalls).toBe(0)
    expect(changed.get(1).avgColour).toBe('010203')
  })

  it('keeps films that failed to fetch out of the changes', async () => {
    const client = fakeClient({
      movies: new Map([
        [1, details(1)],
        [2, details(2)],
      ]),
      failIds: new Set([2]),
    })
    const { changed, failedIds } = await fetchFilms({
      client,
      ids: [1, 2],
      prev: new Map([[2, film(2)]]),
      colourOf,
    })
    expect(failedIds).toEqual([2])
    expect(changed.has(2)).toBe(false)
    expect(changed.get(1).avgColour).toBe('c0ffee')
  })
})
