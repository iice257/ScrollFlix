import { type Page, expect, test } from '@playwright/test'
import { waitForGlobeQuiet } from './globe-quiet'

const STORE_KEY = 'wtw:shuffle-pro:v1'
// Dev mode exists only on the dev server: CI runs the @dev specs against it
// (E2E_SERVER=dev) and everything else against the production build.
const DEV_MODE_KEY = 'wtw:shuffle-pro:dev-mode'
const entry = { count: 3, firstAt: 1, lastAt: 2 }
const ALL_FOUND = { frost: entry, amethyst: entry, jade: entry, gold: entry }

const openGallery = async (
  page: Page,
  data: { found?: object; devMode?: boolean; timed?: boolean } = {},
) => {
  await page.addInitScript(
    ([key, payload, devKey, devMode]) => {
      window.localStorage.setItem(key, payload)
      window.localStorage.setItem(devKey, devMode)
    },
    [
      STORE_KEY,
      JSON.stringify({ v: 1, found: data.found ?? {} }),
      DEV_MODE_KEY,
      data.devMode ? '1' : '0',
    ] as const,
  )
  await page.goto('/')

  // Without WebGL2 (e.g. headless Firefox on Linux CI) the app renders its
  // non-WebGL fallback menu: there is no globe to hold and no gallery wall.
  const hasWebgl2 = await page.evaluate(
    () => !!document.createElement('canvas').getContext('webgl2'),
  )
  test.skip(!hasWebgl2, 'WebGL2 is unavailable in this browser')
  await expect(
    page.getByRole('region', { name: 'Warp Wall movie gallery' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Skip first time load' })
    .click({ timeout: 3_000 })
    .catch(() => {})
  await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached()
  // The loader fades out over the globe; a press must not land on it.
  await expect(page.locator('.warp-gallery-preloader')).toBeHidden()
  // These specs time a hold to the second: wait for the globe to finish
  // loading first (see globe-quiet.ts).
  if (data.timed !== false) await waitForGlobeQuiet(page)
}

const pressGlobe = async (page: Page) => {
  const canvas = page.locator('.warp-infinite-menu-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no globe')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
}

test.describe('Shuffle Pro holds', { tag: '@heavy' }, () => {
  // Waiting for the globe to be quiet comes before the hold itself.
  test.setTimeout(120_000)

  test('a 3s hold starts a run even with every path found and repeats off', async ({
    page,
  }) => {
    await openGallery(page, { found: ALL_FOUND })
    await pressGlobe(page)
    await page.waitForTimeout(2_600)
    await expect(
      page.getByRole('button', { name: 'Skip to the movie' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Skip to the movie' }),
    ).toBeVisible({ timeout: 8_000 })
    await page.mouse.up()
  })

  test('the ring shows after 1.5s of holding and goes on an early release', async ({
    page,
  }) => {
    await openGallery(page)
    const ring = page.locator('.warp-hold-ring')
    await pressGlobe(page)
    await page.waitForTimeout(900)
    await expect(ring).toHaveAttribute('data-state', 'idle')
    await expect(ring).toHaveCSS('opacity', '0')
    await expect(ring).toHaveAttribute('data-state', 'filling', {
      timeout: 6_000,
    })
    await expect(ring).toHaveCSS('opacity', '1')
    await expect(ring).toHaveAttribute('aria-hidden', 'true')
    await expect(ring).toHaveCSS('pointer-events', 'none')
    await page.mouse.up()
    await expect(ring).not.toHaveAttribute('data-state', 'filling')
    await expect(ring).toHaveCSS('opacity', '0')
    await expect(
      page.getByRole('button', { name: 'Skip to the movie' }),
    ).toHaveCount(0)
  })

  test('a quick click never shows the ring', async ({ page }) => {
    await openGallery(page)
    await pressGlobe(page)
    await page.waitForTimeout(300)
    await page.mouse.up()
    await page.waitForTimeout(1_500)
    await expect(page.locator('.warp-hold-ring')).toHaveAttribute(
      'data-state',
      'idle',
    )
  })
})

test.describe('Dev mode', () => {
  test('is off by default: no counter', async ({ page }) => {
    await openGallery(page, { timed: false })
    await expect(page.locator('.warp-demo-chip')).toHaveCount(0)
  })

  test('shows a streak counter that follows shuffles @dev', async ({
    page,
  }) => {
    await openGallery(page, { devMode: true, timed: false })
    const chip = page.locator('.warp-demo-chip')
    await expect(chip).toBeVisible()
    await expect(chip).toContainText('0 / 5')
    await expect(chip).toContainText('0 / 10')
    await page
      .getByRole('button', { name: 'Shuffle to a random movie' })
      .click()
    await expect(chip).toContainText('1 / 10')
  })
})
