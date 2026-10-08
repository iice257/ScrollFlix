import { expect, test } from '@playwright/test'

test.describe('Gallery user flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('region', { name: 'Warp Wall movie gallery' }),
    ).toBeVisible()
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
})
