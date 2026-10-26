// Card probe: opens a film from the globe and records how its poster loads.
//
//   node scripts/perf/card-probe.mjs <url> <screenshot.png> [--phone] [--dpr1]
//
// Prints the card poster's load states over time and every TMDB poster
// request after the tap (with failures), the evidence for the card-image
// findings in docs/superpowers/plans/2026-10-26-R-regression-audit.md.
import { chromium } from 'playwright'
const url = process.argv[2]
const phone = process.argv.includes('--phone')
const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: process.argv.includes('--dpr1') ? 1 : 2 })
if (!phone) await context.addInitScript(() => { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }); Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 }) })
const page = await context.newPage()
const t0 = Date.now()
const log = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push({ t: Date.now() - t0, kind: 'console', text: m.text().slice(0, 160) }) })
page.on('requestfailed', (r) => { if (r.url().includes('tmdb')) log.push({ t: Date.now() - t0, kind: 'failed', url: r.url().replace('https://image.tmdb.org/t/p/', ''), err: r.failure()?.errorText }) })
let opened = 0
page.on('request', (r) => { if (opened && /\/t\/p\/(w342|w500|w780|w154)\//.test(r.url())) log.push({ t: Date.now() - t0, kind: 'req', url: r.url().replace('https://image.tmdb.org/t/p/', ''), mode: r.headers()['sec-fetch-mode'] ?? '?', dest: r.headers()['sec-fetch-dest'] ?? '?', type: r.resourceType() }) })
await page.goto(url)
await page.waitForSelector('[data-gallery-ready="true"]', { timeout: 60000 }).catch(() => {})
await page.waitForTimeout(1500)
opened = Date.now()
const box = await page.locator('canvas[data-webgl-state]').first().boundingBox()
if (phone) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.48)
else await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.48)
const states = []
while (Date.now() - opened < 9000) {
  const s = await page.evaluate(() => [...document.querySelectorAll('.warp-details-poster [data-poster-state]')].map((e) => e.getAttribute('data-poster-state')).join(',')).catch(() => null)
  if (!states.length || states[states.length - 1].s !== s) states.push({ t: Date.now() - opened, s })
  await page.waitForTimeout(40)
}
await page.screenshot({ path: process.argv[3] })
console.log(JSON.stringify({ states, log: log.filter((e) => e.t >= opened - t0 - 100).slice(0, 40) }, null, 1))
await browser.close()
