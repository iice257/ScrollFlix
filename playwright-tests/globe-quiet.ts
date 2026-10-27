import { type Page, expect } from '@playwright/test'

// Waits until the globe is ready (every poster on screen settled) and has then
// finished filling in the rest of itself. The specs that time a gesture (a 3 s
// hold, a paced drag) need it: software WebGL (CI) shares the CPU with that
// background loading, and a stalled frame turns a drag into a hold. Tolerates
// builds without the debug hook, and gives up quietly after `ms`.
export const waitForGlobeQuiet = async (page: Page, ms = 60_000) => {
  await expect(page.locator('canvas[data-webgl-state]')).toHaveAttribute(
    'data-webgl-state',
    'ready',
    { timeout: ms },
  )
  await page
    .waitForFunction(
      () => {
        const load = (
          window as unknown as {
            __scrollflixDebug?: { load?: () => { pending?: number } | null }
          }
        ).__scrollflixDebug?.load?.()
        return !load || (load.pending ?? 0) <= 2
      },
      null,
      { timeout: ms },
    )
    .catch(() => {})
}
