import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogManifestV2, CatalogRow } from './catalog-loader'

const tables = {
  genres: ['Action', 'Drama', 'Science Fiction'],
  countries: ['France', 'United States of America'],
}

const manifestOf = (
  chunkCount: number,
  extra: Partial<CatalogManifestV2> = {},
): CatalogManifestV2 => ({
  version: 2,
  count: chunkCount * 2000,
  chunks: Array.from(
    { length: chunkCount },
    (_, i) => `films-${i}.abcd1234.json`,
  ),
  texts: Array.from(
    { length: Math.ceil((chunkCount * 2000) / 500) },
    (_, i) => `text-${i}.abcd1234.json`,
  ),
  chunkSize: 2000,
  textChunkSize: 500,
  generatedAt: '2026-10-18T03:00:00.000Z',
  ...tables,
  ...extra,
})

const rowOf = (id: number): CatalogRow => [
  id,
  `Film ${id}`,
  2000,
  70,
  [1],
  0,
  `poster${id}`,
  `back${id}`,
  'a1b2c3',
  100000 - id,
  120,
  95,
]

// A fetch that serves a manifest, `chunkCount` chunks of 2,000 rows, and text.
// `newText` serves the version 3 text rows, with the three extra fields.
const serve = (chunkCount: number, newText = false) => {
  const manifest = manifestOf(chunkCount)
  const requested: string[] = []
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)
    const name = url.split('/').pop() ?? ''
    if (name === 'manifest.json') return Response.json(manifest)
    const chunk = /^films-(\d+)\./.exec(name)
    if (chunk) {
      const start = Number(chunk[1]) * 2000
      return Response.json(
        Array.from({ length: 2000 }, (_, i) => rowOf(start + i + 1)),
      )
    }
    const text = /^text-(\d+)\./.exec(name)
    if (text) {
      const start = Number(text[1]) * 500
      return Response.json(
        Array.from({ length: 500 }, (_, i) => [
          `Overview ${start + i + 1}`,
          `Tagline ${start + i + 1}`,
          `tt${start + i + 1}`,
          ...(newText
            ? [`Titre ${start + i + 1}`, 'fr', 'abc12345 def67890']
            : []),
        ]),
      )
    }
    return new Response('', { status: 404 })
  })
  vi.stubGlobal('fetch', impl)
  return { requested, manifest }
}

