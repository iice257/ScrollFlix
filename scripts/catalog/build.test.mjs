import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CatalogAbort,
  changeWindows,
  runBootstrap,
  runNightly,
  runSeed,
} from './build.mjs'
import { details, fakeClient, film } from './fixtures/details.mjs'
import { decodeRow } from './rows.mjs'
import { readMeta, readState, writeState } from './state.mjs'

// Vitest runs from the repo root.
const root = process.cwd()
let work
let stateDir
let outDir
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'catalog-build-'))
  stateDir = join(work, 'state')
  outDir = join(work, 'out')
})
afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

const colourOf = async () => '123456'
const readManifest = async () =>
  JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'))

const seededState = async (count, extra = {}) => {
  const films = new Map(
    Array.from({ length: count }, (_, i) => [i + 1, film(i + 1)]),
  )
  await writeState(stateDir, films, {
    lastSync: '2026-10-10',
    minVotes: 10,
    count,
    version: 2,
    ...extra,
  })
  return films
}

describe('changeWindows', () => {
  it('is one window within 14 days', () => {
    expect(changeWindows('2026-10-10', '2026-10-18')).toEqual([
      { start: '2026-10-10', end: '2026-10-18' },
    ])
  })

  it('splits longer gaps into 14-day windows', () => {
    expect(changeWindows('2026-09-01', '2026-10-18')).toEqual([
      { start: '2026-09-01', end: '2026-09-15' },
      { start: '2026-09-15', end: '2026-09-29' },
      { start: '2026-09-29', end: '2026-10-13' },
      { start: '2026-10-13', end: '2026-10-18' },
    ])
  })

  it('handles a run on the same day', () => {
    expect(changeWindows('2026-10-18', '2026-10-18')).toEqual([
      { start: '2026-10-18', end: '2026-10-18' },
    ])
  })
})

describe('seed', () => {
  const movies = new Map([1, 2, 3].map((id) => [id, details(id)]))
  const discoverFn = (params) => {
    if (params.primary_release_year === undefined) {
      return { page: 1, total_pages: 1, total_results: 3, results: [] }
    }
    if (params.primary_release_year !== 2001) {
      return { page: 1, total_pages: 0, results: [] }
    }
    return {
      page: 1,
      total_pages: 1,
      results: [1, 2, 3].map((id) => ({
        id,
        poster_path: `/poster${id}.jpg`,
        release_date: '2001-01-01',
      })),
    }
  }

  it('builds state and the public files from scratch', async () => {
    const client = fakeClient({ movies, discoverFn })
    const summary = await runSeed({
      client,
      colourOf,
      target: 100,
      stateDir,
      outDir,
      today: '2026-10-18',
      currentYear: 2026,
    })
    expect(summary).toMatchObject({ count: 3, minVotes: 1, failures: 0 })
    expect(await readMeta(stateDir)).toEqual({
      lastSync: '2026-10-18',
      minVotes: 1,
      count: 3,
      version: 2,
    })
    const manifest = await readManifest()
    expect(manifest).toMatchObject({ version: 2, count: 3 })
    expect(existsSync(join(outDir, manifest.chunks[0]))).toBe(true)
    expect(existsSync(join(outDir, manifest.texts[0]))).toBe(true)
  })

  it('aborts and leaves the previous files alone when too many requests fail', async () => {
    await seededState(3)
    const ids = Array.from({ length: 40 }, (_, i) => i + 1)
    const client = fakeClient({
      movies: new Map(ids.map((id) => [id, details(id)])),
      discoverFn: (params) =>
        params.primary_release_year === 2001
          ? {
              page: 1,
              total_pages: 1,
              results: ids.map((id) => ({
                id,
                poster_path: `/poster${id}.jpg`,
                release_date: '2001-01-01',
              })),
            }
          : { page: 1, total_pages: 0, total_results: 40, results: [] },
      failIds: new Set(ids),
    })
    await expect(
      runSeed({ client, colourOf, stateDir, outDir, currentYear: 2026 }),
    ).rejects.toBeInstanceOf(CatalogAbort)
    expect(existsSync(outDir)).toBe(false)
    expect((await readState(stateDir)).size).toBe(3)
  })
})

