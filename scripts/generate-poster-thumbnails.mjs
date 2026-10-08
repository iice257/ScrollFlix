import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const DATASET_FILE_COUNT = 5
const POSTER_WIDTH = 192
const POSTER_HEIGHT = 288
const TMDB_POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w342'
const TMDB_BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w500'
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3'
const METAHUB_POSTER_BASE_URL = 'https://images.metahub.space/poster/medium'
const DEFAULT_CONCURRENCY = 12
const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 15000
const MIN_IMAGE_BYTES = 1000
const DEFAULT_CATALOG_LIMIT = 1080

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const datasetDirectory = join(projectRoot, 'public', 'json')
const legacyPosterDirectory = join(projectRoot, 'public', 'media', 'single')
const outputDirectory = join(projectRoot, 'public', 'media', 'posters')
const manifestPath = join(outputDirectory, 'manifest.json')
const availabilityPath = join(outputDirectory, 'availability.json')

const force = process.argv.includes('--force')
const localOnly = process.argv.includes('--local-only')
const optimizeExisting = process.argv.includes('--optimize-existing')
const tmdbApiReadToken = process.env.TMDB_API_READ_TOKEN?.trim()
const limitArgument = process.argv.find((argument) =>
  argument.startsWith('--limit='),
)
const catalogLimit = Math.max(
  1,
  Number.parseInt(limitArgument?.split('=')[1] ?? '', 10) ||
    DEFAULT_CATALOG_LIMIT,
)
const concurrencyArgument = process.argv.find((argument) =>
  argument.startsWith('--concurrency='),
)
const concurrency = Math.max(
  1,
  Number.parseInt(concurrencyArgument?.split('=')[1] ?? '', 10) ||
    DEFAULT_CONCURRENCY,
)

const loadCatalog = async () => {
  const batches = await Promise.all(
    Array.from({ length: DATASET_FILE_COUNT }, async (_, index) => {
      const source = await readFile(
        join(datasetDirectory, `${index}.json`),
        'utf8',
      )
      return JSON.parse(source)
    }),
  )

  const recordsById = new Map()
  for (const [catalogIndex, record] of batches.flat().entries()) {
    const id = String(record.id ?? '').trim()
    const posterPath = String(record.poster_path ?? '').trim()
    if (!id || recordsById.has(id)) continue
    recordsById.set(id, {
      backdropPath: String(record.backdrop_path ?? '').trim(),
      catalogIndex,
      id,
      imdbId: String(record.imdb_id ?? '').trim(),
      posterPath,
      title: String(record.title ?? '').trim(),
    })
  }

  return [...recordsById.values()].slice(0, catalogLimit)
}

const getExistingBytes = async (path) => {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

const normalizePoster = (image) =>
  sharp(image)
    .resize(POSTER_WIDTH, POSTER_HEIGHT, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 76 })
    .toBuffer()

const writePoster = async (destination, image) => {
  const temporaryPath = `${destination}.tmp`
  await writeFile(temporaryPath, image)
  await rm(destination, { force: true })
  await rename(temporaryPath, destination)
}

