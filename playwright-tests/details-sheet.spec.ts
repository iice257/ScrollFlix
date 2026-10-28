import { type Page, expect, test } from '@playwright/test'

// The phone details sheet follows the finger and settles on compact or
// expanded; a pull down on its content shrinks it again. Touch is sent through
// the browser's own touch input, so this runs on Chromium phone profiles.
test.describe('Details sheet (phone)', () => {
  test.setTimeout(120_000)

  test.beforeEach(({ page, browserName }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 900, 'phone layout only')
    test.skip(browserName !== 'chromium', 'uses Chromium touch input')
  })

  const openCard = async (page: Page) => {
    await page.goto('/?film=13')
    await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached({
      timeout: 60_000,
    })
    await expect(page.locator('.warp-details-card')).toBeVisible({
      timeout: 30_000,
    })
    // Let the entrance settle.
    await page.waitForTimeout(1_500)
  }

  const cardHeight = (page: Page) =>
    page.evaluate(
      () =>
        document.querySelector('.warp-details-card')?.getBoundingClientRect()
          .height ?? 0,
    )

  test('follows the handle, expands, and a pull down on the content shrinks it', async ({
    page,
    context,
  }) => {
    await openCard(page)
    const cdp = await context.newCDPSession(page)
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      x: number,
      y: number,
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      })
    const card = page.locator('.warp-details-card')
    const compact = await cardHeight(page)

    // Up on the handle: the sheet grows with the finger, then settles.
    const grip = await page.locator('.warp-details-grip-zone').boundingBox()
    if (!grip) throw new Error('no handle')
    const gx = grip.x + grip.width / 2
    const gy = grip.y + grip.height / 2
    await touch('touchStart', gx, gy)
    for (let step = 1; step <= 6; step += 1) {
      await touch('touchMove', gx, gy - step * 14)
      await page.waitForTimeout(40)
    }
    await expect(card).toHaveClass(/is-dragging/)
    expect(await cardHeight(page)).toBeGreaterThan(compact + 40)
    await touch('touchEnd', gx, gy)
    await expect(card).toHaveAttribute('data-snap', 'expanded')

    // Expanded, the sheet and its Less control stay inside the screen.
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            document
              .querySelector('.warp-details-more')
              ?.getBoundingClientRect().bottom ?? 9999,
        ),
      )
      .toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight))
    await expect.poll(() => cardHeight(page)).toBeGreaterThan(compact + 80)

    // Down on the content, from its top: the sheet follows, then compacts.
    const copy = await page.locator('.warp-details-copy-scroll').boundingBox()
    if (!copy) throw new Error('no content')
    const cx = copy.x + copy.width / 2
    const cy = copy.y + 100
    await touch('touchStart', cx, cy)
    for (let step = 1; step <= 6; step += 1) {
      await touch('touchMove', cx, cy + step * 14)
      await page.waitForTimeout(40)
    }
    await expect(card).toHaveClass(/is-dragging/)
    await touch('touchEnd', cx, cy)
    await expect(card).toHaveAttribute('data-snap', 'compact')
  })
})
