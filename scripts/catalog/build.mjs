// Builds the film catalogue.
//
//   node scripts/catalog/build.mjs --mode seed|nightly|bootstrap
//        --state <dir> --out <dir> [--target 100000]
//
//   seed       the whole catalogue from TMDB: choose the vote threshold for
//              the target count, list every film above it, fetch details.
//   nightly    read the state, refetch only the films TMDB says changed plus
//              new releases, merge and rebuild.
//   bootstrap  no network: convert the repo's old data (public/json/0-4.json
//              and public/json/catalog, plus the local posters) into v2, to
//              publish a first release before the first seed.
//
// --state holds films.ndjson.gz and meta.json. --out receives the public
// files (manifest.json and the hashed chunks). Every mode ends by printing
// { count, minVotes, requests, failures }, and exits 1 rather than publish
// something half-built.
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { averageColour, colourOfImage } from './avg-colour.mjs'
import { createTmdbClient } from './tmdb-client.mjs'
import { encodeChunks, normaliseFilm } from './rows.mjs'
import { chooseMinVotes, discoverIds } from './seed.mjs'
import {
  fetchFilms,
  mergeChanges,
  readMeta,
  readState,
  writeState,
} from './state.mjs'

const FAILURE_LIMIT = 0.02
const SHRINK_LIMIT = 0.95
// TMDB answers /movie/changes for at most 14 days at a time.
const CHANGES_WINDOW_DAYS = 14
const DAY_MS = 86_400_000

export class CatalogAbort extends Error {}

export const isoDay = (date) => date.toISOString().slice(0, 10)

// [{ start, end }] segments from `lastSync` to `today`, each at most 14 days.
export const changeWindows = (lastSync, today) => {
  const windows = []
  let start = lastSync
  while (start < today) {
    const limit = isoDay(
      new Date(Date.parse(start) + CHANGES_WINDOW_DAYS * DAY_MS),
    )
    const end = limit < today ? limit : today
    windows.push({ start, end })
    start = end
  }
  return windows.length ? windows : [{ start: lastSync, end: today }]
}

const summarise = ({ count, minVotes, client, colour }) => {
  const tmdb = client?.stats() ?? { requests: 0, failures: 0 }
  return {
    count,
    minVotes,
    requests: tmdb.requests + (colour?.requests ?? 0),
    failures: tmdb.failures + (colour?.failures ?? 0),
  }
}

const assertHealthy = (summary, previousCount) => {
  if (summary.requests && summary.failures / summary.requests > FAILURE_LIMIT) {
    throw new CatalogAbort(
      `${summary.failures} of ${summary.requests} requests failed (over ${FAILURE_LIMIT * 100}%). Keeping the previous catalogue.`,
    )
  }
  if (previousCount && summary.count < previousCount * SHRINK_LIMIT) {
    throw new CatalogAbort(
      `The new catalogue has ${summary.count} films, under 95% of the previous ${previousCount}. Keeping the previous catalogue.`,
    )
  }
}

// Replaces the public output and the state. Called only once a run has
// passed its checks, so a failed run leaves the previous files alone.
const publish = async ({ films, meta, stateDir, outDir }) => {
  const { manifest, files } = encodeChunks([...films.values()])
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  for (const [name, content] of files) {
    await writeFile(join(outDir, name), content)
  }
  // The manifest goes last: it is what points at the files above.
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest))
  await writeState(stateDir, films, { ...meta, count: films.size, version: 2 })
}

