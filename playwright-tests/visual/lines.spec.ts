import { expect, test } from '@playwright/test'
import {
  type Device,
  type LineScene,
  type Scheme,
  dragLinesIntoView,
  gotoGlobe,
  prepare,
  seedLines,
  shotName,
} from './support'

/**
 * The history lines on the globe, which no other baseline shows: the history
 * panel dims the globe behind it, and the other states never turn the lines
 * on. A line that is far too wide, too bright or missing altogether passed
 * every earlier check.
 *
 * They are drawn by their own shader, in screen pixels scaled by the display's
 * pixel ratio, so they run at the ratios real phones have (2 and 3) instead of
 * the 1 the other baselines use. The same spec runs in WebKit (see
 * playwright.visual-webkit.config.ts), because that is the engine on iPhones.
 */

const DEVICE_NAMES: Device[] = ['desktop', 'phone']
const SCHEMES: Scheme[] = ['dark', 'light']
const SCENES: LineScene[] = ['plain', 'tiers']

const SIZES: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
}
const PIXEL_RATIO: Record<Device, number> = { desktop: 2, phone: 3 }

for (const device of DEVICE_NAMES) {
  for (const scheme of SCHEMES) {
    for (const scene of SCENES) {
      test.describe(`${device} ${scheme} ${scene}`, () => {
        test.use({
          viewport: SIZES[device],
          deviceScaleFactor: PIXEL_RATIO[device],
          isMobile: device === 'phone',
          hasTouch: device === 'phone',
          colorScheme: scheme,
          timezoneId: 'Africa/Lagos',
          locale: 'en-US',
        })

        test('history lines on the globe', async ({ page }) => {
          await prepare(page, { scheme })
          await seedLines(page, scene)
          await gotoGlobe(page)
          await dragLinesIntoView(page, device)
          await page.mouse.move(1, 1)
          await expect(page).toHaveScreenshot(
            shotName(`lines-${scene}`, device, scheme),
            { timeout: 60_000 },
          )
        })
      })
    }
  }
}
