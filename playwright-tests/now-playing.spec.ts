import { type Page, expect, test } from '@playwright/test'

const SHUFFLE_TO_RANDOM = 'Shuffle to a random movie'

const openGallery = async (page: Page) => {
  await page.goto('/')
  await expect(
    page.getByRole('region', { name: 'Warp Wall movie gallery' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Skip first time load' })
    .click({ timeout: 3_000 })
    .catch(() => {})
  await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached()
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) <= 900

const nowPlaying = (page: Page) =>
  page.getByRole('region', { name: 'Now playing' })

const titleOf = async (page: Page) =>
  (await nowPlaying(page)
    .locator('.warp-np-face:not(.is-leaving) .warp-np-title')
    .textContent()) ?? ''

test.describe('Now-playing bar (phone width)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isPhone(page), 'the bar is for phone-width layouts')
    await openGallery(page)
  })

  test('a shuffle raises the bar and does not open the card', async ({
    page,
  }) => {
    await page.getByRole('button', { name: SHUFFLE_TO_RANDOM }).click()
    await expect(nowPlaying(page)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.warp-details-card')).toHaveCount(0)
    await expect(
      nowPlaying(page).getByRole('button', { name: 'Open details' }),
    ).toBeVisible()
  })

  test('the globe still spins with the bar up', async ({ page }) => {
    await page.getByRole('button', { name: SHUFFLE_TO_RANDOM }).click()
    await expect(nowPlaying(page)).toBeVisible({ timeout: 30_000 })

    const pill = page.locator('.warp-title-card')
    await expect(pill).toBeVisible()
    const before = await pill.getAttribute('aria-label')
    const box = await page
      .locator('canvas.warp-infinite-menu-canvas')
      .boundingBox()
    if (!box) throw new Error('globe canvas not found')
    const y = box.y + box.height * 0.4
    await page.mouse.move(box.x + box.width * 0.75, y)
    await page.mouse.down()
    // Paced like a finger: WebKit's software-rendered globe ignores a drag
    // that is over before it has drawn a frame.
    for (let step = 1; step <= 16; step++) {
      await page.mouse.move(box.x + box.width * (0.75 - 0.035 * step), y + step)
      await page.waitForTimeout(24)
    }
    await page.mouse.up()

    await expect(pill).not.toHaveAttribute('aria-label', before ?? '')
    await expect(nowPlaying(page)).toBeVisible()
    await expect(page.locator('.warp-details-card')).toHaveCount(0)
  })

  test('tapping the bar opens the full card in one step', async ({ page }) => {
    await page.getByRole('button', { name: SHUFFLE_TO_RANDOM }).click()
    await expect(nowPlaying(page)).toBeVisible({ timeout: 30_000 })
    const title = await titleOf(page)

    await nowPlaying(page)
      .getByRole('button', { name: /Tap for details/ })
      .click()
    const card = page.locator('.warp-details-card')
    await expect(card).toHaveAttribute('data-snap', 'expanded')
    await expect(card.locator('.warp-details-title-row')).toContainText(
      title.slice(0, 8),
    )
    await expect(nowPlaying(page)).toHaveCount(0)
  })

  test('the expand button opens the full card too', async ({ page }) => {
    await page.getByRole('button', { name: SHUFFLE_TO_RANDOM }).click()
    await expect(nowPlaying(page)).toBeVisible({ timeout: 30_000 })
    await nowPlaying(page)
      .getByRole('button', { name: 'Open details', exact: true })
      .click()
    await expect(page.locator('.warp-details-card')).toHaveAttribute(
      'data-snap',
      'expanded',
    )
  })

  test('the bar shuffles to another film', async ({ page }) => {
    await page.getByRole('button', { name: SHUFFLE_TO_RANDOM }).click()
    await expect(nowPlaying(page)).toBeVisible({ timeout: 30_000 })
    const first = await titleOf(page)

    await nowPlaying(page)
      .getByRole('button', { name: 'Shuffle to another movie' })
      .click()
    await expect.poll(() => titleOf(page), { timeout: 30_000 }).not.toBe(first)
    await expect(page.locator('.warp-details-card')).toHaveCount(0)
  })

  test('opening the filters clears the bar', async ({ page }) => {
    await page.getByRole('button', { name: SHUFFLE_TO_RANDOM }).click()
    await expect(nowPlaying(page)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Open filters' }).click()
    await expect(nowPlaying(page)).toHaveCount(0)
  })
})

test.describe('Shuffle on wide layouts', () => {
  test('still opens the card and shows no bar', async ({ page }) => {
    test.skip(isPhone(page), 'wide layouts only')
    await openGallery(page)
    await page.getByRole('button', { name: SHUFFLE_TO_RANDOM }).click()
    await expect(page.locator('.warp-details-card')).toBeVisible({
      timeout: 30_000,
    })
    await expect(nowPlaying(page)).toHaveCount(0)
  })
})
