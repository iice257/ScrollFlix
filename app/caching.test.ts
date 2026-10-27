import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type HeaderRule = {
  source: string
  headers: { key: string; value: string }[]
}

const rules = (
  JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: HeaderRule[] }
).headers

// The Cache-Control a path gets (Vercel's source patterns are regexes here).
const cacheControlFor = (path: string) =>
  rules
    .filter((rule) => new RegExp(`^${rule.source}$`).test(path))
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Cache-Control')?.value

describe('cache headers', () => {
  it("keeps the build's hashed files for a year", () => {
    expect(cacheControlFor('/assets/app-Vq6Ge2FU.js')).toContain('immutable')
    expect(cacheControlFor('/assets/mood-page-BlDUIiyC.js')).toContain(
      'immutable',
    )
  })

  it('never freezes an unhashed file in /assets', () => {
    expect(cacheControlFor('/assets/noise.png')).toBeUndefined()
    expect(cacheControlFor('/assets/rust.jpg')).toBeUndefined()
  })

  it('revalidates the catalogue manifest and the service worker', () => {
    expect(cacheControlFor('/json/catalog/manifest.json')).toContain(
      'max-age=0',
    )
    expect(cacheControlFor('/sw.js')).toContain('max-age=0')
  })
})