export const runSeed = async ({
  client,
  colourOf,
  target = 100_000,
  stateDir,
  outDir,
  today = isoDay(new Date()),
  currentYear = new Date().getUTCFullYear(),
  log = () => {},
}) => {
  const prev = await readState(stateDir)
  const prevMeta = await readMeta(stateDir)
  const minVotes = await chooseMinVotes(client, target)
  log(`minVotes ${minVotes}`)
  const ids = [
    ...(await discoverIds(client, minVotes, { toYear: currentYear + 1 })),
  ].sort((a, b) => a - b)
  log(`${ids.length} candidate films`)
  const { changed, failedIds, colour } = await fetchFilms({
    client,
    ids,
    prev,
    colourOf,
    onProgress: (done, total) => log(`${done}/${total} details`),
  })
  const films = mergeChanges(new Map(), changed, minVotes)
  // A film that failed to fetch keeps what we knew about it.
  for (const id of failedIds) if (prev.has(id)) films.set(id, prev.get(id))
  const summary = summarise({ count: films.size, minVotes, client, colour })
  assertHealthy(summary, prevMeta?.bootstrap ? 0 : prevMeta?.count)
  await publish({
    films,
    meta: { lastSync: today, minVotes },
    stateDir,
    outDir,
  })
  return summary
}

export const runNightly = async ({
  client,
  colourOf,
  stateDir,
  outDir,
  today = isoDay(new Date()),
  currentYear = new Date().getUTCFullYear(),
  log = () => {},
}) => {
  const prev = await readState(stateDir)
  const meta = await readMeta(stateDir)
  if (!meta || !prev.size || meta.bootstrap) {
    throw new CatalogAbort(
      'There is no seeded state to update. Run the workflow with mode "seed" first.',
    )
  }
  const ids = new Set()
  for (const { start, end } of changeWindows(meta.lastSync, today)) {
    for (let page = 1, pages = 1; page <= pages; page += 1) {
      const changes = await client.changes(start, end, page)
      pages = changes.total_pages ?? 1
      for (const { id } of changes.results ?? []) if (prev.has(id)) ids.add(id)
    }
  }
  log(`${ids.size} known films changed since ${meta.lastSync}`)
  const recent = await discoverIds(client, meta.minVotes, {
    fromYear: currentYear - 1,
    toYear: currentYear + 1,
  })
  for (const id of recent) if (!prev.has(id)) ids.add(id)
  log(`${ids.size} films to refetch`)
  const { changed, colour } = await fetchFilms({
    client,
    ids: [...ids].sort((a, b) => a - b),
    prev,
    colourOf,
  })
  const films = mergeChanges(prev, changed, meta.minVotes)
  const summary = summarise({
    count: films.size,
    minVotes: meta.minVotes,
    client,
    colour,
  })
  assertHealthy(summary, meta.count)
  await publish({
    films,
    meta: { lastSync: today, minVotes: meta.minVotes },
    stateDir,
    outDir,
  })
  return summary
}

// Old local data -> TMDB-shaped details, so the same normaliser applies.
const detailsFromLocalRow = (row) => ({
  id: Number(row.id),
  title: row.title,
  release_date: `${String(row.release_year).trim()}-01-01`,
  vote_average: Number.parseFloat(row.vote_average),
  vote_count: row.vote_count,
  popularity: Number.parseFloat(row.popularity),
  runtime: row.runtime_minutes,
  genres: String(row.genres ?? '')
    .split(',')
    .map((name) => ({ name: name.trim() }))
    .filter((genre) => genre.name),
  production_countries: String(row.production_countries ?? '')
    .split(',')
    .slice(0, 1)
    .map((name) => ({ name: name.trim() }))
    .filter((country) => country.name),
  poster_path: row.poster_path,
  backdrop_path: row.backdrop_path,
  overview: row.overview,
  tagline: row.tagline,
  external_ids: { imdb_id: row.imdb_id },
})

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

