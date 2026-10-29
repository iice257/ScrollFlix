import { type CDPSession, type Page, expect, test } from '@playwright/test'

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

  const cardBox = (page: Page) =>
    page.evaluate(() => {
      const box = document
        .querySelector('.warp-details-card')
        ?.getBoundingClientRect()
      return { top: box?.top ?? 0, height: box?.height ?? 0 }
    })

  const touchOf = (page: Page, cdp: CDPSession) => ({
    send: (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      x: number,
      y: number,
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      }),
    // A drag of `dy` px in six steps, held for a beat so a release is a settle
    // and not a flick.
    drag: async (x: number, y: number, dy: number, release = true) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      })
      for (let step = 1; step <= 6; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + (dy * step) / 6 }],
        })
        await page.waitForTimeout(40)
      }
      await page.waitForTimeout(250)
      if (release)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        })
    },
  })

  test('moves with the finger, expands, compacts, puts back and closes', async ({
    page,
    context,
  }) => {
    await openCard(page)
    const touch = touchOf(page, await context.newCDPSession(page))
    const card = page.locator('.warp-details-card')
    const compact = await cardBox(page)

    const grip = await page.locator('.warp-details-grip-zone').boundingBox()
    if (!grip) throw new Error('no handle')
    const gx = grip.x + grip.width / 2
    const gy = grip.y + grip.height / 2

    // Up on the handle: the sheet is moved by transform, one to one, and its
    // height stays put until it is let go.
    await touch.drag(gx, gy, -84, false)
    await expect(card).toHaveClass(/is-dragging/)
    const dragging = await cardBox(page)
    expect(dragging.height).toBeCloseTo(compact.height, 0)
    expect(compact.top - dragging.top).toBeGreaterThan(70)
    await touch.send('touchEnd', gx, gy)
    await expect(card).toHaveAttribute('data-snap', 'expanded')
    await expect
      .poll(async () => (await cardBox(page)).height)
      .toBeGreaterThan(compact.height + 80)

    // The expanded sheet and its Less control stay inside the screen.
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

    // Down on the content from its top: it follows, then compacts.
    const copy = await page.locator('.warp-details-copy-scroll').boundingBox()
    if (!copy) throw new Error('no content')
    await touch.drag(copy.x + copy.width / 2, copy.y + 100, 84)
    await expect(card).toHaveAttribute('data-snap', 'compact')

    // A short pull is put back.
    await touch.drag(gx, gy, 24)
    await expect(card).toHaveAttribute('data-snap', 'compact')
    await expect
      .poll(async () => Math.abs((await cardBox(page)).top - compact.top))
      .toBeLessThan(2)

    // A long pull down on the handle closes it.
    await touch.drag(gx, gy, 90)
    await expect(card).toBeHidden({ timeout: 5_000 })
  })
})
