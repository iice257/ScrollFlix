import { type Page, expect, test } from '@playwright/test'

// The Dynamic theme asks /api/weather (stubbed here) and turns it into the
// light or dark theme plus rain or snow. Other themes never ask.

const stubSky = (page: Page, body: { isDay: boolean; weather: string }) =>
  page.route('**/api/weather', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  )

const countWeatherRequests = (page: Page) => {
  const seen: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/weather')
      seen.push(request.url())
  })
  return seen
}

const load = async (page: Page, query = '') => {
  await page.goto(`/${query}`)
  await expect(
    page.getByRole('region', { name: 'Warp Wall movie gallery' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Skip first time load' })
    .click({ timeout: 3_000 })
    .catch(() => {})
  await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached()
}

const shell = (page: Page) => page.locator('main.warp-shell')

// The globe-line tips would sit over the switch on a first open.
const skipLineNudges = (page: Page) =>
  page.addInitScript(() => {
    for (const kind of ['path', 'links'])
      window.localStorage.setItem(`wtw:globe-lines-nudge:${kind}:v1`, '1')
  })

const openMenu = async (page: Page) => {
  await page.getByRole('button', { name: 'About ScrollFlix' }).click()
  const menu = page.getByRole('complementary', { name: 'About ScrollFlix' })
  await expect(menu).toBeVisible()
  return menu
}

const tip = (page: Page) => page.locator('.warp-theme-tip')

test.describe('Dynamic theme', () => {
  test('night snow is the dark theme with a snow overlay', async ({ page }) => {
    await stubSky(page, { isDay: false, weather: 'snow' })
    await page.addInitScript(() =>
      window.localStorage.setItem('wtw:theme', 'dynamic'),
    )
    await load(page)
    await expect(shell(page)).toHaveAttribute('data-theme-pref', 'dynamic')
    await expect(shell(page)).toHaveAttribute('data-theme', 'dark')
    await expect(shell(page)).toHaveAttribute('data-weather', 'snow')
    const overlay = page.locator('canvas.warp-ambient-weather')
    await expect(overlay).toBeAttached()
    await expect(overlay).toHaveAttribute('data-weather', 'snow')
    // It never takes a click away from the globe.
    await expect(overlay).toHaveCSS('pointer-events', 'none')
  })

  test('day rain is the light theme with a rain overlay', async ({ page }) => {
    await stubSky(page, { isDay: true, weather: 'rain' })
    await page.addInitScript(() =>
      window.localStorage.setItem('wtw:theme', 'dynamic'),
    )
    await load(page)
    await expect(shell(page)).toHaveAttribute('data-theme', 'light')
    await expect(shell(page)).toHaveAttribute('data-weather', 'rain')
    await expect(page.locator('canvas.warp-ambient-weather')).toHaveAttribute(
      'data-weather',
      'rain',
    )
  })

  test('clear weather has no overlay', async ({ page }) => {
    await stubSky(page, { isDay: true, weather: 'clear' })
    await page.addInitScript(() =>
      window.localStorage.setItem('wtw:theme', 'dynamic'),
    )
    await load(page)
    await expect(shell(page)).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('canvas.warp-ambient-weather')).toHaveCount(0)
  })

  test('falls back to the clock when the endpoint has no answer', async ({
    page,
  }) => {
    await page.route('**/api/weather', (route) =>
      route.fulfill({ status: 204 }),
    )
    await page.addInitScript(() =>
      window.localStorage.setItem('wtw:theme', 'dynamic'),
    )
    await load(page)
    const hour = await page.evaluate(() => new Date().getHours())
    await expect(shell(page)).toHaveAttribute(
      'data-theme',
      hour >= 7 && hour < 19 ? 'light' : 'dark',
    )
    await expect(page.locator('canvas.warp-ambient-weather')).toHaveCount(0)
  })

  test('choosing Dynamic in the menu applies it and names the sky', async ({
    page,
  }) => {
    await stubSky(page, { isDay: false, weather: 'rain' })
    await skipLineNudges(page)
    await load(page)
    await expect(shell(page)).toHaveAttribute('data-theme-pref', 'dark')
    const menu = await openMenu(page)
    await menu.getByRole('button', { name: 'Dynamic', exact: true }).click()
    await expect(shell(page)).toHaveAttribute('data-theme-pref', 'dynamic')
    await expect(shell(page)).toHaveAttribute('data-theme', 'dark')
    await expect(shell(page)).toHaveAttribute('data-weather', 'rain')
    await expect(menu.getByText('is it raining outside?')).toBeVisible()
    await expect(page.locator('canvas.warp-ambient-weather')).toBeAttached()
    // Choosing it answers the first-open tip.
    await expect(tip(page)).toHaveCount(0)
    // Going back to Light drops the overlay.
    await menu.getByRole('button', { name: 'Light', exact: true }).click()
    await expect(shell(page)).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('canvas.warp-ambient-weather')).toHaveCount(0)
  })

  test('the one tip shows on the first open, with only the one line', async ({
    page,
  }) => {
    await skipLineNudges(page)
    await load(page)
    await openMenu(page)
    await expect(tip(page)).toBeVisible()
    await expect(tip(page)).toContainText('Follows your daylight and weather')
    await expect(page.getByText(/Location comes from your IP/)).toHaveCount(0)
    // One tip, not two.
    await expect(page.locator('.warp-theme-tip')).toHaveCount(1)
    await expect(page.locator('.warp-setting-note')).toHaveCount(0)
  })

  test('the close button dismisses the tip and it stays dismissed', async ({
    page,
  }) => {
    await skipLineNudges(page)
    await load(page)
    const menu = await openMenu(page)
    await expect(tip(page)).toBeVisible()
    await tip(page).getByRole('button', { name: 'Close' }).click()
    await expect(tip(page)).toHaveCount(0)
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('wtw:dynamic-theme-hint:v1'),
      ),
    ).toBe('1')
    // Hovering the option still shows it...
    await menu.getByRole('button', { name: 'Dynamic', exact: true }).hover()
    await expect(tip(page)).toBeVisible()
    // ...but the first-open one does not come back after a reload.
    await page.reload()
    await page
      .getByRole('button', { name: 'Skip first time load' })
      .click({ timeout: 3_000 })
      .catch(() => {})
    await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached()
    await openMenu(page)
    await page.waitForTimeout(900)
    await expect(tip(page)).toHaveCount(0)
  })

  test('tapping outside dismisses the first-open tip for good', async ({
    page,
  }) => {
    await skipLineNudges(page)
    await load(page)
    await openMenu(page)
    await expect(tip(page)).toBeVisible()
    await page.mouse.click(5, 5)
    await expect(tip(page)).toHaveCount(0)
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('wtw:dynamic-theme-hint:v1'),
      ),
    ).toBe('1')
  })

  test('the tip never gets in the way of Esc closing the menu', async ({
    page,
  }) => {
    await skipLineNudges(page)
    await load(page)
    const menu = await openMenu(page)
    await expect(tip(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  })

  for (const pref of ['dark', 'light']) {
    test(`the ${pref} theme never asks for the weather`, async ({ page }) => {
      const requests = countWeatherRequests(page)
      await stubSky(page, { isDay: false, weather: 'snow' })
      await page.addInitScript(
        (value) => window.localStorage.setItem('wtw:theme', value),
        pref,
      )
      await load(page)
      await expect(shell(page)).toHaveAttribute('data-theme', pref)
      await page.waitForTimeout(1_000)
      expect(requests).toEqual([])
      await expect(page.locator('canvas.warp-ambient-weather')).toHaveCount(0)
    })
  }

  test('an unknown saved theme falls back to dark', async ({ page }) => {
    const requests = countWeatherRequests(page)
    await page.addInitScript(() =>
      window.localStorage.setItem('wtw:theme', 'sepia'),
    )
    await load(page)
    await expect(shell(page)).toHaveAttribute('data-theme', 'dark')
    expect(requests).toEqual([])
  })
})
