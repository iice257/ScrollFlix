// Packs a finished catalogue into the release asset:
//
//   catalog/   the public files (manifest.json and the hashed chunks)
//   state/     films.ndjson.gz and meta.json, for the next nightly run
//
//   node scripts/catalog/package.mjs --state <dir> --out <dir> [--file catalog.tar.gz]
//
// Uses the system `tar` (on ubuntu-latest and on Windows 10 and later). It
// is run inside a staging folder with relative names only, because GNU tar
// reads a "C:" in a path as a remote host.
import { spawnSync } from 'node:child_process'
import { cp, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const runTar = (args, cwd) => {
  const result = spawnSync('tar', args, { cwd, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    throw new Error(
      `tar ${args[0]} failed: ${result.error?.message ?? result.stderr}`.trim(),
    )
  }
}

export const packageCatalog = async ({ state, out, file }) => {
  const staging = await mkdtemp(join(tmpdir(), 'catalog-package-'))
  try {
    await cp(out, join(staging, 'catalog'), { recursive: true })
    await cp(state, join(staging, 'state'), { recursive: true })
    runTar(['-czf', 'catalog.tar.gz', 'catalog', 'state'], staging)
    await mkdir(resolve(file, '..'), { recursive: true })
    await copyFile(join(staging, 'catalog.tar.gz'), file)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  return file
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .map((arg, i, all) => (arg.startsWith('--') ? [arg.slice(2), all[i + 1]] : null))
      .filter(Boolean),
  )
  if (!args.state || !args.out) {
    console.error('Usage: package.mjs --state <dir> --out <dir> [--file <tar.gz>]')
    process.exit(2)
  }
  const file = await packageCatalog({
    state: args.state,
    out: args.out,
    file: resolve(args.file ?? 'catalog.tar.gz'),
  })
  console.log(`wrote ${file}`)
}
