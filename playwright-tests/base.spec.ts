import { expect, test } from '@playwright/test'
import { SITE_TITLE_PATTERN } from './site-meta'

test('renders the canonical gallery route', async ({ page }) => {
  await page.goto('/')

  // The tab title animates trailing dots; the pattern allows for them.
  await expect(page).toHaveTitle(SITE_TITLE_PATTERN)
  await expect(
    page.getByRole('region', { name: 'Warp Wall movie gallery' }),
  ).toBeVisible()
})

test('loads the gallery without application console errors', async ({
  page,
}) => {
  // Poster URLs in a nightly catalogue can age out of the TMDB CDN; keep the
  // test independent of the network.
  await page.route(/image\.tmdb\.org/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }),
  )
  // Vercel Analytics is injected by the platform, so a plain static server
  // (vite preview on CI) answers its script with a 404.
  await page.route(/\/_vercel\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  )
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  // The browser's "Failed to load resource" console line has no URL; keep the
  // failing ones so a failure says which request it was.
  const failedRequests: string[] = []
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`)
  })

  await page.goto('/')

  await expect(
    page.getByRole('region', { name: 'Warp Wall movie gallery' }),
  ).toBeVisible()

  expect(failedRequests).toEqual([])

  const criticalErrors = consoleErrors.filter(
    (error) =>
      !error.includes('WebGL') &&
      !error.includes('GPU') &&
      !error.includes('canvas') &&
      !error.toLowerCase().includes('webgl'),
  )

  expect(criticalErrors).toHaveLength(0)
})
