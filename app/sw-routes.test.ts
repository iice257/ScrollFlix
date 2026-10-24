import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type Routes = {
  classify: (href: string, origin: string) => string
  strategyFor: (kind: string) => string
}

// public/sw.js is plain JS served as-is, so the test evaluates the real file.
const sandbox: { self: { __swRoutes?: Routes }; URL: typeof URL } = {
  self: {},
  URL,
}
runInNewContext(readFileSync('public/sw.js', 'utf8'), sandbox)
const routes = sandbox.self.__swRoutes as Routes
const ORIGIN = 'https://scrollflix.app'

describe('service worker routes', () => {
  it('classifies urls', () => {
    const cases: [string, string][] = [
      ['https://image.tmdb.org/t/p/w154/a.jpg', 'tmdb-image'],
      [`${ORIGIN}/json/catalog/manifest.json`, 'catalog-manifest'],
      [`${ORIGIN}/json/catalog/films-0.58c0dc1e.json`, 'catalog-hashed'],
      [`${ORIGIN}/assets/index.js`, 'other'],
      ['https://other.example/json/catalog/films-0.json', 'other'],
      ['not a url', 'other'],
    ]
    for (const [url, kind] of cases) {
      expect(routes.classify(url, ORIGIN)).toBe(kind)
    }
  })

  it('maps kinds to strategies', () => {
    expect(routes.strategyFor('tmdb-image')).toBe('cache-first')
    expect(routes.strategyFor('catalog-hashed')).toBe('cache-first')
    expect(routes.strategyFor('catalog-manifest')).toBe('network-first')
    expect(routes.strategyFor('other')).toBe('passthrough')
  })
})
