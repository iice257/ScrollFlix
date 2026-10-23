import { expect, test } from '@playwright/test'

// A tiny grey JPEG, so the test never depends on the TMDB image CDN.
const PIXEL_JPEG = Buffer.from(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAGAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKwAf//Z',
  'base64',
)

test('reveals the full poster gallery from the TMDB CDN', async ({ page }) => {
  test.setTimeout(240_000)
  const posterRequests: string[] = []
  await page.route(/image\.tmdb\.org/, (route) => {
    posterRequests.push(route.request().url())
    return route.fulfill({ contentType: 'image/jpeg', body: PIXEL_JPEG })
  })

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })

  // Without WebGL2 (e.g. headless Firefox on Linux CI) the app correctly
  // renders its non-WebGL fallback menu, so there is no canvas to inspect.
  const hasWebgl2 = await page.evaluate(
    () => !!document.createElement('canvas').getContext('webgl2'),
  )
  test.skip(!hasWebgl2, 'WebGL2 is unavailable in this browser')

  const canvas = page.getByLabel('Infinite movie poster menu')
  await expect(canvas).toHaveAttribute('data-item-count', '900', {
    timeout: 30_000,
  })
  await expect(canvas).toHaveAttribute('data-texture-progress', '100', {
    timeout: 180_000,
  })
  await expect(canvas).toHaveAttribute('data-webgl-state', 'ready')
  await expect(page.locator('.warp-gallery-preloader')).toHaveAttribute(
    'data-state',
    'ready',
  )
  expect(posterRequests.length).toBeGreaterThan(0)
  // The globe asks for w154; the on-device starter set also keeps the index's
  // w92 thumbnails. Nothing larger is ever requested up front.
  expect(posterRequests.every((url) => /\/t\/p\/w(154|92)\//.test(url))).toBe(
    true,
  )
})
