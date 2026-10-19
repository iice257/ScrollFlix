import { existsSync } from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { packageCatalog } from './package.mjs'
import { pullCatalog } from './pull.mjs'

let work
let archive
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'catalog-pull-'))
  // A release asset built the way the workflow builds it.
  const state = join(work, 'src/state')
  const out = join(work, 'src/out')
  await mkdir(state, { recursive: true })
  await mkdir(out, { recursive: true })
  await writeFile(join(state, 'meta.json'), '{"lastSync":"2026-10-18"}')
  await writeFile(join(state, 'films.ndjson.gz'), 'state-bytes')
  await writeFile(join(out, 'manifest.json'), '{"version":2,"count":1}')
  await writeFile(join(out, 'films-0.aaaaaaaa.json'), '[[1,"Film"]]')
  archive = join(work, 'catalog.tar.gz')
  await packageCatalog({ state, out, file: archive })
})
afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

const fromArchive = async (_url, file) => copyFile(archive, file)
const offline = async () => {
  throw new Error('getaddrinfo ENOTFOUND github.com')
}
const quiet = () => {}

describe('pullCatalog', () => {
  it('extracts catalog into dest', async () => {
    const dest = join(work, 'public/json/catalog')
    await pullCatalog({ dest, download: fromArchive, log: quiet })
    expect(JSON.parse(await readFile(join(dest, 'manifest.json'), 'utf8'))).toEqual(
      { version: 2, count: 1 },
    )
    expect(await readFile(join(dest, 'films-0.aaaaaaaa.json'), 'utf8')).toBe(
      '[[1,"Film"]]',
    )
    // No leftovers next to it.
    expect(await readdir(join(work, 'public/json'))).toEqual(['catalog'])
  })

  it('replaces the previous catalogue, including stale hashed files', async () => {
    const dest = join(work, 'public/json/catalog')
    await mkdir(dest, { recursive: true })
    await writeFile(join(dest, 'films-0.stale000.json'), 'old')
    await pullCatalog({ dest, download: fromArchive, log: quiet })
    expect(existsSync(join(dest, 'films-0.stale000.json'))).toBe(false)
    expect(existsSync(join(dest, 'manifest.json'))).toBe(true)
  })

  it('offline keeps existing', async () => {
    const dest = join(work, 'public/json/catalog')
    await mkdir(dest, { recursive: true })
    await writeFile(join(dest, 'manifest.json'), '{"kept":true}')
    const warnings = []
    await expect(
      pullCatalog({ dest, download: offline, log: (m) => warnings.push(m) }),
    ).resolves.toMatchObject({ pulled: false })
    expect(await readFile(join(dest, 'manifest.json'), 'utf8')).toBe(
      '{"kept":true}',
    )
    expect(warnings.join(' ')).toMatch(/keeping the catalogue already/i)
  })

  it('offline with nothing fails', async () => {
    const dest = join(work, 'public/json/catalog')
    await expect(
      pullCatalog({ dest, download: offline, log: quiet }),
    ).rejects.toThrow(/no catalogue/i)
  })

  it('a missing release (404) behaves like offline', async () => {
    const dest = join(work, 'public/json/catalog')
    const notFound = async () => {
      throw new Error('Download failed: 404')
    }
    await expect(
      pullCatalog({ dest, download: notFound, log: quiet }),
    ).rejects.toThrow(/no catalogue/i)
  })

  it('a broken archive keeps the existing catalogue', async () => {
    const dest = join(work, 'public/json/catalog')
    await mkdir(dest, { recursive: true })
    await writeFile(join(dest, 'manifest.json'), '{"kept":true}')
    const broken = async (_url, file) => writeFile(file, 'not a tarball')
    const result = await pullCatalog({ dest, download: broken, log: quiet })
    expect(result.pulled).toBe(false)
    expect(await readFile(join(dest, 'manifest.json'), 'utf8')).toBe(
      '{"kept":true}',
    )
  })

  it('with-state extracts state', async () => {
    const dest = join(work, 'out')
    const withState = join(work, 'state')
    await pullCatalog({ dest, withState, download: fromArchive, log: quiet })
    expect(await readFile(join(withState, 'films.ndjson.gz'), 'utf8')).toBe(
      'state-bytes',
    )
    expect(existsSync(join(dest, 'manifest.json'))).toBe(true)
  })

  it('does nothing when CATALOG_SKIP_PULL=1', async () => {
    const dest = join(work, 'public/json/catalog')
    const result = await pullCatalog({
      dest,
      download: fromArchive,
      env: { CATALOG_SKIP_PULL: '1' },
      log: quiet,
    })
    expect(result.pulled).toBe(false)
    expect(existsSync(dest)).toBe(false)
  })
})
