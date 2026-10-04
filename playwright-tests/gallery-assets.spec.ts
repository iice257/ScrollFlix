import { expect, test } from '@playwright/test'

test('reveals the full local poster gallery', async ({ page }) => {
  test.setTimeout(240_000)
  const remoteArtworkRequests: string[] = []
  page.on('request', (request) => {
    if (/image\.tmdb\.org|images\.metahub\.space/.test(request.url())) {
      remoteArtworkRequests.push(request.url())
    }
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
  expect(remoteArtworkRequests).toEqual([])
})
