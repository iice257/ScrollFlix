import { type Page, expect, test } from '@playwright/test'

const STORE_KEY = 'wtw:shuffle-pro:v1'
const entry = { count: 3, firstAt: 1, lastAt: 2 }
const ALL_FOUND = { frost: entry, amethyst: entry, jade: entry, gold: entry }

const openGallery = async (
  page: Page,
  data: { found?: object; demoMode?: boolean } = {},
) => {
  await page.addInitScript(
    ([key, payload]) => {
      window.localStorage.setItem(key, payload)
    },
    [
      STORE_KEY,
      JSON.stringify({
        v: 1,
        found: data.found ?? {},
        repeatFound: false,
        demoMode: data.demoMode ?? false,
      }),
    ] as const,
  )
  await page.goto('/')
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
}

const pressGlobe = async (page: Page) => {
  const canvas = page.locator('.warp-infinite-menu-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no globe')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
}

test.describe('Shuffle Pro holds', () => {
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

test.describe('Demo mode', () => {
  test('is off by default: no counter', async ({ page }) => {
    await openGallery(page)
    await expect(page.locator('.warp-demo-chip')).toHaveCount(0)
  })

  test('shows a streak counter that follows shuffles', async ({ page }) => {
    await openGallery(page, { demoMode: true })
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
