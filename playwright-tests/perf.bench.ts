import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { type Page, expect, test } from '@playwright/test'

// `npm run perf`. Spins the globe for a fixed time with each feature toggled
// and prints a frame-time table (also written to test-results/perf.md).
//
// Feature flags (see perf-probe.ts) override the stored settings:
// constellations / path / weather = 0|1. Shuffle Pro is driven through its
// debug panel, since a held run cannot be combined with a mouse drag.

const SPIN_MS = 6_000
const SPIN_SPEED_PX_PER_S = 600
const SPIN_RADIUS_PX = 220
const IDLE_MS = 3_000
const SHUFFLE_MS = 4_500
const POP_MS = 2_000
// Ten of the first 216 films (all on the globe, all with a local poster).
const SAVED_INDICES = [3, 20, 41, 58, 77, 95, 112, 130, 149, 168, 187, 205]
const PATH_INDICES = [8, 33, 64, 12, 101, 140, 175, 90, 52, 27]
const PATH_TIERS = [
  null,
  'frost',
  null,
  'amethyst',
  'jade',
  null,
  'gold',
  'frost',
  null,
  'jade',
]

type Scenario = {
  name: string
  constellations: boolean
  path: boolean
  weather: boolean
  pro: boolean
  idle?: boolean
  // Shuffle (spin to a random pick) and the card opening on a film.
  shuffle?: boolean
  pop?: boolean
  // The row this one is compared with.
  versus: string | null
}

const SCENARIOS: Scenario[] = [
  {
    name: 'all-off',
    constellations: false,
    path: false,
    weather: false,
    pro: false,
    versus: null,
  },
  {
    name: 'constellations',
    constellations: true,
    path: false,
    weather: false,
    pro: false,
    versus: 'all-off',
  },
  {
    name: 'path',
    constellations: false,
    path: true,
    weather: false,
    pro: false,
    versus: 'all-off',
  },
  {
    name: 'constellations+path',
    constellations: true,
    path: true,
    weather: false,
    pro: false,
    versus: 'all-off',
  },
  {
    name: 'weather',
    constellations: false,
    path: false,
    weather: true,
    pro: false,
    versus: 'all-off',
  },
  {
    name: 'pro',
    constellations: false,
    path: false,
    weather: false,
    pro: true,
    versus: null,
  },
  {
    name: 'all-on',
    constellations: true,
    path: true,
    weather: true,
    pro: true,
    versus: 'pro',
  },
  {
    name: 'shuffle',
    constellations: false,
    path: false,
    weather: false,
    pro: false,
    shuffle: true,
    versus: null,
  },
  {
    name: 'shuffle-all-on',
    constellations: true,
    path: true,
    weather: true,
    pro: false,
    shuffle: true,
    versus: 'shuffle',
  },
  {
    name: 'card-pop',
    constellations: true,
    path: true,
    weather: false,
    pro: false,
    pop: true,
    versus: null,
  },
  {
    name: 'idle-all-on',
    constellations: true,
    path: true,
    weather: true,
    pro: false,
    idle: true,
    versus: null,
  },
]

type Row = {
  name: string
  frames: number
  p50: number
  p95: number
  p99: number
  workP95: number
  longTasks: number
  rafPerSecond: number | null
  versus: string | null
}

const rows: Row[] = []

const localIds = (indices: number[]) => {
  const manifest = JSON.parse(
    readFileSync('public/json/catalog/manifest.json', 'utf8'),
  ) as { chunks: string[] }
  const films = JSON.parse(
    readFileSync(`public/json/catalog/${manifest.chunks[0]}`, 'utf8'),
  ) as Array<[number | string]>
  return indices.map((index) => `c${films[index][0]}`)
}

const seedStorage = async (page: Page) => {
  const saved = localIds(SAVED_INDICES).map((id, position) => ({
    id,
    savedAt: 1_700_000_000_000 - position * 1_000,
  }))
  const path = localIds(PATH_INDICES).map((id, position) => ({
    id,
    tier: PATH_TIERS[position],
  }))
  await page.addInitScript(
    ({ saved, path }) => {
      try {
        window.localStorage.setItem('wtw:saved:v1', JSON.stringify(saved))
        window.localStorage.setItem('wtw:session-path:v1', JSON.stringify(path))
        // The first-load hints would sit over the globe.
        window.localStorage.setItem('wtw:spin-hint-seen', '1')
      } catch {}
    },
    { saved, path },
  )
}

// Counts every requestAnimationFrame callback that runs.
const countRaf = async (page: Page) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __rafCalls: number }
    w.__rafCalls = 0
    const original = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback) =>
      original((time) => {
        w.__rafCalls += 1
        callback(time)
      })
  })
}

const waitForGlobe = async (page: Page) => {
  await page
    .getByRole('button', { name: 'Skip first time load' })
    .click({ timeout: 5_000 })
    .catch(() => {})
  await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached({
    timeout: 120_000,
  })
  const canvas = page.getByLabel('Infinite movie poster menu')
  await expect(canvas).toHaveAttribute('data-webgl-state', 'ready', {
    timeout: 120_000,
  })
  return canvas
}

// Drags the pointer round a circle at a steady speed for SPIN_MS.
const spin = async (page: Page, cx: number, cy: number) => {
  await page.mouse.move(cx + SPIN_RADIUS_PX, cy)
  await page.mouse.down()
  const angularSpeed = SPIN_SPEED_PX_PER_S / SPIN_RADIUS_PX
  const start = Date.now()
  for (;;) {
    const elapsed = (Date.now() - start) / 1000
    if (elapsed * 1000 > SPIN_MS) break
    const angle = elapsed * angularSpeed
    await page.mouse.move(
      cx + Math.cos(angle) * SPIN_RADIUS_PX,
      cy + Math.sin(angle) * SPIN_RADIUS_PX,
    )
    await page.waitForTimeout(8)
  }
  await page.mouse.up()
}

