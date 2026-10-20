// The pipeline's memory between runs: every film in full (with overview and
// average colour) as gzipped NDJSON, plus a small meta file. The nightly run
// reads it, refetches only what changed, and writes it back.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { mapPool } from './pool.mjs'
import { normaliseFilm } from './rows.mjs'

const FILMS_FILE = 'films.ndjson.gz'
const META_FILE = 'meta.json'

export const readState = async (dir) => {
  const path = join(dir, FILMS_FILE)
  const films = new Map()
  if (!existsSync(path)) return films
  const text = gunzipSync(await readFile(path)).toString('utf8')
  for (const line of text.split('\n')) {
    if (!line) continue
    const film = JSON.parse(line)
    films.set(film.id, film)
  }
  return films
}

export const readMeta = async (dir) => {
  const path = join(dir, META_FILE)
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, 'utf8'))
}

// Films are written ordered by id, so the same catalogue always produces the
// same bytes.
export const writeState = async (dir, films, meta) => {
  await mkdir(dir, { recursive: true })
  const lines = [...films.values()]
    .sort((a, b) => a.id - b.id)
    .map((film) => JSON.stringify(film))
  await writeFile(
    join(dir, FILMS_FILE),
    gzipSync(`${lines.join('\n')}\n`, { level: 9 }),
  )
  await writeFile(join(dir, META_FILE), `${JSON.stringify(meta)}\n`)
}

// Applies refreshed films to the previous state. A null entry (gone from
// TMDB, or no longer has a poster) removes the film, and so does a vote count
// under `minVotes`. A refreshed film without a colour keeps the old one while
// its poster is unchanged, so nightly runs do not refetch posters.
export const mergeChanges = (prev, changed, minVotes) => {
  const next = new Map(prev)
  for (const [id, film] of changed) {
    if (!film || film.voteCount < minVotes) {
      next.delete(id)
      continue
    }
    const old = prev.get(id)
    const avgColour =
      film.avgColour ||
      (old && old.posterPath === film.posterPath ? old.avgColour : undefined)
    next.set(id, avgColour ? { ...film, avgColour } : { ...film })
  }
  return next
}

// Fetches details for `ids` and resolves them to films ready to merge:
//   changed:   id -> film, or null when it must drop (404, no poster or year,
//              or the poster file is gone). Ids that failed to fetch are not
//              in here, so a flaky night never deletes a film.
//   failedIds: the ids that could not be fetched.
//   colour:    { requests, failures } for the poster downloads.
export const fetchFilms = async ({
  client,
  ids,
  prev,
  colourOf,
  concurrency = 24,
  onProgress,
}) => {
  const changed = new Map()
  const failedIds = []
  const colour = { requests: 0, failures: 0 }
  let done = 0
  await mapPool(ids, concurrency, async (id) => {
    try {
      let film = null
      let details
      try {
        details = await client.movie(id)
      } catch {
        failedIds.push(id)
        return
      }
      film = normaliseFilm(details)
      if (film) {
        const old = prev.get(id)
        if (old?.avgColour && old.posterPath === film.posterPath) {
          film.avgColour = old.avgColour
        } else {
          colour.requests += 1
          try {
            const avgColour = await colourOf(film.posterPath)
            if (avgColour) film.avgColour = avgColour
            else film = null
          } catch {
            colour.failures += 1
            failedIds.push(id)
            return
          }
        }
      }
      changed.set(id, film)
    } finally {
      done += 1
      if (onProgress && done % 1000 === 0) onProgress(done, ids.length)
    }
  })
  return { changed, failedIds, colour }
}