// The loader keeps module-level caches, so each test gets a fresh copy.
const freshLoader = async () => {
  vi.resetModules()
  return import('./catalog-loader')
}

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('catalog loader', () => {
  it('decodes v2 rows into TestMovie', async () => {
    const { mapCatalogRow } = await freshLoader()
    const mapped = mapCatalogRow(
      [
        27205,
        'Inception',
        2010,
        84,
        [0, 2],
        1,
        'qmDpIHrmpJINaRKAfWQfftjCdyi',
        '8ZTVqvKDQ8emSGUEMjsS4yHAwrp',
        '3a4b5c',
        38000,
        291,
        148,
      ],
      12,
      13,
      tables,
    )
    expect(mapped).toMatchObject({
      id: 'c27205',
      rank: 13,
      title: 'Inception',
      year: '2010',
      rating: '8.4',
      ratingValue: 8.4,
      genres: ['Action', 'Science Fiction'],
      countries: 'United States of America',
      posterPath: 'qmDpIHrmpJINaRKAfWQfftjCdyi',
      backdropPath: '8ZTVqvKDQ8emSGUEMjsS4yHAwrp',
      runtimeMinutes: 148,
      voteCount: 38000,
      popularity: 29.1,
      placeholderColor: '#3a4b5c',
      textIndex: 12,
    })
  })

  it('keeps the poster sizes the globe, card and index use today', async () => {
    const { mapCatalogRow } = await freshLoader()
    const mapped = mapCatalogRow(rowOf(1), 0, 1, tables)
    expect(mapped.posterUrl).toBe('https://image.tmdb.org/t/p/w154/poster1.jpg')
    expect(mapped.posterDetailUrl).toBe(
      'https://image.tmdb.org/t/p/w342/poster1.jpg',
    )
    expect(mapped.posterListUrl).toBe(
      'https://image.tmdb.org/t/p/w92/poster1.jpg',
    )
  })

  it('gives the no-CORS card backdrop a URL nothing else requests', async () => {
    const { mapCatalogRow, posterBackdropUrl } = await freshLoader()
    const mapped = mapCatalogRow(rowOf(1), 0, 1, tables)
    const backdrop = posterBackdropUrl(mapped)
    // A CSS image fetch without CORS would poison the cached copy of any URL
    // that the globe (w154), index (w92) or card (w342) also asks for.
    for (const used of [
      mapped.posterUrl,
      mapped.posterListUrl,
      mapped.posterDetailUrl,
      // The globe's mid tier.
      mapped.posterUrl.replace('/w154/', '/w185/'),
    ]) {
      expect(backdrop).not.toBe(used)
    }
    expect(backdrop).toBe('https://image.tmdb.org/t/p/w185/poster1.jpg?no-cors')
  })

  it('treats a zero rating, no backdrop and no runtime as missing', async () => {
    const { mapCatalogRow } = await freshLoader()
    const mapped = mapCatalogRow(
      [1, 'X', 0, 0, [], -1, 'p', '', '', 0, 0, 0],
      0,
      1,
      { countries: [], genres: [] },
    )
    expect(mapped.ratingValue).toBeNull()
    expect(mapped.year).toBe('----')
    expect(mapped.backdropPath).toBeNull()
    expect(mapped.runtimeMinutes).toBeNull()
    expect(mapped.placeholderColor).toBeUndefined()
  })

  it('migrates legacy saved ids', async () => {
    const { migrateLegacyId } = await freshLoader()
    expect(migrateLegacyId('0-27205')).toBe('c27205')
    expect(migrateLegacyId('412-27205')).toBe('c27205')
    expect(migrateLegacyId('c11')).toBe('c11')
    expect(migrateLegacyId('27205')).toBe('27205')
    expect(migrateLegacyId('')).toBe('')
  })

  it('loads the manifest and chunk 0 only for the first chunk', async () => {
    const { requested } = serve(5)
    const { loadFirstChunk } = await freshLoader()
    const movies = await loadFirstChunk()
    expect(movies).toHaveLength(2000)
    expect(movies[0]).toMatchObject({ id: 'c1', rank: 1 })
    expect(requested).toEqual([
      '/json/catalog/manifest.json',
      '/json/catalog/films-0.abcd1234.json',
    ])
  })

  it('lightweight loads ≤ 20k then rest on full:true', async () => {
    const { requested } = serve(12)
    const { loadAllMovies } = await freshLoader()
    const partial = await loadAllMovies({ lightweight: true, full: false })
    expect(partial).toHaveLength(20_000)
    const chunkRequests = () =>
      requested.filter((url) => url.includes('films-')).length
    expect(chunkRequests()).toBe(10)

    const everything = await loadAllMovies({ lightweight: true, full: true })
    expect(everything).toHaveLength(24_000)
    // Only the two chunks it did not have yet.
    expect(chunkRequests()).toBe(12)
    // Ranks are positions in the vote-ordered catalogue.
    expect(everything[23_999]).toMatchObject({ id: 'c24000', rank: 24_000 })
  })

  it('desktop loads every chunk, and later calls reuse the result', async () => {
    const { requested } = serve(5)
    const { loadAllMovies, getCachedAllMovies } = await freshLoader()
    const all = await loadAllMovies({ lightweight: false, full: false })
    expect(all).toHaveLength(10_000)
    expect(getCachedAllMovies()).toBe(all)
    const again = await loadAllMovies({ lightweight: true, full: false })
    expect(again).toBe(all)
    expect(requested.filter((url) => url.includes('films-'))).toHaveLength(5)
  })

  it('never asks for more chunks than exist', async () => {
    const { getCatalogChunkCount } = await freshLoader()
    expect(
      getCatalogChunkCount({ chunks: ['a'], chunkSize: 2000 }, true, false),
    ).toBe(1)
    expect(getCatalogChunkCount({ chunks: ['a', 'b', 'c'] }, true, false)).toBe(
      3,
    )
  })

  it('weights ratings over everything loaded', async () => {
    serve(2)
    const { loadAllMovies } = await freshLoader()
    const all = await loadAllMovies({ lightweight: false, full: false })
    expect(all[0].weightedRating).not.toBeNull()
  })

  it('loads overview, tagline and IMDb id from the right text chunk', async () => {
    const { requested } = serve(2)
    const { loadFirstChunk, loadMovieText, getCachedMovieText } =
      await freshLoader()
    const movies = await loadFirstChunk()
    const movie = movies[1203]
    expect(getCachedMovieText(movie)).toBeNull()
    const text = await loadMovieText(movie)
    expect(text).toEqual({
      overview: 'Overview 1204',
      tagline: 'Tagline 1204',
      imdbId: 'tt1204',
      originalTitle: '',
      originalLanguage: '',
      trailerKeys: [],
    })
    expect(requested).toContain('/json/catalog/text-2.abcd1234.json')
    expect(getCachedMovieText(movie)?.overview).toBe('Overview 1204')
  })

  it('reads the original title and trailer keys from version 3 text rows', async () => {
    serve(2, true)
    const { loadFirstChunk, loadMovieText } = await freshLoader()
    const movies = await loadFirstChunk()
    expect(await loadMovieText(movies[1203])).toEqual({
      overview: 'Overview 1204',
      tagline: 'Tagline 1204',
      imdbId: 'tt1204',
      originalTitle: 'Titre 1204',
      originalLanguage: 'fr',
      trailerKeys: ['abc12345', 'def67890'],
    })
  })

  it('classifies lightweight devices', async () => {
    const { isLightweightDevice } = await freshLoader()
    const desktop = { coarsePointer: false, narrowViewport: false }
    expect(isLightweightDevice(desktop)).toBe(false)
    expect(isLightweightDevice({ ...desktop, memoryGb: 8, cores: 8 })).toBe(
      false,
    )
    expect(
      isLightweightDevice({ coarsePointer: true, narrowViewport: true }),
    ).toBe(true)
    expect(isLightweightDevice({ ...desktop, memoryGb: 4 })).toBe(true)
    expect(isLightweightDevice({ ...desktop, cores: 4 })).toBe(true)
    expect(
      isLightweightDevice({ coarsePointer: true, narrowViewport: false }),
    ).toBe(false)
  })

  it('retries after a failed manifest request', async () => {
    const failing = vi.fn(async () => new Response('', { status: 500 }))
    vi.stubGlobal('fetch', failing)
    const { loadFirstChunk } = await freshLoader()
    await expect(loadFirstChunk()).rejects.toThrow(/500/)
    const { requested } = serve(1)
    await expect(loadFirstChunk()).resolves.toHaveLength(2000)
    expect(requested[0]).toBe('/json/catalog/manifest.json')
  })
})
