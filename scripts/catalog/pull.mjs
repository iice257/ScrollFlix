// Downloads the published catalogue (the GitHub Release asset built by the
// catalog workflow) into public/json/catalog before a build.
//
//   node scripts/catalog/pull.mjs [--dest public/json/catalog] [--with-state <dir>]
//
// The repository is public, so no token is needed. The new catalogue is
// extracted next to the destination and swapped in with a rename, so a
// failed pull never leaves a half-written folder.
//
// If the download fails (offline, GitHub down, no release yet) and a
// catalogue is already on disk, it warns and carries on. With nothing on
// disk it fails with a clear message. CATALOG_SKIP_PULL=1 skips the pull.
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import { runTar } from './package.mjs'

export const CATALOG_RELEASE_URL =
  'https://github.com/iice257/ScrollFlix/releases/download/catalog-latest/catalog.tar.gz'
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000

export const downloadFile = async (url, file) => {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  })
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${url}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file))
}

// Replaces `target` with `source` (same filesystem), keeping the old one
// until the new one is in place.
const swap = async (source, target) => {
  const old = `${target}.old-${process.pid}`
  await rm(old, { recursive: true, force: true })
  if (existsSync(target)) await rename(target, old)
  await rename(source, target)
  await rm(old, { recursive: true, force: true })
}

export const pullCatalog = async ({
  url = CATALOG_RELEASE_URL,
  dest = 'public/json/catalog',
  withState,
  download = downloadFile,
  env = process.env,
  log = console.warn,
} = {}) => {
  if (env.CATALOG_SKIP_PULL === '1') {
    log('[catalog] CATALOG_SKIP_PULL=1, not pulling.')
    return { pulled: false }
  }
  const target = resolve(dest)
  await mkdir(dirname(target), { recursive: true })
  // Next to the destination, so the final move is a rename.
  const work = `${target}.pull-${process.pid}`
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })
  try {
    const archive = join(work, 'catalog.tar.gz')
    await download(url, archive)
    runTar(['-xzf', basename(archive)], work)
    if (!existsSync(join(work, 'catalog', 'manifest.json'))) {
      throw new Error('The archive has no catalog/manifest.json')
    }
    if (withState) {
      if (!existsSync(join(work, 'state'))) {
        throw new Error('The archive has no state/ folder')
      }
      const stateTarget = resolve(withState)
      await mkdir(dirname(stateTarget), { recursive: true })
      await swap(join(work, 'state'), stateTarget)
    }
    await swap(join(work, 'catalog'), target)
    return { pulled: true }
  } catch (error) {
    if (existsSync(join(target, 'manifest.json'))) {
      log(
        `[catalog] Could not pull the latest catalogue (${error.message}). Keeping the catalogue already in ${dest}.`,
      )
      return { pulled: false }
    }
    throw new Error(
      `No catalogue in ${dest} and the latest could not be pulled (${error.message}). Publish one first with the "catalog" workflow, or build one with "npm run catalog:build -- --mode bootstrap".`,
    )
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .map((arg, i, all) => (arg.startsWith('--') ? [arg.slice(2), all[i + 1]] : null))
      .filter(Boolean),
  )
  try {
    const { pulled } = await pullCatalog({
      dest: args.dest,
      withState: args['with-state'],
    })
    if (pulled) console.log(`[catalog] Pulled the latest catalogue into ${args.dest ?? 'public/json/catalog'}.`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
