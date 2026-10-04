// Builds the extended film catalogue in public/json/catalog/ from the
// original Nothing to Watch dataset (ntw-assets.port80.ch/json/{n}.json).
//
// The 1,056 films in public/json/*.json keep their local posters and sprite.
// Everything else here is compact: one row per film, with posters served from
// TMDB's image CDN and an average colour for the placeholder. Overviews and
// taglines live in small separate chunks that load only when a film is opened.
//
// Usage:
//   node scripts/build-catalog.mjs --batches <dir> --posters <dir> [--total 20000] [--offline 1]
//
// --batches holds the raw dataset batches as {n}.json; missing ones are
// downloaded. --posters holds w92 posters as {tmdbId}.jpg (also downloaded
// when missing). A poster that cannot be fetched drops its film, so the
// catalogue never ships a known-dead image.
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg, index, all) =>
      arg.startsWith('--') ? [arg.slice(2), all[index + 1]] : null,
    )
    .filter(Boolean),
)
const batchDir = args.batches
const posterDir = args.posters
const TOTAL = Number(args.total ?? 20000)
// --offline 1: use only what is already cached, never the network.
const offline = Boolean(args.offline)
const ROWS_PER_CHUNK = 5000
const TEXT_ROWS_PER_CHUNK = 500
const DATASET_URL = 'https://ntw-assets.port80.ch/json'
const POSTER_PROBE_URL = 'https://image.tmdb.org/t/p/w92'
const outDir = join(root, 'public/json/catalog')

if (!batchDir || !posterDir) {
  console.error('Usage: build-catalog.mjs --batches <dir> --posters <dir>')
  process.exit(1)
}
await mkdir(batchDir, { recursive: true })
await mkdir(posterDir, { recursive: true })

const fetchWithRetry = async (url, attempts = 4) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      if (attempt >= attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
    }
  }
}

const readBatch = async (n) => {
  const path = join(batchDir, `${n}.json`)
  if (!existsSync(path)) {
    if (offline) return null
    const body = await fetchWithRetry(`${DATASET_URL}/${n}.json`)
    if (!body || body[0] !== 0x5b) return null // past the last batch
    await writeFile(path, body)
  }
  const text = await readFile(path, 'utf8')
  return text.startsWith('[') ? JSON.parse(text) : null
}

// The local catalogue: these films are already shipped with their own posters.
const localIds = new Set()
for (const file of await readdir(join(root, 'public/json'))) {
  if (!/^\d+\.json$/.test(file)) continue
  const rows = JSON.parse(await readFile(join(root, 'public/json', file), 'utf8'))
  for (const row of rows) localIds.add(String(row.id))
}

const clean = (value) => String(value ?? '').trim()
const year = (row) => Number.parseInt(clean(row.release_year), 10) || 0

// Collect candidates in dataset order (most-voted first), a little over the
// target so films with dead posters can be dropped without falling short.
const wanted = Math.round((TOTAL - 1056) * 1.04)
const seen = new Set(localIds)
const candidates = []
for (let n = 0; candidates.length < wanted; n += 1) {
  const batch = await readBatch(n)
  if (!batch) break
  for (const row of batch) {
    const id = clean(row.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (!clean(row.title) || !/^\/\w+\.jpg$/.test(clean(row.poster_path))) continue
    if (!year(row)) continue
    candidates.push(row)
  }
}
console.log(`candidates: ${candidates.length}`)

// Probe each poster (w92, a few KB) and take its average colour.
const averageColour = async (row) => {
  const path = join(posterDir, `${row.id}.jpg`)
  if (!existsSync(path)) {
    if (offline) return null
    const body = await fetchWithRetry(`${POSTER_PROBE_URL}${row.poster_path}`).catch(
      () => null,
    )
    if (!body) return null
    await writeFile(path, body)
  }
  try {
    const { data } = await sharp(path)
      .resize(1, 1, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    return [...data.subarray(0, 3)]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

const colours = new Array(candidates.length)
let cursor = 0
await Promise.all(
  Array.from({ length: 24 }, async () => {
    while (cursor < candidates.length) {
      const index = cursor
      cursor += 1
      colours[index] = await averageColour(candidates[index])
    }
  }),
)

const extras = candidates
  .map((row, index) => ({ row, colour: colours[index] }))
  .filter(({ colour }) => colour)
  .slice(0, TOTAL - 1056)
console.log(
  `kept: ${extras.length} (dropped ${candidates.length - colours.filter(Boolean).length} dead posters)`,
)

// Genre and country names repeat on almost every row, so rows hold indices
// into tables kept in the manifest.
const genreTable = []
const countryTable = []
const tableIndex = (table, value) => {
  if (!value) return -1
  let index = table.indexOf(value)
  if (index < 0) index = table.push(value) - 1
  return index
}

// Rows: [tmdbId, title, year, rating x10, genre indices, country index,
// poster path, colour]
const toRow = ({ row, colour }) => [
  Number(row.id),
  clean(row.title),
  year(row),
  Math.round((Number.parseFloat(row.vote_average) || 0) * 10),
  clean(row.genres)
    .split(',')
    .map((genre) => genre.trim())
    .filter(Boolean)
    .map((genre) => tableIndex(genreTable, genre)),
  tableIndex(countryTable, clean(row.production_countries).split(',')[0]?.trim()),
  clean(row.poster_path).slice(1, -4),
  colour,
]
const toText = ({ row }) => [clean(row.overview), clean(row.tagline)]

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const chunks = []
for (let start = 0; start < extras.length; start += ROWS_PER_CHUNK) {
  const file = `films-${chunks.length}.json`
  chunks.push(file)
  await writeFile(
    join(outDir, file),
    JSON.stringify(extras.slice(start, start + ROWS_PER_CHUNK).map(toRow)),
  )
}
let textChunks = 0
for (let start = 0; start < extras.length; start += TEXT_ROWS_PER_CHUNK) {
  await writeFile(
    join(outDir, `text-${textChunks}.json`),
    JSON.stringify(extras.slice(start, start + TEXT_ROWS_PER_CHUNK).map(toText)),
  )
  textChunks += 1
}
await writeFile(
  join(outDir, 'manifest.json'),
  JSON.stringify({
    count: extras.length,
    chunks,
    countries: countryTable,
    genres: genreTable,
    textChunkSize: TEXT_ROWS_PER_CHUNK,
  }),
)
console.log(`catalog: ${extras.length} films in ${chunks.length} chunks`)
