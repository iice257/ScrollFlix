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

  test('choosing Dynamic in the menu applies it and says where location comes from', async ({
    page,
  }) => {
    await stubSky(page, { isDay: false, weather: 'rain' })
    // The globe-line tips would sit over the switch on a first open.
    await page.addInitScript(() => {
      for (const kind of ['path', 'links'])
        window.localStorage.setItem(`wtw:globe-lines-nudge:${kind}:v1`, '1')
    })
    await load(page)
    await expect(shell(page)).toHaveAttribute('data-theme-pref', 'dark')
    await page.getByRole('button', { name: 'About ScrollFlix' }).click()
    const menu = page.getByRole('complementary', { name: 'About ScrollFlix' })
    await expect(menu).toBeVisible()
    // First open: a one-time hint says what Dynamic is, and where location
    // comes from.
    await expect(
      menu.getByText(/Follows your daylight and weather/),
    ).toBeVisible()
    await expect(menu.getByText(/Location comes from your IP/)).toBeVisible()
    await menu.getByRole('button', { name: 'Dynamic', exact: true }).click()
    await expect(shell(page)).toHaveAttribute('data-theme-pref', 'dynamic')
    await expect(shell(page)).toHaveAttribute('data-theme', 'dark')
    await expect(shell(page)).toHaveAttribute('data-weather', 'rain')
    await expect(menu.getByText('is it raining outside?')).toBeVisible()
    await expect(menu.getByText(/Location comes from your IP/)).toBeVisible()
    await expect(page.locator('canvas.warp-ambient-weather')).toBeAttached()
    // Going back to Light drops the overlay.
    await menu.getByRole('button', { name: 'Light', exact: true }).click()
    await expect(shell(page)).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('canvas.warp-ambient-weather')).toHaveCount(0)
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
