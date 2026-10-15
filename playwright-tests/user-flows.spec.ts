import { expect, test } from '@playwright/test'

test.describe('Gallery user flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('region', { name: 'Warp Wall movie gallery' }),
    ).toBeVisible()

    // The first-load screen holds every other action back until the globe is
    // built. Skip it (it may already be gone where there is no WebGL).
    await page
      .getByRole('button', { name: 'Skip first time load' })
      .click({ timeout: 3_000 })
      .catch(() => {})
    await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached()
  })

  test('switches between gallery and movie index', async ({ page }) => {
    await page.getByRole('button', { name: 'Movie index' }).click()
    await expect(
      page.getByRole('region', { name: 'Movie list view' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Gallery' }).click()
    await expect(
      page.getByRole('region', { name: 'Warp Wall movie gallery' }),
    ).toBeVisible()
  })

  test('searches the movie index by title and offers filters', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Movie index' }).click()
    const search = page.getByRole('searchbox', {
      name: 'Search titles, genres, moods',
    })
    await search.fill('the')

    await expect(search).toHaveValue('the')
    await expect(
      page.getByRole('region', { name: 'Movie list view' }),
    ).toBeVisible()
  })

  test('a genre tag in the movie index filters the list and clears again', async ({
    page,
  }) => {
    // Narrow screens have no room for the tags.
    test.skip((page.viewportSize()?.width ?? 0) <= 900, 'tags hidden on mobile')

    await page.getByRole('button', { name: 'Movie index' }).click()
    const list = page.getByRole('region', { name: 'Movie list view' })
    const tag = list.getByRole('button', { name: /^Filter by / }).first()
    const genre = (await tag.getAttribute('aria-label'))?.replace(
      'Filter by ',
      '',
    )
    expect(genre).toBeTruthy()

    await tag.click()
    const on = list.getByRole('button', { name: `Remove ${genre}` }).first()
    await expect(on).toHaveAttribute('aria-pressed', 'true')

    await on.click()
    await expect(
      list.getByRole('button', { name: `Remove ${genre}` }),
    ).toHaveCount(0)
  })

  test('shuffling in the movie index scrolls to the picked film', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Movie index' }).click()
    const list = page.getByRole('region', { name: 'Movie list view' })
    await expect(list).toBeVisible()

    await page
      .getByRole('button', { name: 'Jump to a random movie in the index' })
      .click()

    // The picked row is highlighted and brought into view, wherever in the
    // whole list it was.
    const picked = list.locator('.warp-list-row.is-active')
    await expect(picked).toBeInViewport({ timeout: 5_000 })
  })

  test('hovering an index row does not take the highlight from the active film', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= 900, 'touch has no hover')

    await page.getByRole('button', { name: 'Movie index' }).click()
    const list = page.getByRole('region', { name: 'Movie list view' })
    await expect(list).toBeVisible()
    await page
      .getByRole('button', { name: 'Jump to a random movie in the index' })
      .click()
    const active = list.locator('.warp-list-row.is-active')
    await expect(active).toBeInViewport({ timeout: 5_000 })
    const activeId = await active.getAttribute('data-movie-id')

    // Hovering another row lights it up without moving the highlight.
    const other = list
      .locator(`.warp-list-row:not([data-movie-id="${activeId}"])`)
      .filter({ visible: true })
      .first()
    await other.hover()
    await page.waitForTimeout(400)
    await expect(other).not.toHaveClass(/is-active/)
    await expect(list.locator('.warp-list-row.is-active')).toHaveAttribute(
      'data-movie-id',
      activeId ?? '',
    )
    const wash = await other.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(wash).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('every dock pill shares one height and one label style', async ({
    page,
  }) => {
    const readDock = () =>
      page.evaluate(() => {
        const pills = [
          ...document.querySelectorAll(
            '.warp-dock .warp-mode-toggle, .warp-dock .warp-main-nav, .warp-dock .warp-shuffle-button, .warp-dock .warp-sort-button, .warp-dock .warp-filter-actions .warp-filter-button',
          ),
        ].filter((el) => el.getBoundingClientRect().width > 0)
        const labels = [
          ...document.querySelectorAll(
            '.warp-dock .warp-mode-label, .warp-dock .warp-main-nav button, .warp-dock .warp-shuffle-button, .warp-dock .warp-sort-badge, .warp-dock .warp-filter-label',
          ),
        ].filter((el) => el.getBoundingClientRect().width > 0)
        return {
          heights: pills.map((el) =>
            Math.round(el.getBoundingClientRect().height),
          ),
          styles: labels.map((el) => {
            const style = getComputedStyle(el)
            return `${style.fontSize}/${style.fontWeight}`
          }),
        }
      })

    for (const mode of ['wall', 'list']) {
      if (mode === 'list') {
        await page.getByRole('button', { name: 'Movie index' }).click()
        await expect(
          page.getByRole('region', { name: 'Movie list view' }),
        ).toBeVisible()
      }
      const { heights, styles } = await readDock()
      expect(heights.length).toBeGreaterThan(2)
      expect(new Set(heights).size).toBe(1)
      expect(new Set(styles).size).toBe(1)
    }
  })

  test('the genre All chip is on only while no genre is selected', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Filters' }).click()
    const genres = page.locator('[data-section="genres"]').first()
    const all = genres.getByRole('button', { name: /^All/ })
    const first = genres.getByRole('button').nth(1)

    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(first).toHaveAttribute('aria-pressed', 'false')

    await first.click()
    await expect(all).toHaveAttribute('aria-pressed', 'false')
    await expect(first).toHaveAttribute('aria-pressed', 'true')

    await all.click()
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(first).toHaveAttribute('aria-pressed', 'false')
  })
  test('the mood scenes lean with the pointer', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= 900, 'touch has no lean')

    await page
      .getByRole('button', { name: /pick your mood/i })
      .first()
      .click()
    const stage = page.locator('.mood-stage')
    await expect(stage).toBeVisible()
    const box = await stage.boundingBox()
    if (!box) throw new Error('mood stage has no box')

    // Pointer in the top-left, then the bottom-right: the near layer of the
    // open scene moves against it, and no custom property is left on the stage.
    const near = page.locator('.mood-panel.is-open .ms-near').first()
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
    await expect
      .poll(() => near.evaluate((el) => (el as SVGElement).style.translate))
      .not.toBe('')
    const topLeft = await near.evaluate(
      (el) => (el as SVGElement).style.translate,
    )
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8)
    await expect
      .poll(() => near.evaluate((el) => (el as SVGElement).style.translate))
      .not.toBe(topLeft)
    expect(await stage.evaluate((el) => el.getAttribute('style'))).toBeNull()
  })

  test('on a phone only the worlds in view keep animating', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 900, 'desktop shows them all')

    await page
      .getByRole('button', { name: /pick your mood/i })
      .first()
      .click()
    const panels = page.locator('.mood-panel')
    await expect(panels).toHaveCount(6)

    await expect(panels.first()).toHaveAttribute('data-offscreen', 'false')
    await expect(panels.last()).toHaveAttribute('data-offscreen', 'true')
    await expect(panels.last().locator('.mood-scene').first()).toBeAttached()
    const paused = await panels
      .last()
      .locator('.mood-scene *')
      .first()
      .evaluate((el) => getComputedStyle(el).animationPlayState)
    expect(paused).toBe('paused')
  })

  test('the mood page says how many films fit the mix', async ({ page }) => {
    await page
      .getByRole('button', { name: /pick your mood/i })
      .first()
      .click()
    await expect(page.locator('.mood-fit')).toHaveCount(0)

    await page.locator('.mood-panel').first().click()
    await expect(page.locator('.mood-fit')).toHaveText(/^[\d,]+ films? fits?$/)
  })

  test('arrow keys browse the mood worlds', async ({ page }) => {
    await page
      .getByRole('button', { name: /pick your mood/i })
      .first()
      .click()
    const panels = page.locator('.mood-panel')
    await expect(panels).toHaveCount(6)

    await panels.first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(panels.nth(1)).toBeFocused()
    await expect(panels.nth(1)).toHaveClass(/is-open/)

    await page.keyboard.press('End')
    await expect(panels.nth(5)).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(panels.nth(5)).toBeFocused()

    await page.keyboard.press('Home')
    await expect(panels.first()).toBeFocused()
  })

  test('the blend tip shows once and goes away for good', async ({ page }) => {
    const open = () =>
      page
        .getByRole('button', { name: /pick your mood/i })
        .first()
        .click()
    await open()
    const panels = page.locator('.mood-panel')
    const tip = page.locator('.mood-hint')
    await expect(tip).toHaveCount(0)

    await panels.nth(0).click()
    await expect(tip).toBeVisible()

    await panels.nth(1).click()
    await expect(tip).toHaveCount(0)

    // A second visit with one world chosen does not show it again.
    await page.getByRole('button', { name: 'Close the mood page' }).click()
    await expect(page.locator('.mood-page')).toHaveCount(0)
    await open()
    await page.locator('.mood-panel').nth(2).click()
    await expect(tip).toHaveCount(0)
  })
})