const startProRun = async (page: Page) => {
  await page.getByRole('button', { name: /^Gold/ }).click()
  await page.getByRole('button', { name: 'Force peak' }).click()
  // The windup hands over to the peak, where the globe spins on its own.
  await expect(page.getByTestId('sp-phase')).toHaveText('peak', {
    timeout: 10_000,
  })
}

const RUNS = Math.max(1, Number(process.env.PERF_RUNS ?? 1))

const runScenario = async (page: Page, scenario: Scenario): Promise<Row> => {
  await seedStorage(page)
  await countRaf(page)
  const query = new URLSearchParams({
    perf: '1',
    constellations: scenario.constellations ? '1' : '0',
    path: scenario.path ? '1' : '0',
  })
  // Idle runs leave weather to its own rules (nothing until a flick).
  if (!scenario.idle) query.set('weather', scenario.weather ? '1' : '0')
  if (scenario.pro) query.set('shuffle-pro-debug', '1')
  await page.goto(`/?${query}`, { waitUntil: 'domcontentloaded' })
  const canvas = await waitForGlobe(page)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('The globe has no box')
  // Let the reveal animations and the first draws finish.
  await page.waitForTimeout(2_500)

  let rafPerSecond: number | null = null
  if (scenario.idle) {
    // "Idle" starts once the posters have stopped arriving: every upload wakes
    // the loop for a few frames, which is work, not a leak.
    await page
      .waitForFunction(
        () => {
          const el = document.querySelector('canvas[data-item-count]')
          return (
            el instanceof HTMLElement &&
            Number(el.dataset.baseLoaded) >= Number(el.dataset.itemCount) &&
            el.dataset.lodPending === '0'
          )
        },
        undefined,
        { timeout: 120_000 },
      )
      .catch(() => {})
    await page.waitForTimeout(2_500)
    await page.evaluate(() => {
      ;(window as unknown as { __rafCalls: number }).__rafCalls = 0
    })
    await page.waitForTimeout(IDLE_MS)
    const calls = await page.evaluate(
      () => (window as unknown as { __rafCalls: number }).__rafCalls,
    )
    rafPerSecond = calls / (IDLE_MS / 1000)
  } else if (scenario.shuffle) {
    await page.evaluate(() => window.__scrollflixPerf?.reset())
    await page
      .getByRole('button', { name: 'Shuffle to a random movie' })
      .click()
    await page.waitForTimeout(SHUFFLE_MS)
  } else if (scenario.pop) {
    await page.evaluate(() => window.__scrollflixPerf?.reset())
    await page.getByRole('button', { name: /^Open details for/ }).click()
    await page.waitForTimeout(POP_MS)
  } else if (scenario.pro) {
    await startProRun(page)
    await page.waitForTimeout(500)
    await page.evaluate(() => window.__scrollflixPerf?.reset())
    await page.waitForTimeout(SPIN_MS)
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.evaluate(() => window.__scrollflixPerf?.reset())
    await spin(page, box.x + box.width / 2, box.y + box.height / 2)
  }

  const stats = await page.evaluate(() => window.__scrollflixPerf?.stats())
  expect(stats).toBeTruthy()
  return {
    name: scenario.name,
    frames: stats?.frames ?? 0,
    p50: stats?.p50 ?? 0,
    p95: stats?.p95 ?? 0,
    p99: stats?.p99 ?? 0,
    workP95: stats?.workP95 ?? 0,
    longTasks: stats?.longTasks ?? 0,
    rafPerSecond,
    versus: scenario.versus,
  }
}

for (const scenario of SCENARIOS) {
  test(`perf: ${scenario.name}`, async ({ browser }) => {
    // With PERF_RUNS > 1 the run with the median p95 is reported, since the
    // GPU is shared with whatever else the machine is doing.
    const runs: Row[] = []
    for (let run = 0; run < RUNS; run += 1) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      })
      const page = await context.newPage()
      runs.push(await runScenario(page, scenario))
      await context.close()
    }
    runs.sort((a, b) => a.p95 - b.p95)
    rows.push(runs[Math.floor(runs.length / 2)])
  })
}

const fixed = (value: number) => value.toFixed(1)

test.afterAll(async ({ browser }) => {
  if (!rows.length) return
  const page = await browser.newPage()
  await page.goto('about:blank')
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    return info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'n/a'
  })
  await page.close()
  const byName = new Map(rows.map((row) => [row.name, row]))
  const lines = [
    `GPU: ${renderer}. Browser: ${browser.version()}. Spin: ${SPIN_SPEED_PX_PER_S} px/s circle, ${SPIN_MS / 1000} s per scenario.`,
    '',
    '| scenario | frames | p50 ms | p95 ms | p99 ms | work p95 ms | long tasks | p95 vs | work vs | rAF/s |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of rows) {
    const ref = row.versus ? byName.get(row.versus) : null
    const delta = (a: number, b: number | undefined) =>
      b === undefined ? '' : `${a - b >= 0 ? '+' : ''}${fixed(a - b)}`
    lines.push(
      `| ${row.name} | ${row.frames} | ${fixed(row.p50)} | ${fixed(row.p95)} | ${fixed(row.p99)} | ${fixed(row.workP95)} | ${row.longTasks} | ${delta(row.p95, ref?.p95)} | ${delta(row.workP95, ref?.workP95)} | ${row.rafPerSecond === null ? '' : fixed(row.rafPerSecond)} |`,
    )
  }
  const table = lines.join('\n')
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/perf.md', `${table}\n`)
  console.log(`\n${table}\n`)
})
