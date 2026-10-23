import { describe, expect, it } from 'vitest'
import {
  decodeRow,
  decodeText,
  encodeChunks,
  normaliseFilm,
  rankTrailers,
} from './rows.mjs'

const film = (id, extra = {}) => ({
  id,
  title: `Film ${id}`,
  year: 2000 + (id % 20),
  rating10: 70 + (id % 20),
  genres: id % 2 ? ['Drama', 'Comedy'] : ['Drama'],
  country: id % 3 ? 'France' : 'Japan',
  posterPath: `poster${id}`,
  backdropPath: `back${id}`,
  voteCount: 1000 - id,
  popularity10: 100 + id,
  runtime: 90 + (id % 40),
  overview: `Overview ${id}`,
  tagline: `Tagline ${id}`,
  imdbId: `tt${String(id).padStart(7, '0')}`,
  avgColour: 'a1b2c3',
  originalTitle: '',
  originalLanguage: 'en',
  trailers: [],
  ...extra,
})

const fixedAt = { generatedAt: '2026-10-18T03:00:00.000Z' }

const decodeAll = ({ manifest, files }) => {
  const films = []
  for (const name of manifest.chunks) {
    for (const row of JSON.parse(files.get(name))) {
      films.push(decodeRow(row, manifest))
    }
  }
  let index = 0
  for (const name of manifest.texts) {
    for (const row of JSON.parse(files.get(name))) {
      Object.assign(films[index], decodeText(row))
      index += 1
    }
  }
  return films
}

describe('normaliseFilm', () => {
  const details = {
    id: 27205,
    title: ' Inception ',
    release_date: '2010-07-15',
    vote_average: 8.369,
    vote_count: 38000,
    popularity: 29.108,
    runtime: 148,
    genres: [{ id: 28, name: 'Action' }],
    production_countries: [{ iso_3166_1: 'GB', name: 'United Kingdom' }],
    poster_path: '/qmDpIHrmpJINaRKAfWQfftjCdyi.jpg',
    backdrop_path: '/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
    overview: 'Dreams.',
    tagline: 'Your mind is the scene of the crime.',
    external_ids: { imdb_id: 'tt1375666' },
  }

  it('maps TMDB details to a film', () => {
    expect(normaliseFilm(details)).toEqual({
      id: 27205,
      title: 'Inception',
      year: 2010,
      rating10: 84,
      genres: ['Action'],
      country: 'United Kingdom',
      posterPath: 'qmDpIHrmpJINaRKAfWQfftjCdyi',
      backdropPath: '8ZTVqvKDQ8emSGUEMjsS4yHAwrp',
      voteCount: 38000,
      popularity10: 291,
      runtime: 148,
      overview: 'Dreams.',
      tagline: 'Your mind is the scene of the crime.',
      imdbId: 'tt1375666',
      originalTitle: '',
      originalLanguage: '',
      trailers: [],
    })
  })

  it('keeps the original title only when it differs from the title', () => {
    const base = { ...details, original_language: 'fr' }
    expect(
      normaliseFilm({ ...base, title: 'Amelie', original_title: 'Amélie' })
        .originalTitle,
    ).toBe('')
    expect(
      normaliseFilm({ ...base, title: 'Inception', original_title: 'INCEPTION' })
        .originalTitle,
    ).toBe('')
    const spirited = normaliseFilm({
      ...base,
      title: 'Spirited Away',
      original_title: ' 千と千尋の神隠し ',
      original_language: 'ja',
    })
    expect(spirited.originalTitle).toBe('千と千尋の神隠し')
    expect(spirited.originalLanguage).toBe('ja')
  })

  it('stores the ranked trailer keys', () => {
    const film = normaliseFilm({
      ...details,
      videos: {
        results: [
          { site: 'YouTube', key: 'teaserKey1', type: 'Teaser' },
          { site: 'YouTube', key: 'trailerKey', type: 'Trailer' },
        ],
      },
    })
    expect(film.trailers).toEqual(['trailerKey', 'teaserKey1'])
  })

  it('returns null without a poster or a year', () => {
    expect(normaliseFilm({ ...details, poster_path: null })).toBeNull()
    expect(normaliseFilm({ ...details, release_date: '' })).toBeNull()
    expect(normaliseFilm({ ...details, title: '  ' })).toBeNull()
    expect(normaliseFilm(null)).toBeNull()
  })

  it('tolerates missing optional fields', () => {
    const bare = normaliseFilm({
      id: 1,
      title: 'Bare',
      release_date: '1999-01-01',
      poster_path: '/a.jpg',
    })
    expect(bare).toMatchObject({
      backdropPath: '',
      runtime: 0,
      imdbId: '',
      country: '',
      genres: [],
      rating10: 0,
      voteCount: 0,
      trailers: [],
    })
  })
})

