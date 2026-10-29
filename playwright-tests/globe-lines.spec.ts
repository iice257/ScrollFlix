import { type Page, expect, test } from '@playwright/test'

// History and favourites on the globe start off, and each switch has a line
// under it saying what it does. One button opens a drawer with a tab for each.

// Two landings, so the history has something to show once it is on.
const seedPath = (page: Page) =>
  page.addInitScript(() => {
    const key = 'wtw:session-path:v1'
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(
        key,
        JSON.stringify([
          { id: 'c27205', tier: null },
          { id: 'c155', tier: null },
        ]),
      )
    }
  })

const load = async (page: Page) => {
  await page.goto('/')
  await expect(
    page.getByRole('region', { name: 'Warp Wall movie gallery' }),
  ).toBeVisible()
  // Skip the first-load screen (it may already be gone without WebGL).
  await page
    .getByRole('button', { name: 'Skip first time load' })
    .click({ timeout: 3_000 })
    .catch(() => {})
  await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached()
}

const openMenu = async (page: Page) => {
  await page.getByRole('button', { name: 'About ScrollFlix' }).click()
  await expect(
    page.getByRole('complementary', { name: 'About ScrollFlix' }),
  ).toBeVisible()
}

const closeMenu = async (page: Page) => {
  await page
    .getByRole('complementary', { name: 'About ScrollFlix' })
    .getByRole('button', { name: 'Close about' })
    .click()
  await expect(
    page.getByRole('complementary', { name: 'About ScrollFlix' }),
  ).toHaveCount(0)
}

const pathButton = (page: Page) =>
  page.getByRole('button', { name: 'History and favourites', exact: true })

test.describe('Globe lines start off', () => {
  test.beforeEach(async ({ page }) => {
    await seedPath(page)
    await load(page)
  })

  test('both switches are off and nothing is drawn by default', async ({
    page,
  }) => {
    // The button is always there; nothing is drawn until a switch is on.
    await expect(pathButton(page)).toBeVisible()
    await openMenu(page)
    for (const name of ['History on globe', 'Favourites on globe']) {
      const group = page.getByRole('group', { name })
      await expect(
        group.getByRole('button', { name: 'Off', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      await expect(
        group.getByRole('button', { name: 'On', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false')
    }
  })

  test('each switch has a line saying what it does', async ({ page }) => {
    await openMenu(page)
    const history = page.getByRole('group', { name: 'History on globe' })
    const favourites = page.getByRole('group', { name: 'Favourites on globe' })
    await expect(history).toContainText('trail of films')
    await expect(favourites).toContainText('films you’ve saved')
    // Always there: no pop-up to wait for or dismiss.
    await expect(page.locator('.warp-nudge-card')).toHaveCount(0)
    await expect(history).toHaveAttribute('aria-describedby', /.+/)
  })

  test('turning history on is reflected in its drawer tab', async ({
    page,
  }) => {
    await openMenu(page)
    await page
      .getByRole('group', { name: 'History on globe' })
      .getByRole('button', { name: 'On', exact: true })
      .click()

    await closeMenu(page)
    await expect(pathButton(page)).toBeVisible()
    await pathButton(page).click()
    await expect(
      page.getByRole('complementary', { name: 'History and favourites' }),
    ).toBeVisible()
    await expect(
      page.getByRole('switch', { name: 'Show history on globe' }),
    ).toHaveAttribute('aria-checked', 'true')

    // Off again leaves the button; the favourites switch is its own.
    await page.getByRole('switch', { name: 'Show history on globe' }).click()
    await expect(
      page.getByRole('switch', { name: 'Show history on globe' }),
    ).toHaveAttribute('aria-checked', 'false')
    await expect(pathButton(page)).toBeVisible()
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('wtw:constellations'),
      ),
    ).toBeNull()
  })

  test('turning favorite links on is remembered', async ({ page }) => {
    await openMenu(page)
    await page
      .getByRole('group', { name: 'Favourites on globe' })
      .getByRole('button', { name: 'On', exact: true })
      .click()
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('wtw:constellations'),
      ),
    ).toBe('1')
    await expect(pathButton(page)).toBeVisible()
  })
})

test.describe('An explicit choice on the old single switch', () => {
  test('is honoured by both', async ({ page }) => {
    await seedPath(page)
    await page.addInitScript(() => {
      window.localStorage.setItem('wtw:constellations', '1')
    })
    await load(page)
    await expect(pathButton(page)).toBeVisible()
    await openMenu(page)
    for (const name of ['History on globe', 'Favourites on globe']) {
      await expect(
        page
          .getByRole('group', { name })
          .getByRole('button', { name: 'On', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
    }
  })
})

test.describe('History and favourites', () => {
  test('one button, two tabs, each with its own globe switch', async ({
    page,
  }) => {
    await seedPath(page)
    await load(page)
    await pathButton(page).click()
    const drawer = page.getByRole('complementary', {
      name: 'History and favourites',
    })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('tab', { name: /^History/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(
      drawer.getByRole('switch', { name: 'Show history on globe' }),
    ).toBeVisible()

    await drawer.getByRole('tab', { name: /^Favourites/ }).click()
    await expect(
      drawer.getByRole('switch', { name: 'Show favourites on globe' }),
    ).toBeVisible()
    await expect(
      drawer.getByRole('switch', { name: 'Show history on globe' }),
    ).toHaveCount(0)
  })

  test('the history is kept in local storage across visits', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedPath(page)
    await load(page)
    const stored = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('wtw:session-path:v1') ?? '[]'),
    )
    expect(stored.length).toBeGreaterThanOrEqual(2)
    await page.reload()
    await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached({
      timeout: 60_000,
    })
    await pathButton(page).click()
    await expect(page.getByRole('tab', { name: /^History/ })).toContainText('2')
  })
})