export const runBootstrap = async ({
  root,
  stateDir,
  outDir,
  today = isoDay(new Date()),
}) => {
  const jsonDir = join(root, 'public/json')
  const postersDir = join(root, 'public/media/posters')
  const catalogDir = join(jsonDir, 'catalog')
  if (!existsSync(join(catalogDir, 'manifest.json'))) {
    throw new CatalogAbort(
      `No v1 catalogue in ${catalogDir}. Bootstrap converts the data this repo shipped before catalogue v2.`,
    )
  }
  const films = new Map()

  // The local tier: films with a poster file in the repo.
  const available = new Set(
    (await readJson(join(postersDir, 'availability.json'))).ids.map(String),
  )
  const localFiles = (await readdir(jsonDir))
    .filter((file) => /^\d+\.json$/.test(file))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  for (const file of localFiles) {
    for (const row of await readJson(join(jsonDir, file))) {
      if (!available.has(String(row.id))) continue
      const film = normaliseFilm(detailsFromLocalRow(row))
      if (!film || films.has(film.id)) continue
      film.avgColour = await colourOfImage(join(postersDir, `${row.id}.jpg`))
      films.set(film.id, film)
    }
  }

  // The v1 catalogue, with its separate text chunks.
  const manifest = await readJson(join(catalogDir, 'manifest.json'))
  const texts = []
  for (let chunk = 0; ; chunk += 1) {
    const path = join(catalogDir, `text-${chunk}.json`)
    if (!existsSync(path)) break
    texts.push(...(await readJson(path)))
  }
  let index = 0
  for (const file of manifest.chunks) {
    for (const row of await readJson(join(catalogDir, file))) {
      const [id, title, year, rating10, genres, country, poster, colour] = row
      const [overview = '', tagline = ''] = texts[index] ?? []
      index += 1
      const film = normaliseFilm({
        id,
        title,
        release_date: `${year}-01-01`,
        vote_average: rating10 / 10,
        vote_count: row[8],
        popularity: row[9] / 10,
        genres: genres.map((i) => ({ name: manifest.genres[i] })),
        production_countries: manifest.countries[country]
          ? [{ name: manifest.countries[country] }]
          : [],
        poster_path: `/${poster}.jpg`,
        overview,
        tagline,
      })
      if (!film || films.has(film.id)) continue
      film.avgColour = colour
      films.set(film.id, film)
    }
  }

  const minVotes = Math.min(...[...films.values()].map((f) => f.voteCount))
  // `bootstrap` marks this state as unfit for nightly merges: the first real
  // run must be a seed.
  await publish({
    films,
    meta: { lastSync: today, minVotes, bootstrap: true },
    stateDir,
    outDir,
  })
  return summarise({ count: films.size, minVotes })
}

const parseArgs = (argv) =>
  Object.fromEntries(
    argv
      .map((arg, i, all) => (arg.startsWith('--') ? [arg.slice(2), all[i + 1]] : null))
      .filter(Boolean),
  )

export const main = async (argv) => {
  const args = parseArgs(argv)
  const { mode, state: stateDir, out: outDir } = args
  if (!['seed', 'nightly', 'bootstrap'].includes(mode) || !stateDir || !outDir) {
    console.error(
      'Usage: build.mjs --mode seed|nightly|bootstrap --state <dir> --out <dir> [--target 100000]',
    )
    return 2
  }
  const log = (message) => console.error(`[catalog] ${message}`)
  try {
    let summary
    if (mode === 'bootstrap') {
      const root = fileURLToPath(new URL('../..', import.meta.url))
      summary = await runBootstrap({ root, stateDir, outDir })
    } else {
      const token = process.env.TMDB_API_READ_TOKEN
      if (!token) {
        throw new CatalogAbort('TMDB_API_READ_TOKEN is not set.')
      }
      const client = createTmdbClient({ token })
      const run = mode === 'seed' ? runSeed : runNightly
      summary = await run({
        client,
        colourOf: (posterPath) => averageColour(posterPath),
        target: Number(args.target ?? 100_000),
        stateDir,
        outDir,
        log,
      })
    }
    console.log(JSON.stringify(summary))
    return 0
  } catch (error) {
    console.error(
      error instanceof CatalogAbort ? error.message : (error?.stack ?? error),
    )
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)))
}