const video = (key, extra = {}) => ({
  site: 'YouTube',
  type: 'Trailer',
  official: true,
  iso_639_1: 'en',
  published_at: '2020-01-01T00:00:00.000Z',
  key,
  ...extra,
})

describe('rankTrailers', () => {
  it('puts the official English trailer first and teasers last', () => {
    const keys = rankTrailers([
      video('teaser0001', { type: 'Teaser' }),
      video('unofficial', { official: false }),
      video('frenchtrl1', { iso_639_1: 'fr' }),
      video('officialen'),
    ])
    expect(keys).toEqual(['officialen', 'frenchtrl1', 'unofficial'])
  })

  it('prefers the newest when everything else is equal', () => {
    const keys = rankTrailers([
      video('olderkey01', { published_at: '2015-01-01T00:00:00.000Z' }),
      video('newerkey01', { published_at: '2021-01-01T00:00:00.000Z' }),
    ])
    expect(keys).toEqual(['newerkey01', 'olderkey01'])
  })

  it('drops other sites, other types, bad keys and repeats', () => {
    const keys = rankTrailers([
      video('vimeokey01', { site: 'Vimeo' }),
      video('cliptype01', { type: 'Clip' }),
      video('featurette', { type: 'Featurette' }),
      video('x'),
      video('has space!!'),
      video('goodkey001'),
      video('goodkey001'),
    ])
    expect(keys).toEqual(['goodkey001'])
  })

  it('keeps at most three and copes with nothing', () => {
    const many = ['aaaaaaaa1', 'aaaaaaaa2', 'aaaaaaaa3', 'aaaaaaaa4'].map((k) =>
      video(k),
    )
    expect(rankTrailers(many)).toHaveLength(3)
    expect(rankTrailers(undefined)).toEqual([])
    expect(rankTrailers([])).toEqual([])
  })
})

