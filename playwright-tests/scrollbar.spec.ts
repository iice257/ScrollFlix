import { type Page, expect, test } from '@playwright/test'

// Every scroller swaps the native scrollbar for one overlay thumb that takes no
// layout width. A native bar is ~17px on Windows and shifts content when it
// appears, so these checks look at box widths and computed styles rather than
// pixels: headless Chrome hides its native bars and would pass either way.

const open = async (page: Page) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('wtw:spin-hint-seen', '1')
      window.localStorage.setItem('wtw:theme', 'dark')
      for (const kind of ['path', 'links'])
        window.localStorage.setItem(`wtw:globe-lines-nudge:${kind}:v1`, '1')
    } catch {}
  })
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

const openIndex = async (page: Page) => {
  await page.getByRole('button', { name: 'Movie index' }).click()
  const list = page.getByRole('region', { name: 'Movie list view' })
  await expect(list).toBeVisible()
  return list
}

// What the native bar would take from the content box: the gap between the
// border box and the padding box, less the borders themselves.
const gutter = (locator: ReturnType<Page['locator']>) =>
  locator.evaluate((el) => {
    const style = getComputedStyle(el)
    const borders =
      Number.parseFloat(style.borderLeftWidth) +
      Number.parseFloat(style.borderRightWidth)
    return el.offsetWidth - el.clientWidth - borders
  })

test.describe('Scrollbar baseline', () => {
  test('a plain scroller is thin and reserves no gutter', async ({ page }) => {
    await open(page)
    const style = await page.evaluate(() => {
      const box = document.createElement('div')
      box.style.cssText = 'overflow:auto;height:40px;width:80px'
      box.innerHTML = '<div style="height:400px"></div>'
      document.body.append(box)
      const { scrollbarWidth, scrollbarGutter } = getComputedStyle(box)
      box.remove()
      return { scrollbarWidth, scrollbarGutter }
    })
    // Never the platform default. Chromium reports thin; headless Firefox on
    // Linux folds its overlay bar into none.
    expect(['thin', 'none']).toContain(style.scrollbarWidth)
    expect(style.scrollbarGutter).toBe('auto')
  })
})

test.describe('Overlay scrollbar', () => {
  // Touch devices keep their own thin overlay bar.
  test.skip(({ isMobile }) => isMobile, 'the custom thumb is for fine pointers')

  test.beforeEach(async ({ page }) => {
    await open(page)
  })

  test('the index list hides the native bar and takes no width', async ({
    page,
  }) => {
    const list = await openIndex(page)
    await expect(list).toHaveAttribute('data-osb', '')
    expect(
      await list.evaluate((el) => getComputedStyle(el).scrollbarWidth),
    ).toBe('none')
    expect(await gutter(list)).toBe(0)
  })

  test('the thumb shows while scrolling and fades away after', async ({
    page,
  }) => {
    const list = await openIndex(page)
    const strip = page.locator('.warp-osb')
    await expect(strip).toHaveAttribute('data-visible', 'false')
    await list.hover()
    await page.mouse.wheel(0, 600)
    await expect(strip).toHaveAttribute('data-visible', 'true')
    // Quiet for 900 ms, then it goes.
    await expect(strip).toHaveAttribute('data-visible', 'false', {
      timeout: 4_000,
    })
  })

  test('dragging the thumb scrolls the list', async ({ page }) => {
    const list = await openIndex(page)
    await list.hover()
    await page.mouse.wheel(0, 400)
    const thumb = page.locator('.warp-osb-thumb')
    await expect(page.locator('.warp-osb')).toHaveAttribute(
      'data-visible',
      'true',
    )
    const before = await list.evaluate((el) => el.scrollTop)
    const box = await thumb.boundingBox()
    if (!box) throw new Error('the thumb has no box')
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 120, { steps: 8 })
    await page.mouse.up()
    const after = await list.evaluate((el) => el.scrollTop)
    expect(after).toBeGreaterThan(before)
  })

  test('the thumb is hidden from assistive tech and leaves no trace on close', async ({
    page,
  }) => {
    await openIndex(page)
    await expect(page.locator('.warp-osb')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    await page.getByRole('button', { name: 'Gallery' }).click()
    await expect(page.locator('.warp-osb')).toHaveCount(0)
  })

  test('the about drawer keeps its width whether or not it overflows', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'About ScrollFlix' }).click()
    const drawer = page.getByRole('complementary', { name: 'About ScrollFlix' })
    await expect(drawer).toBeVisible()
    await expect(drawer).toHaveAttribute('data-osb', '')
    // Let the entrance animation settle before measuring.
    await page.waitForTimeout(600)

    // Tall enough to hold everything, so nothing scrolls.
    await drawer.evaluate((el) => {
      el.style.maxHeight = 'none'
    })
    expect(
      await drawer.evaluate((el) => el.scrollHeight <= el.clientHeight),
    ).toBe(true)
    const roomy = await drawer.evaluate((el) => el.clientWidth)

    // Squeeze it so the content must scroll.
    await drawer.evaluate((el) => {
      el.style.maxHeight = '140px'
    })
    expect(
      await drawer.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true)
    expect(await drawer.evaluate((el) => el.clientWidth)).toBe(roomy)
    expect(await gutter(drawer)).toBe(0)
  })

  test('the filters page reserves no gutter', async ({ page }) => {
    await openIndex(page)
    await page.getByRole('button', { name: 'Filters' }).click()
    const view = page.getByRole('region', { name: 'Filters' })
    await expect(view).toBeVisible()
    await expect(view).toHaveAttribute('data-osb', '')
    expect(await gutter(view)).toBe(0)
  })
})
