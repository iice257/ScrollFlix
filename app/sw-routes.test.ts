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

type Handlers = {
  cacheFirst: (
    request: string,
    name: string,
    limit: boolean,
  ) => Promise<{ ok: boolean }>
  networkFirst: (request: string, name: string) => Promise<{ status: number }>
}

// A Cache Storage stand-in: insertion-ordered, like the real one's keys().
const fakeCaches = () => {
  const stores = new Map<string, Map<string, unknown>>()
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, unknown>()
    stores.set(name, store)
    return {
      match: async (key: string) => store.get(key),
      put: async (key: string, value: unknown) => {
        store.set(key, value)
      },
      keys: async () => [...store.keys()],
      delete: async (key: string) => store.delete(key),
    }
  }
  return { open, stores }
}

const load = (fetcher: (request: string) => Promise<unknown>) => {
  const fake = fakeCaches()
  const box: { self: { __swRoutes?: Handlers } } = { self: {} }
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    ...box,
    URL,
    caches: fake,
    fetch: fetcher,
    setTimeout,
  })
  return { handlers: box.self.__swRoutes as Handlers, fake }
}

const okResponse = (body: string) => ({
  ok: true,
  type: 'cors',
  status: 200,
  body,
  clone() {
    return this
  },
})

describe('service worker caching', () => {
  it('keeps the image cache near its 4,000 entry cap', async () => {
    const { handlers, fake } = load(async (url) => okResponse(String(url)))
    for (let i = 0; i < 4_050; i += 1) {
      await handlers.cacheFirst(`https://image.tmdb.org/${i}.jpg`, 'img', true)
    }
    // The trim runs in the background; let it settle.
    await new Promise((resolve) => setTimeout(resolve, 20))
    const size = fake.stores.get('img')?.size ?? 0
    expect(size).toBeLessThanOrEqual(4_000)
    expect(size).toBeGreaterThan(3_000)
    // Oldest entries went first.
    expect(fake.stores.get('img')?.has('https://image.tmdb.org/0.jpg')).toBe(
      false,
    )
  })

  it('serves a cached image without touching the network', async () => {
    let calls = 0
    const { handlers } = load(async () => {
      calls += 1
      return okResponse('x')
    })
    await handlers.cacheFirst('https://image.tmdb.org/a.jpg', 'img', true)
    await handlers.cacheFirst('https://image.tmdb.org/a.jpg', 'img', true)
    expect(calls).toBe(1)
  })

  it('does not pin an error response', async () => {
    const { handlers, fake } = load(async () => ({
      ok: false,
      type: 'cors',
      status: 404,
      clone() {
        return this
      },
    }))
    await handlers.cacheFirst('https://image.tmdb.org/a.jpg', 'img', true)
    expect(fake.stores.get('img')?.size).toBe(0)
  })

  it('manifest: network first, cache when offline or failing', async () => {
    let mode: 'ok' | 'down' | '500' = 'ok'
    const { handlers } = load(async () => {
      if (mode === 'down') throw new Error('offline')
      if (mode === '500')
        return { ok: false, status: 500, type: 'basic', clone() {} }
      return okResponse('fresh')
    })
    const fresh = await handlers.networkFirst('/m.json', 'c')
    expect(fresh.status).toBe(200)
    mode = 'down'
    expect((await handlers.networkFirst('/m.json', 'c')).status).toBe(200)
    mode = '500'
    expect((await handlers.networkFirst('/m.json', 'c')).status).toBe(200)
  })
})
