import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// TMDB answers a plain (no-CORS) image request without CORS headers and lets
// browsers cache that copy for a year. A later CORS request for the same URL
// (the globe's WebGL textures, the card's poster) then fails against the
// cached copy: a broken image, a colour fill, a poster missing from the
// globe. So every <img> asks with CORS, and nothing draws a poster as a CSS
// background unless its URL is one nothing else requests.

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })

const imgTags = (source: string) =>
  [...source.matchAll(/<img\b[\s\S]*?\/>/g)].map((match) => match[0])

describe('poster images are always fetched with CORS', () => {
  const files = sources('app')

  it('every <img> sets crossOrigin', () => {
    const missing = files.flatMap((file) =>
      imgTags(readFileSync(file, 'utf8'))
        .filter((tag) => !/crossOrigin=/.test(tag))
        .map((tag) => `${file}: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`),
    )
    expect(missing).toEqual([])
  })

  it('no component draws a poster as a CSS background image', () => {
    const offenders = files.filter((file) =>
      /backgroundImage:[^\n]*poster/i.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
