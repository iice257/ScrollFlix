import { type APIResponse, expect, test } from '@playwright/test'

// Smoke checks for a deployed ScrollFlix. They are read-only (GET only, no
// accounts, a handful of small requests), so they are safe to run against
// production. Run with `BASE_URL=... npm run smoke`; see docs/deployment.md.
//
//   EXPECT_SHA                       also check /version.json is this commit
//   VERCEL_AUTOMATION_BYPASS_SECRET  lets the checks through Vercel Deployment
//                                    Protection on a protected preview/staging
//   SMOKE_REQUIRE_WEATHER=1          fail (not skip) when /api/weather is 404

const EXPECT_SHA = process.env.EXPECT_SHA?.trim()
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
const MIN_FILMS = 50_000

// Only set when a bypass secret is configured (protected staging/preview).
test.use({
  extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {},
})

type Manifest = { count: number; chunks: string[] }

// `vite preview` serves the built files only, not the /api functions.
const isLocalPreview = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(
  new URL(process.env.BASE_URL ?? 'http://x').hostname,
)

const describe = (res: APIResponse) =>
  `${res.status()} ${res.url()} (${res.headers()['content-type'] ?? 'no content-type'})`

test.describe('deployment smoke', () => {
  test('home page responds with the app shell', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status(), describe(res)).toBe(200)
    expect(res.headers()['content-type'] ?? '').toContain('text/html')
    const html = await res.text()
    expect(html).toContain('id="root"')
    expect(html).toMatch(/<title>[^<]+<\/title>/)
  })

  test('the built JS and CSS are served as real assets', async ({
    request,
  }) => {
    const html = await (await request.get('/')).text()
    const urls = [
      ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
      ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
    ].map((m) => m[1])
    expect(
      urls.length,
      'no script/stylesheet tags in index.html',
    ).toBeGreaterThan(0)
    for (const url of urls) {
      const res = await request.get(url)
      expect(res.status(), `${url}: ${describe(res)}`).toBe(200)
      // A missing asset is rewritten to index.html with a 200, so check the type.
      const type = res.headers()['content-type'] ?? ''
      expect(type, url).toMatch(/javascript|css/)
      expect((await res.body()).length, url).toBeGreaterThan(500)
    }
  })

  test('serves the commit that was just deployed @deploy', async ({
    request,
  }) => {
    test.skip(!EXPECT_SHA, 'EXPECT_SHA is not set')
    const res = await request.get('/version.json')
    expect(res.status(), describe(res)).toBe(200)
    const body = (await res.json()) as { sha?: string }
    expect(body.sha).toBe(EXPECT_SHA)
  })

  test('catalogue manifest and a film chunk load', async ({ request }) => {
    const res = await request.get('/json/catalog/manifest.json')
    expect(res.status(), describe(res)).toBe(200)
    const manifest = (await res.json()) as Manifest
    expect(manifest.count).toBeGreaterThanOrEqual(MIN_FILMS)
    expect(manifest.chunks.length).toBeGreaterThan(0)

    const chunk = await request.get(`/json/catalog/${manifest.chunks[0]}`)
    expect(chunk.status(), describe(chunk)).toBe(200)
    const films = (await chunk.json()) as unknown[][]
    expect(Array.isArray(films)).toBe(true)
    expect(films.length).toBeGreaterThan(100)
    // [tmdbId, title, year, ..., posterPath, ...]
    expect(typeof films[0][0]).toBe('number')
    expect(typeof films[0][1]).toBe('string')
  })

  test('a catalogue poster loads from the image CDN', async ({ request }) => {
    const manifest = (await (
      await request.get('/json/catalog/manifest.json')
    ).json()) as Manifest
    const films = (await (
      await request.get(`/json/catalog/${manifest.chunks[0]}`)
    ).json()) as unknown[][]
    // The most-voted films come first. Try a few, since a single poster can
    // age out of TMDB; the check is that the CDN and the path format work.
    const results: string[] = []
    for (const film of films.slice(0, 5)) {
      const poster = film[6]
      if (typeof poster !== 'string' || !poster) continue
      // Plain fetch: no bypass header, the CDN is a different origin.
      const res = await fetch(`https://image.tmdb.org/t/p/w154/${poster}.jpg`)
      const type = res.headers.get('content-type') ?? ''
      results.push(`${poster}: ${res.status} ${type}`)
      if (res.status === 200 && type.startsWith('image/')) return
    }
    throw new Error(
      `no catalogue poster loaded from the CDN: ${results.join('; ')}`,
    )
  })

  test('link-preview image endpoint returns an image', async ({ request }) => {
    test.skip(isLocalPreview, 'vite preview does not serve /api')
    const res = await request.get('/api/og?kind=default')
    expect(res.status(), describe(res)).toBe(200)
    expect(res.headers()['content-type'] ?? '').toMatch(/^image\//)
    expect((await res.body()).length).toBeGreaterThan(1000)
  })

  test('weather endpoint does not error', async ({ request }) => {
    test.skip(isLocalPreview, 'vite preview does not serve /api')
    const res = await request.get('/api/weather')
    if (res.status() === 404) {
      test.skip(
        !process.env.SMOKE_REQUIRE_WEATHER,
        '/api/weather is not deployed here yet',
      )
    }
    expect(res.status(), describe(res)).toBeLessThan(500)
    expect([200, 204], describe(res)).toContain(res.status())
    if (res.status() === 200) {
      expect(res.headers()['content-type'] ?? '').toContain('json')
      await res.json()
    }
  })

  test('the app boots in a browser without errors @browser', async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL as string).origin
    const problems: string[] = []
    // Vercel Analytics (/_vercel/...) only exists on Vercel, not in vite preview.
    const ignored = (url: string) => isLocalPreview && url.includes('/_vercel/')

    page.on('pageerror', (err) => problems.push(`uncaught: ${err.message}`))
    page.on('response', (res) => {
      const type = res.request().resourceType()
      if (
        res.url().startsWith(origin) &&
        !ignored(res.url()) &&
        (type === 'script' || type === 'stylesheet') &&
        res.status() >= 400
      ) {
        problems.push(`${res.status()} ${res.url()}`)
      }
    })
    page.on('requestfailed', (req) => {
      const type = req.resourceType()
      if (
        req.url().startsWith(origin) &&
        !ignored(req.url()) &&
        (type === 'script' || type === 'stylesheet')
      ) {
        problems.push(`failed ${req.url()}: ${req.failure()?.errorText}`)
      }
    })

    // Poster images come from the TMDB CDN and are not what is being tested:
    // serve them empty so the check is fast and stays off their servers.
    await page.route(/image\.tmdb\.org/, (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }),
    )

    const res = await page.goto('/', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBe(200)
    await expect(page.locator('#root')).not.toBeEmpty()
    expect(await page.title()).toMatch(/\S/)

    const hasWebgl2 = await page.evaluate(
      () => !!document.createElement('canvas').getContext('webgl2'),
    )
    if (hasWebgl2) {
      const canvas = page.getByLabel('Infinite movie poster menu')
      // Mounted and laid out. Textures keep streaming for a while after this
      // (and are stubbed here), so do not wait for the "ready" state.
      await expect(canvas).toHaveAttribute('data-item-count', /^[1-9]\d*$/, {
        timeout: 30_000,
      })
      await expect(canvas).toHaveAttribute(
        'data-webgl-state',
        /^(loading|ready)$/,
      )
    } else {
      // No WebGL2 here (some CI browsers): the app must show its fallback menu.
      await expect(
        page.getByLabel('Movie poster gallery fallback'),
      ).toBeVisible({
        timeout: 30_000,
      })
    }

    expect(problems, problems.join('\n')).toEqual([])
  })
})
