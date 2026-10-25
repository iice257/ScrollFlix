import { defineConfig, devices } from '@playwright/test'

/**
 * Visual baselines (toHaveScreenshot): the one project that looks at pixels.
 *
 * Runs against a production build served by `vite preview`, with a mocked
 * catalogue and mocked TMDB posters (see playwright-tests/visual/support.ts),
 * in Google Chrome on Linux. The committed PNGs are generated on the CI
 * platform only, by the "Update visual baselines" workflow. Read
 * playwright-tests/visual/README.md before touching them.
 */
const PORT = 4173

export default defineConfig({
  testDir: './playwright-tests/visual',
  testMatch: '**/*.spec.ts',
  // One worker, one file at a time: software WebGL starves a busy machine.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Software WebGL on CI is slow: a loaded globe can take a while.
  timeout: 120_000,
  expect: {
    timeout: 30_000,
    toHaveScreenshot: {
      // Software WebGL is deterministic on one platform, so the tolerances are
      // tight: anti-aliasing noise passes, a poster that is cropped, shifted,
      // stretched or overlapped does not (a cropped poster is thousands of
      // pixels; see README.md for the numbers).
      maxDiffPixelRatio: 0.002,
      threshold: 0.15,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  // One PNG per state, viewport and colour scheme, no platform suffix: they
  // are only ever generated and compared on the CI platform (ubuntu, Chrome).
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  outputDir: 'test-results/visual',
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report/visual' }],
      ]
    : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    // The service worker would answer poster requests before the mocks can.
    serviceWorkers: 'block',
    launchOptions: {
      // Software GL on every machine, so a baseline never depends on a GPU.
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--force-color-profile=srgb',
        '--font-render-hinting=none',
        '--disable-lcd-text',
      ],
    },
  },
  projects: [
    {
      name: 'visual',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
