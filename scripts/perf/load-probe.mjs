// Load probe: opens the app in Chromium and records what a first visit costs.
//
//   node scripts/perf/load-probe.mjs <url> [--phone] [--warm] [--slow]
//     [--skip-at=<percent>] [--open-card] [--seconds=<n>]
//
// Prints one JSON object: the loader's progress timeline, when the gallery
// became ready, image requests and bytes per TMDB size, the active film over
// time (to catch the globe switching films on its own), console errors (CORS
// failures show up here) and, with --open-card, how long the card's poster
// took to become sharp. Used for the before/after numbers in the regression
// audit (docs/superpowers/plans/2026-10-26-R-regression-audit.md).
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const url = args.find((arg) => !arg.startsWith('--')) ?? 'http://localhost:4173'
const flag = (name) => args.includes(`--${name}`)
const option = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : fallback
}
const phone = flag('phone')
const seconds = option('seconds', 25)
const skipAt = option('skip-at', null)

const proxy = process.env.HTTPS_PROXY
  ? { server: process.env.HTTPS_PROXY }
  : undefined
const browser = await chromium.launch({
  proxy,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const context = await browser.newContext(
  phone
    ? {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
)
// A desktop profile is a desktop machine: the app treats 4 cores or 4 GB as
// a lightweight device, which this container would otherwise report.
if (!phone)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
  })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
if (flag('slow')) {
  // Roughly "Fast 3G".
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
}

const start = Date.now()
const at = () => Date.now() - start
const images = new Map()
const toKB = (entry) => ({ ...entry, kb: Math.round(entry.bytes / 1024) })
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error')
    consoleErrors.push({ t: at(), text: message.text().slice(0, 200) })
})
page.on('requestfinished', async (request) => {
  const href = request.url()
  const match = /image\.tmdb\.org\/t\/p\/(\w+)\//.exec(href)
  if (!match) return
  const size = match[1]
  const entry = images.get(size) ?? { count: 0, bytes: 0, firstAt: at() }
  entry.count += 1
  try {
    const response = await request.response()
    const length = Number(response?.headers()['content-length'] ?? 0)
    entry.bytes += Number.isFinite(length) ? length : 0
  } catch {}
  images.set(size, entry)
})

const run = async () => {
  if (flag('warm')) {
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForTimeout(seconds * 1000)
    images.clear()
    consoleErrors.length = 0
  }
  const navStart = Date.now()
  await page.goto(url, { waitUntil: 'commit' })
  const timeline = []
  const titles = []
  let readyAt = null
  let firstPaintAt = null
  let skipped = false
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => {
        const shell = document.querySelector('[data-gallery-ready]')
        const percent = document.querySelector('.warp-preloader-percent')
        const peek = document.querySelector('.warp-active-peek span')
        const canvas = document.querySelector('canvas[data-webgl-state]')
        return {
          ready: shell?.getAttribute('data-gallery-ready') === 'true',
          percent: percent ? percent.textContent : null,
          title: peek ? peek.textContent : null,
          webgl: canvas ? canvas.getAttribute('data-webgl-state') : null,
          boot: Boolean(document.querySelector('#boot-loader')),
        }
      })
      .catch(() => null)
    const t = Date.now() - navStart
    if (state) {
      if (firstPaintAt === null && (state.percent || state.boot))
        firstPaintAt = t
      const last = timeline[timeline.length - 1]
      if (!last || last.percent !== state.percent)
        timeline.push({ t, percent: state.percent })
      const lastTitle = titles[titles.length - 1]
      if (state.title && (!lastTitle || lastTitle.title !== state.title))
        titles.push({ t, title: state.title })
      if (state.ready && readyAt === null) readyAt = t
      if (
        skipAt !== null &&
        !skipped &&
        !state.ready &&
        Number.parseInt(state.percent ?? '0', 10) >= skipAt
      ) {
        skipped = true
        await page
          .click('.warp-preloader-skip', { timeout: 1000 })
          .catch(() => {})
      }
    }
    await page.waitForTimeout(100)
  }

  let card = null
  if (flag('open-card')) {
    const opened = Date.now()
    await page
      .click('.warp-cta', { timeout: 5000, force: true })
      .catch((error) => consoleErrors.push({ t: at(), text: String(error).slice(0, 120) }))
    let sharpAt = null
    let states = []
    while (Date.now() - opened < 12000) {
      const state = await page
        .evaluate(
          () =>
            document
              .querySelector('.warp-details-poster [data-poster-state]')
              ?.getAttribute('data-poster-state') ?? null,
        )
        .catch(() => null)
      const last = states[states.length - 1]
      if (!last || last.state !== state)
        states.push({ t: Date.now() - opened, state })
      if (state === 'loaded') {
        sharpAt = Date.now() - opened
        break
      }
      await page.waitForTimeout(25)
    }
    card = { sharpAt, states }
  }

  const lod = await page
    .evaluate(() => {
      const stats = window.__scrollflixDebug?.lod?.()
      return stats
        ? {
            midResident: stats.midResident,
            detailResident: stats.detailResident,
            inflight: stats.inflight,
            visiblePosters: stats.widths.length,
            medianWidthPx: stats.widths.sort((a, b) => a - b)[
              Math.floor(stats.widths.length / 2)
            ],
            textureMB: Math.round((stats.textureBytes / 1048576) * 10) / 10,
          }
        : null
    })
    .catch(() => null)

  return {
    url,
    phone,
    warm: flag('warm'),
    slow: flag('slow'),
    firstPaintAt,
    readyAt,
    timeline,
    titles,
    images: Object.fromEntries([...images].map(([k, v]) => [k, toKB(v)])),
    imageRequests: [...images.values()].reduce((sum, e) => sum + e.count, 0),
    imageKB: Math.round(
      [...images.values()].reduce((sum, e) => sum + e.bytes, 0) / 1024,
    ),
    lod,
    card,
    consoleErrors: consoleErrors.slice(0, 12),
    consoleErrorCount: consoleErrors.length,
  }
}

try {
  console.log(JSON.stringify(await run(), null, 1))
} finally {
  await browser.close()
}
