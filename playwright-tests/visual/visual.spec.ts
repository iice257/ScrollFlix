import { type Page, expect, test } from '@playwright/test'
import {
  DEVICES,
  type Device,
  type Scheme,
  globe,
  gotoGlobe,
  imagesSettled,
  prepare,
  shotName,
} from './support'

/**
 * Visual baselines: the poster globe and the screens around it, in desktop
 * (1440x900) and phone (390x844) viewports, light and dark.
 *
 * Why this exists: the other specs check URLs, currentSrc and naturalWidth, so
 * a poster that is cropped, overlapping or blurry still passed them. These
 * compare pixels.
 *
 * Selector / hook contract (other builders must keep these stable, or update
 * this spec in the same PR):
 *   canvas[aria-label="Infinite movie poster menu"]
 *     data-webgl-state="ready", data-texture-progress="100", data-item-count
 *   .warp-gallery-preloader[data-state="loading"|"ready"]
 *   [data-gallery-ready] on the shell ("false" while the loader covers the wall)
 *   [data-theme="light"|"dark"] on .warp-shell, from localStorage "wtw:theme"
 *   [data-loader-state="slow"] on the loader once loading has run long
 *   localStorage "wtw:session-path-lines" and "wtw:session-path:v1"
 * See README.md in this folder.
 */

const SCHEMES: Scheme[] = ['light', 'dark']
const DEVICE_NAMES: Device[] = ['desktop', 'phone']

const openMenu = async (page: Page, label: string) => {
  await page.getByRole('button', { name: label }).click()
}

for (const device of DEVICE_NAMES) {
  for (const scheme of SCHEMES) {
    test.describe(`${device} ${scheme}`, () => {
      test.use({
        ...DEVICES[device],
        colorScheme: scheme,
        timezoneId: 'Africa/Lagos',
        locale: 'en-US',
      })

      const snap = (state: string) => shotName(state, device, scheme)

      test('globe at rest after full load', async ({ page }) => {
        await prepare(page, { scheme })
        await gotoGlobe(page)
        await expect(page).toHaveScreenshot(snap('globe-rest'))
      })

      test('globe mid-spin (frame-locked)', async ({ page }) => {
        await prepare(page, { scheme })
        await gotoGlobe(page)
        // Stop the page's clock, then drive one scripted drag and let the
        // inertia run for an exact number of frames.
        await page.evaluate(() => window.__SF_TEST__.freeze())
        await page.evaluate(() => window.__SF_TEST__.step(4))
        const box = await globe(page).boundingBox()
        if (!box) throw new Error('globe has no box')
        const cx = box.x + box.width / 2
        const cy = box.y + box.height / 2
        await page.mouse.move(cx, cy)
        await page.mouse.down()
        for (let i = 1; i <= 10; i++) {
          await page.mouse.move(cx + i * 18, cy + i * 6)
          await page.evaluate(() => window.__SF_TEST__.step(1))
        }
        await page.mouse.up()
        await page.evaluate(() => window.__SF_TEST__.step(14))
        await expect(page).toHaveScreenshot(snap('globe-mid-spin'), {
          // Everything is frozen: no stability polling needed.
          timeout: 60_000,
        })
      })

      test('opened film card', async ({ page }) => {
        await prepare(page, { scheme })
        await gotoGlobe(page)
        await page.getByRole('button', { name: /^Open details for / }).click()
        await expect(
          page
            .getByRole('dialog')
            .or(page.locator('.warp-details-card'))
            .first(),
        ).toBeVisible()
        await imagesSettled(page, '.warp-details-card img')
        await page.waitForTimeout(1200)
        await page.mouse.move(1, 1)
        await expect(page).toHaveScreenshot(snap('film-card'))
      })

      test('index rows', async ({ page }) => {
        await prepare(page, { scheme })
        await gotoGlobe(page)
        await openMenu(page, 'Movie index')
        await expect(page.getByLabel('Movie list view')).toBeVisible()
        await imagesSettled(page, '.warp-list img')
        await page.waitForTimeout(1200)
        await page.mouse.move(1, 1)
        await expect(page).toHaveScreenshot(snap('index-rows'))
      })

      test('about page', async ({ page }) => {
        await prepare(page, { scheme })
        await gotoGlobe(page)
        await openMenu(page, 'About ScrollFlix')
        await expect(page.getByLabel('About ScrollFlix').last()).toBeVisible()
        await page.waitForTimeout(1200)
        await page.mouse.move(1, 1)
        await expect(page).toHaveScreenshot(snap('about'))
      })

      test('loader, normal', async ({ page }) => {
        const { release } = await prepare(page, { scheme, holdCatalogue: true })
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        const loader = page.locator('.warp-gallery-preloader')
        await expect(loader).toHaveAttribute('data-state', 'loading')
        await page.waitForTimeout(800)
        await expect(page).toHaveScreenshot(snap('loader'))
        release()
      })

      // Once loading has run long (6 s with no progress) the loader carries
      // data-loader-state="slow" and turns amber.
      test('loader, amber slow state', async ({ page }) => {
        const { release } = await prepare(page, { scheme, holdCatalogue: true })
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        const loader = page.locator('.warp-gallery-preloader')
        await expect(loader).toHaveAttribute('data-loader-state', 'slow', {
          timeout: 60_000,
        })
        await expect(page).toHaveScreenshot(snap('loader-slow'))
        release()
      })

      test('session path panel', async ({ page }) => {
        await prepare(page, { scheme, withPath: true })
        await gotoGlobe(page)
        await page
          .getByRole('button', { name: 'History and favourites' })
          .click()
        await expect(
          page.getByLabel('History and favourites').last(),
        ).toBeVisible()
        await page.waitForTimeout(1200)
        await page.mouse.move(1, 1)
        await expect(page).toHaveScreenshot(snap('session-path'))
      })

      test('share card', async ({ page }) => {
        await prepare(page, { scheme, withPath: true })
        await gotoGlobe(page)
        await page
          .getByRole('button', { name: 'History and favourites' })
          .click()
        await page.getByRole('button', { name: /share/i }).first().click()
        await page.waitForTimeout(2500)
        await page.mouse.move(1, 1)
        await expect(page).toHaveScreenshot(snap('share-card'))
      })
    })
  }
}

declare global {
  interface Window {
    __SF_TEST__: {
      freeze: () => void
      step: (frames?: number) => void
      pending: () => number
    }
  }
}