describe('rows', () => {
  it('round trip: encode then decode gives the input', () => {
    const films = [film(1), film(2), film(3), film(4)]
    const decoded = decodeAll(encodeChunks(films, fixedAt))
    expect(decoded).toEqual(
      [...films].sort((a, b) => b.voteCount - a.voteCount || a.id - b.id),
    )
  })

  it('orders most-voted first, ties by id', () => {
    const films = [
      film(5, { voteCount: 10 }),
      film(3, { voteCount: 10 }),
      film(9, { voteCount: 99 }),
    ]
    const { manifest, files } = encodeChunks(films, fixedAt)
    const rows = JSON.parse(files.get(manifest.chunks[0]))
    expect(rows.map((row) => row[0])).toEqual([9, 3, 5])
  })

  it('unicode round trip: emoji, Arabic and quotes survive', () => {
    const films = [
      film(1, {
        title: 'Cinema 🎬 "Quoted" \\ back',
        overview: 'مرحبا بالعالم — “smart quotes” and \n newline ✨',
        tagline: "O'Brien's 🇯🇵 日本語",
      }),
    ]
    const [out] = decodeAll(encodeChunks(films, fixedAt))
    expect(out.title).toBe(films[0].title)
    expect(out.overview).toBe(films[0].overview)
    expect(out.tagline).toBe(films[0].tagline)
  })

  it('hashed names: same input same names, a changed row changes only its chunk', () => {
    const films = Array.from({ length: 10 }, (_, index) => film(index + 1))
    const opts = { ...fixedAt, rowsPerChunk: 4, textRowsPerChunk: 4 }
    const first = encodeChunks(films, opts)
    const again = encodeChunks(films, opts)
    expect(again.manifest).toEqual(first.manifest)
    expect(first.manifest.chunks).toHaveLength(3)
    expect(first.manifest.chunks[0]).toMatch(/^films-0\.[0-9a-f]{8}\.json$/)
    expect(first.manifest.texts[0]).toMatch(/^text-0\.[0-9a-f]{8}\.json$/)

    // Film 10 sits in the last chunk (lowest vote count).
    const changed = films.map((entry) =>
      entry.id === 10 ? { ...entry, title: 'Renamed' } : entry,
    )
    const next = encodeChunks(changed, opts)
    expect(next.manifest.chunks.slice(0, 2)).toEqual(
      first.manifest.chunks.slice(0, 2),
    )
    expect(next.manifest.chunks[2]).not.toBe(first.manifest.chunks[2])
    expect(next.manifest.texts).toEqual(first.manifest.texts)
  })

  it("empty backdrop → ''", () => {
    const { manifest, files } = encodeChunks(
      [film(1, { backdropPath: '', runtime: 0, avgColour: undefined })],
      fixedAt,
    )
    const [row] = JSON.parse(files.get(manifest.chunks[0]))
    expect(row[7]).toBe('')
    expect(row[8]).toBe('')
    expect(row[11]).toBe(0)
  })

  it('builds the v2 manifest with frequency-sorted tables', () => {
    const films = [film(1), film(2), film(3)]
    const { manifest } = encodeChunks(films, fixedAt)
    expect(manifest).toMatchObject({
      version: 3,
      count: 3,
      chunkSize: 2000,
      textChunkSize: 500,
      generatedAt: fixedAt.generatedAt,
    })
    expect(manifest.genres[0]).toBe('Drama')
    expect(manifest.countries[0]).toBe('France')
  })

  it('decodes old three-field text rows as films without the new fields', () => {
    expect(decodeText(['Overview', 'Tagline', 'tt1'])).toEqual({
      overview: 'Overview',
      tagline: 'Tagline',
      imdbId: 'tt1',
      originalTitle: '',
      originalLanguage: '',
      trailers: [],
    })
  })

  it('round-trips original title and trailers, and writes them as one string', () => {
    const films = [
      film(1, {
        originalTitle: '千と千尋の神隠し',
        originalLanguage: 'ja',
        trailers: ['abc12345', 'def67890'],
      }),
    ]
    const encoded = encodeChunks(films, fixedAt)
    const [text] = JSON.parse(encoded.files.get(encoded.manifest.texts[0]))
    expect(text.slice(3)).toEqual([
      '千と千尋の神隠し',
      'ja',
      'abc12345 def67890',
    ])
    expect(decodeAll(encoded)).toEqual(films)
  })

  it('encodes films from an old state, with no new fields, without crashing', () => {
    const { originalTitle, originalLanguage, trailers, ...old } = film(1)
    const encoded = encodeChunks([old], fixedAt)
    const [text] = JSON.parse(encoded.files.get(encoded.manifest.texts[0]))
    expect(text).toEqual(['Overview 1', 'Tagline 1', 'tt0000001', '', '', ''])
  })

  it('row layout matches the spec', () => {
    const { manifest, files } = encodeChunks([film(1)], fixedAt)
    const [row] = JSON.parse(files.get(manifest.chunks[0]))
    expect(row).toEqual([
      1,
      'Film 1',
      2001,
      71,
      // Equal counts sort A to Z: Comedy is 0, Drama is 1.
      [1, 0],
      0,
      'poster1',
      'back1',
      'a1b2c3',
      999,
      101,
      91,
    ])
    const [text] = JSON.parse(files.get(manifest.texts[0]))
    expect(text).toEqual(['Overview 1', 'Tagline 1', 'tt0000001', '', 'en', ''])
  })
})
