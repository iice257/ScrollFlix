import { type Page, expect, test } from '@playwright/test'

// History and favourites on the globe start off, and the first time the
// menu opens each gets a small tip explaining it. One button opens a drawer
// with a tab for each.

// Two landings, so the history has something to show once it is on.
const seedPath = (page: Page) =>
  page.addInitScript(() => {
    const key = 'wtw:session-path:v1'
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(
        key,
        JSON.stringify([
          { id: '27205', tier: null },
          { id: '76203', tier: null },
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
  page.getByRole('button', { name: 'History and favourites' })

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

  test('the first menu open shows a tip for each, clear of the switches', async ({
    page,
  }) => {
    await openMenu(page)
    const tips = page.getByRole('tooltip')
    await expect(tips).toHaveCount(2)
    await expect(tips.nth(0)).toContainText('trail of films')
    await expect(tips.nth(1)).toContainText('films you’ve saved')
    await expect(tips.nth(0)).toHaveCSS('opacity', '1')
    await expect(tips.nth(1)).toHaveCSS('opacity', '1')

    // Each switch points at its tip for screen readers.
    for (const [name, index] of [
      ['History on globe', 0],
      ['Favourites on globe', 1],
    ] as const) {
      const group = page.getByRole('group', { name })
      const id = await tips.nth(index).getAttribute('id')
      await expect(group).toHaveAttribute('aria-describedby', id ?? '')
    }

    // The tips stay on screen and never cover either switch.
    const viewport = page.viewportSize()
    const switches = await page
      .locator('.warp-theme-switch')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.closest('.warp-about-setting.has-nudge'))
          .map((node) => {
            const box = node.getBoundingClientRect()
            return {
              left: box.left,
              top: box.top,
              right: box.right,
              bottom: box.bottom,
            }
          }),
      )
    expect(switches).toHaveLength(2)
    for (let index = 0; index < 2; index += 1) {
      const box = await tips.nth(index).boundingBox()
      expect(box).not.toBeNull()
      if (!box || !viewport) continue
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      expect(box.y).toBeGreaterThanOrEqual(0)
      for (const target of switches) {
        const apart =
          box.x + box.width <= target.left ||
          box.x >= target.right ||
          box.y + box.height <= target.top ||
          box.y >= target.bottom
        expect(apart).toBe(true)
      }
    }
  })

  test('Esc dismisses the tips first, and they stay gone', async ({ page }) => {
    await openMenu(page)
    await expect(page.getByRole('tooltip')).toHaveCount(2)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    // The menu itself is still open; a second Esc closes it.
    await expect(
      page.getByRole('complementary', { name: 'About ScrollFlix' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('complementary', { name: 'About ScrollFlix' }),
    ).toHaveCount(0)

    await openMenu(page)
    await expect(page.getByRole('tooltip')).toHaveCount(0)

    // Even after a reload.
    await page.reload()
    await page
      .getByRole('button', { name: 'Skip first time load' })
      .click({ timeout: 3_000 })
      .catch(() => {})
    await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached()
    await openMenu(page)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

  test('the close button dismisses one tip and leaves the other', async ({
    page,
  }) => {
    await openMenu(page)
    await page
      .getByRole('button', { name: 'Dismiss tip: History on globe' })
      .click()
    await expect(page.getByRole('tooltip')).toHaveCount(1)
    await expect(page.getByRole('tooltip')).toContainText('films you’ve saved')
    await expect(
      page.getByRole('group', { name: 'History on globe' }),
    ).not.toHaveAttribute('aria-describedby')
  })

  test('turning history on is reflected in its drawer tab, and ends its tip', async ({
    page,
  }) => {
    await openMenu(page)
    await page
      .getByRole('group', { name: 'History on globe' })
      .getByRole('button', { name: 'On', exact: true })
      .click()
    // Only the favorite links tip is left.
    await expect(page.getByRole('tooltip')).toHaveCount(1)
    await expect(page.getByRole('tooltip')).toContainText('films you’ve saved')

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

  test('turning favorite links on is remembered and ends its tip', async ({
    page,
  }) => {
    await openMenu(page)
    await page
      .getByRole('group', { name: 'Favourites on globe' })
      .getByRole('button', { name: 'On', exact: true })
      .click()
    await expect(page.getByRole('tooltip')).toHaveCount(1)
    await expect(page.getByRole('tooltip')).toContainText('trail of films')
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('wtw:constellations'),
      ),
    ).toBe('1')
    await expect(pathButton(page)).toBeVisible()
  })
})

test.describe('An explicit choice on the old single switch', () => {
  test('is honoured by both, and gets no tips', async ({ page }) => {
    await seedPath(page)
    await page.addInitScript(() => {
      window.localStorage.setItem('wtw:constellations', '1')
    })
    await load(page)
    await expect(pathButton(page)).toBeVisible()
    await openMenu(page)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
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
    await seedPath(page)
    await load(page)
    const stored = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('wtw:session-path:v1') ?? '[]'),
    )
    expect(stored.length).toBeGreaterThanOrEqual(2)
    await page.reload()
    await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached()
    await pathButton(page).click()
    await expect(page.getByRole('tab', { name: /^History/ })).toContainText('2')
  })
})
