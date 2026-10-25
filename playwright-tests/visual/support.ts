import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', 'fixtures')
const read = (...parts: string[]) => readFileSync(join(fixtures, ...parts))

export type Scheme = 'light' | 'dark'
export type Device = 'desktop' | 'phone'

export const DEVICES: Record<
  Device,
  {
    viewport: { width: number; height: number }
    isMobile: boolean
    hasTouch: boolean
  }
> = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
  phone: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
}

/** The session path every state that needs one is seeded with. */
export const PATH_IDS = ['c900002', 'c900007', 'c900011', 'c900016', 'c900020']

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

/**
 * Runs in the page before any app code. Everything here is test-side: the app
 * has no test hooks.
 *
 *  - Math.random is seeded, so the first centred film, shuffles and any other
 *    random choice repeat.
 *  - window.__SF_TEST__ is a frame lock. In its normal (live) mode the page
 *    runs untouched. freeze() stops the page's clock: performance.now() holds
 *    one fixed value and requestAnimationFrame callbacks queue until step()
 *    runs them, one frame (16.667 ms) at a time. Together with scripted
 *    pointer events that makes drag inertia, and so a mid-spin frame, exactly
 *    repeatable.
 */
const determinismScript = ({
  scheme,
  seedPath,
}: {
  scheme: Scheme
  seedPath: string[] | null
}) => {
  const FRAME = 1000 / 60
  // Far beyond any real uptime, so every time-based fade has long finished.
  const FROZEN_AT = 1_000_000

  // Seeded Math.random (mulberry32).
  let seed = 0x5f1ec7
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // Frame lock.
  const realRaf = window.requestAnimationFrame.bind(window)
  const realCaf = window.cancelAnimationFrame.bind(window)
  const realNow = performance.now.bind(performance)
  let frozen = false
  let virtual = 0
  let nextId = 1
  const queue = new Map<number, FrameRequestCallback>()
  performance.now = () => (frozen ? virtual : realNow())
  window.requestAnimationFrame = (callback) => {
    if (frozen) {
      const id = -nextId++
      queue.set(id, callback)
      return id
    }
    return realRaf((time) => {
      // A frame that was already scheduled when time stopped must not run.
      if (frozen) queue.set(-nextId++, callback)
      else callback(time)
    })
  }
  window.cancelAnimationFrame = (id) => {
    if (id < 0) queue.delete(id)
    else realCaf(id)
  }
  const frameLock = {
    freeze() {
      frozen = true
      virtual = FROZEN_AT
    },
    step(frames = 1) {
      for (let i = 0; i < frames; i++) {
        virtual += FRAME
        const due = [...queue]
        queue.clear()
        for (const [, callback] of due) callback(virtual)
      }
    },
    pending: () => queue.size,
  }
  Object.defineProperty(window, '__SF_TEST__', { value: frameLock })

  // Settings and "seen" flags, so no hint, nudge or tip covers the screen.
  try {
    const store = window.localStorage
    store.setItem('wtw:theme', scheme)
    store.setItem('wtw:spin-hint-seen', '1')
    store.setItem('wtw:fullscreen-hint-seen', '1')
    store.setItem('wtw:mood-nudge-seen', '1')
    window.sessionStorage.setItem('wtw:mood-nudge-seen', '1')
    if (seedPath) {
      store.setItem('wtw:session-path-lines', '1')
      window.sessionStorage.setItem(
        'wtw:session-path:v1',
        JSON.stringify(seedPath.map((id) => ({ id, tier: null }))),
      )
    }
  } catch {
    // Storage unavailable: the test will show it.
  }
}

const TMDB_POSTER = /^https:\/\/image\.tmdb\.org\/t\/p\/w\d+\/([\w-]+)\.jpg$/

type PrepareOptions = {
  scheme: Scheme
  /** Seed the session path (and switch its globe lines on). */
  withPath?: boolean
  /** Hold the catalogue's film chunk until released() is called. */
  holdCatalogue?: boolean
}