describe('nightly', () => {
  it('nightly window starts at meta.lastSync', async () => {
    await seededState(5)
    const client = fakeClient({ movies: new Map() })
    await runNightly({
      client,
      colourOf,
      stateDir,
      outDir,
      today: '2026-10-18',
      currentYear: 2026,
    })
    expect(client.calls.changes[0]).toEqual({
      start: '2026-10-10',
      end: '2026-10-18',
      page: 1,
    })
    expect((await readMeta(stateDir)).lastSync).toBe('2026-10-18')
  })

  it('refetches changed known films and new releases only', async () => {
    await seededState(5)
    const client = fakeClient({
      movies: new Map([
        [2, details(2, { title: 'Renamed' })],
        [99, details(99)],
      ]),
      changesFn: (_start, _end, page) => ({
        page,
        total_pages: 2,
        // 4242 is not in the catalogue, so it is not worth a detail request.
        results: page === 1 ? [{ id: 2 }, { id: 4242 }] : [{ id: 4 }],
      }),
      discoverFn: () => ({
        page: 1,
        total_pages: 1,
        results: [
          { id: 99, poster_path: '/p.jpg', release_date: '2026-01-01' },
          { id: 1, poster_path: '/p.jpg', release_date: '2026-01-01' },
        ],
      }),
    })
    await runNightly({
      client,
      colourOf,
      stateDir,
      outDir,
      today: '2026-10-18',
      currentYear: 2026,
    })
    expect([...client.calls.movie].sort((a, b) => a - b)).toEqual([2, 4, 99])
    const films = await readState(stateDir)
    expect(films.get(2).title).toBe('Renamed')
    expect(films.has(99)).toBe(true)
    // Film 4 is gone from TMDB (no details), so it dropped.
    expect(films.has(4)).toBe(false)
    expect(films.size).toBe(5)
  })

  it('refuses to publish when the count falls below 95% of the previous', async () => {
    await seededState(20)
    const client = fakeClient({
      movies: new Map(),
      changesFn: () => ({
        page: 1,
        total_pages: 1,
        results: [{ id: 1 }, { id: 2 }],
      }),
    })
    await expect(
      runNightly({
        client,
        colourOf,
        stateDir,
        outDir,
        today: '2026-10-18',
        currentYear: 2026,
      }),
    ).rejects.toThrow(/95%/)
    expect(existsSync(outDir)).toBe(false)
    expect((await readState(stateDir)).size).toBe(20)
    expect((await readMeta(stateDir)).lastSync).toBe('2026-10-10')
  })

  it('aborts when more than 2% of requests fail', async () => {
    await seededState(5)
    const client = fakeClient({
      movies: new Map([[1, details(1)]]),
      failIds: new Set([1]),
      changesFn: () => ({ page: 1, total_pages: 1, results: [{ id: 1 }] }),
    })
    await expect(
      runNightly({
        client,
        colourOf,
        stateDir,
        outDir,
        today: '2026-10-18',
        currentYear: 2026,
      }),
    ).rejects.toThrow(/failed/)
    // The film that failed to fetch was not deleted.
    expect((await readState(stateDir)).has(1)).toBe(true)
  })

  it('needs a seeded state', async () => {
    await expect(
      runNightly({
        client: fakeClient(),
        colourOf,
        stateDir,
        outDir,
        currentYear: 2026,
      }),
    ).rejects.toThrow(/seed/)
    await seededState(3, { bootstrap: true })
    await expect(
      runNightly({
        client: fakeClient(),
        colourOf,
        stateDir,
        outDir,
        currentYear: 2026,
      }),
    ).rejects.toThrow(/seed/)
  })
})

// Bootstrap converts the data the repo shipped before catalogue v2. Once
// those files are retired from the repo there is nothing left to convert.
describe.skipIf(!existsSync(join(root, 'public/json/catalog/manifest.json')))(
  'bootstrap',
  () => {
    it('bootstrap converts v1 local + catalogue rows to 10,000 v2 films with ids unchanged', async () => {
      const summary = await runBootstrap({
        root,
        stateDir,
        outDir,
        today: '2026-10-18',
      })
      expect(summary.count).toBe(10_000)
      expect(summary.requests).toBe(0)

      const manifest = await readManifest()
      expect(manifest.count).toBe(10_000)
      const films = []
      for (const chunk of manifest.chunks) {
        const rows = JSON.parse(await readFile(join(outDir, chunk), 'utf8'))
        films.push(...rows.map((row) => decodeRow(row, manifest)))
      }
      const byId = new Map(films.map((entry) => [entry.id, entry]))
      expect(byId.size).toBe(10_000)

      // A local-tier film keeps its backdrop, runtime and an average colour.
      const inception = byId.get(27205)
      expect(inception).toMatchObject({
        title: 'Inception',
        year: 2010,
        backdropPath: '8ZTVqvKDQ8emSGUEMjsS4yHAwrp',
        posterPath: 'qmDpIHrmpJINaRKAfWQfftjCdyi',
      })
      expect(inception.avgColour).toMatch(/^[0-9a-f]{6}$/)
      // A catalogue film has no backdrop yet and keeps its colour.
      const catalogueFilm = byId.get(14)
      expect(catalogueFilm).toMatchObject({
        title: 'American Beauty',
        backdropPath: '',
        avgColour: 'd9854b',
      })
      // Most-voted first.
      for (let i = 1; i < films.length; i += 1) {
        expect(films[i - 1].voteCount).toBeGreaterThanOrEqual(films[i].voteCount)
      }
      // The first real run must be a seed.
      expect((await readMeta(stateDir)).bootstrap).toBe(true)
    }, 60_000)
  },
)
