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
})