/**
 * Installs everything that makes a run reproducible, before navigation:
 * seeded randomness, the frame lock, seeded local storage, the fixture
 * catalogue, fixture posters and a local copy of the web font. Everything
 * else that leaves the machine is refused.
 */
export const prepare = async (
  page: Page,
  { scheme, withPath = false, holdCatalogue = false }: PrepareOptions,
) => {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' })
  await page.addInitScript(determinismScript, {
    scheme,
    seedPath: withPath ? PATH_IDS : null,
  })

  let release: () => void = () => {}
  const released = holdCatalogue
    ? new Promise<void>((resolve) => {
        release = resolve
      })
    : Promise.resolve()

  const cors = { 'access-control-allow-origin': '*' }
  const json = (file: string) => ({
    contentType: 'application/json',
    headers: cors,
    body: read('catalog', file),
  })

  await page.route('**/json/catalog/**', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop() ?? ''
    if (file.startsWith('c0-')) await released
    await route.fulfill(json(file))
  })

  await page.route(/^https:\/\/image\.tmdb\.org\//, (route) => {
    const match = TMDB_POSTER.exec(route.request().url())
    if (!match) return route.abort()
    try {
      return route.fulfill({
        contentType: 'image/jpeg',
        headers: cors,
        body: read('posters', `${match[1]}.jpg`),
      })
    } catch {
      return route.fulfill({ status: 404, headers: cors })
    }
  })

  // The web font (DM Sans) is served from the repository, not Google.
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'text/css',
      headers: cors,
      body: `@font-face{font-family:'DM Sans';font-style:normal;font-weight:100 1000;font-display:block;src:url(https://fonts.gstatic.com/fixture/dm-sans.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-style:italic;font-weight:100 1000;font-display:block;src:url(https://fonts.gstatic.com/fixture/dm-sans-italic.woff2) format('woff2')}`,
    }),
  )
  await page.route('https://fonts.gstatic.com/fixture/*', (route) => {
    const italic = route.request().url().includes('italic')
    return route.fulfill({
      contentType: 'font/woff2',
      headers: cors,
      body: read(
        'fonts',
        italic ? 'dm-sans-latin-italic.woff2' : 'dm-sans-latin.woff2',
      ),
    })
  })

  // Nothing else may leave the machine (analytics, telemetry, weather, video).
  await page.route(
    (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
    (route) => {
      const host = new URL(route.request().url()).hostname
      if (host === 'image.tmdb.org' || host.startsWith('fonts.g')) {
        return route.fallback()
      }
      return route.abort()
    },
  )

  return { release }
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export const globe = (page: Page) => page.getByLabel('Infinite movie poster menu')

/**
 * The globe is "complete" when every poster texture has been uploaded
 * (data-texture-progress=100), WebGL reports ready, the loader has handed over
 * and every fixture poster image the page asked for has arrived.
 */
export const waitForGlobeComplete = async (page: Page) => {
  const canvas = globe(page)
  await expect(canvas).toHaveAttribute('data-webgl-state', 'ready', {
    timeout: 120_000,
  })
  await expect(canvas).toHaveAttribute('data-texture-progress', '100')
  await expect(page.locator('.warp-gallery-preloader')).toHaveAttribute(
    'data-state',
    'ready',
  )
  await expect(page.locator('[data-gallery-ready="false"]')).toHaveCount(0)
  // Let the reveal fades and the level-of-detail swaps finish (the screenshot
  // assertion's own stability check then confirms nothing is still moving).
  await page.waitForTimeout(2500)
}

export const gotoGlobe = async (page: Page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitForGlobeComplete(page)
}

export const imagesSettled = async (page: Page, selector = 'img') => {
  await expect
    .poll(
      () =>
        page.evaluate(
          (sel) =>
            [...document.querySelectorAll<HTMLImageElement>(sel)].every(
              (img) => img.complete && img.naturalWidth > 0,
            ),
          selector,
        ),
      { timeout: 30_000 },
    )
    .toBe(true)
}

export const shotName = (state: string, device: Device, scheme: Scheme) =>
  `${state}-${device}-${scheme}.png`