const refreshPosterPath = async (movieId) => {
  if (!tmdbApiReadToken) return ''

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${TMDB_API_BASE_URL}/movie/${movieId}`, {
      headers: {
        Authorization: `Bearer ${tmdbApiReadToken}`,
        'User-Agent': 'ScrollFlix poster asset generator',
      },
      signal: controller.signal,
    })
    if (!response.ok) return ''
    const movie = await response.json()
    return String(movie.poster_path ?? '').trim()
  } catch {
    return ''
  } finally {
    clearTimeout(timeout)
  }
}

const downloadPoster = async (record) => {
  const filename = `${record.id}.jpg`
  const destination = join(outputDirectory, filename)
  const existingBytes = await getExistingBytes(destination)
  if (optimizeExisting && existingBytes >= MIN_IMAGE_BYTES) {
    const image = await normalizePoster(await readFile(destination))
    await writePoster(destination, image)
    return { ...record, bytes: image.byteLength, filename, status: 'optimized' }
  }
  if (!force && existingBytes >= MIN_IMAGE_BYTES) {
    return { ...record, bytes: existingBytes, filename, status: 'existing' }
  }

  const legacyPath = join(
    legacyPosterDirectory,
    `${record.catalogIndex}.jpg`,
  )
  const legacyBytes = await getExistingBytes(legacyPath)
  if (!force && legacyBytes >= MIN_IMAGE_BYTES) {
    const image = await normalizePoster(await readFile(legacyPath))
    await writePoster(destination, image)
    return { ...record, bytes: image.byteLength, filename, status: 'migrated' }
  }

  if (!record.posterPath) {
    return { ...record, error: 'Missing poster path', filename, status: 'failed' }
  }

  if (localOnly) {
    return {
      ...record,
      error: 'Remote download skipped in local-only mode',
      filename,
      status: 'failed',
    }
  }

  let posterPath = record.posterPath
  let sourceUrl = `${TMDB_POSTER_BASE_URL}${posterPath}`
  let sourceKind = 'poster'
  let refreshedPosterPath = false
  let lastError = 'Unknown download error'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(sourceUrl, {
        headers: { 'User-Agent': 'ScrollFlix poster asset generator' },
        signal: controller.signal,
      })
      if (
        response.status === 404 &&
        sourceKind === 'poster' &&
        tmdbApiReadToken &&
        !refreshedPosterPath
      ) {
        refreshedPosterPath = true
        const currentPosterPath = await refreshPosterPath(record.id)
        if (currentPosterPath && currentPosterPath !== posterPath) {
          posterPath = currentPosterPath
          sourceUrl = `${TMDB_POSTER_BASE_URL}${posterPath}`
          continue
        }
      }
      if (
        response.status === 404 &&
        sourceKind === 'poster' &&
        record.backdropPath
      ) {
        sourceKind = 'backdrop'
        sourceUrl = `${TMDB_BACKDROP_BASE_URL}${record.backdropPath}`
        attempt = 0
        continue
      }
      if (
        response.status === 404 &&
        sourceKind === 'poster' &&
        record.imdbId
      ) {
        sourceKind = 'metahub'
        sourceUrl = `${METAHUB_POSTER_BASE_URL}/${encodeURIComponent(record.imdbId)}/img`
        attempt = 0
        continue
      }
      if (
        response.status === 404 &&
        sourceKind === 'backdrop' &&
        record.imdbId
      ) {
        sourceKind = 'metahub'
        sourceUrl = `${METAHUB_POSTER_BASE_URL}/${encodeURIComponent(record.imdbId)}/img`
        attempt = 0
        continue
      }
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`)
        error.retryable = response.status === 408 || response.status === 429
        throw error
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        throw new Error(`Unexpected content type: ${contentType || 'missing'}`)
      }

      const sourceImage = new Uint8Array(await response.arrayBuffer())
      if (sourceImage.byteLength < MIN_IMAGE_BYTES) {
        throw new Error(`Image is only ${sourceImage.byteLength} bytes`)
      }

      const image = await normalizePoster(sourceImage)
      await writePoster(destination, image)
      return {
        ...record,
        bytes: image.byteLength,
        filename,
        posterPath,
        sourceKind,
        sourceUrl,
        status: 'downloaded',
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (error instanceof Error && error.retryable === false) break
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 350))
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  return { ...record, error: lastError, filename, sourceUrl, status: 'failed' }
}

const run = async () => {
  await mkdir(outputDirectory, { recursive: true })
  const records = await loadCatalog()
  const results = new Array(records.length)
  let cursor = 0
  let completed = 0

  const worker = async () => {
    while (cursor < records.length) {
      const index = cursor
      cursor += 1
      results[index] = await downloadPoster(records[index])
      completed += 1
      if (completed % 25 === 0 || completed === records.length) {
        console.log(`Posters: ${completed}/${records.length}`)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, records.length) }, () => worker()),
  )

  const files = results
    .filter(({ status }) => status !== 'failed')
    .map(
      ({ bytes, filename, id, posterPath, sourceKind, status, title }) => ({
        bytes,
        filename,
        id,
        posterPath,
        sourceKind: sourceKind ?? 'poster',
        status,
        title,
        url: `/media/posters/${filename}`,
      }),
    )
  const failures = results
    .filter(({ status }) => status === 'failed')
    .map(({ error, id, posterPath, sourceUrl, title }) => ({
      error,
      id,
      posterPath,
      sourceUrl,
      title,
    }))
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
  const manifest = {
    attribution: 'Poster imagery supplied by TMDB and MetaHub.',
    catalogRecords: records.length,
    failed: failures.length,
    failures,
    files,
    generatedAt: new Date().toISOString(),
    imageFormat: 'jpg',
    posterHeight: POSTER_HEIGHT,
    posterWidth: POSTER_WIDTH,
    source: TMDB_POSTER_BASE_URL,
    successful: files.length,
    totalBytes,
    version: 2,
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(
    availabilityPath,
    `${JSON.stringify({ ids: files.map(({ id }) => id), version: 1 })}\n`,
  )
  console.log(
    `Poster manifest: ${files.length}/${records.length} images, ${(
      totalBytes /
      1024 /
      1024
    ).toFixed(1)} MiB`,
  )

  if (failures.length && !localOnly) {
    console.error(
      `Failed poster IDs: ${failures.map(({ id }) => id).join(', ')}`,
    )
    process.exitCode = 1
  }
}

await run()
