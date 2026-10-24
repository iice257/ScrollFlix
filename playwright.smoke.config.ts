import { defineConfig, devices } from '@playwright/test'

// `npm run smoke`: read-only checks against a URL that is already deployed
// (or against `npm run build && npm run preview`). No dev server is started.
//
//   BASE_URL=https://scrollflix.app npm run smoke
//   EXPECT_SHA=<commit> ...      also assert /version.json serves that commit
//   SMOKE_CHANNEL=chrome ...     use an installed Chrome instead of Playwright's Chromium
//
// Tags: @browser needs a browser page, @deploy only makes sense right after a
// deploy (it compares the served commit), everything else is plain HTTP.
const baseURL = process.env.BASE_URL?.replace(/\/+$/, '')

if (!baseURL) {
  throw new Error(
    'Set BASE_URL, e.g. BASE_URL=https://scrollflix.app npm run smoke',
  )
}

export default defineConfig({
  testDir: './playwright-tests',
  testMatch: '**/smoke.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // One retry absorbs a network blip; a real outage fails both attempts.
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'smoke-report/results.json' }]]
    : 'list',
  outputDir: 'smoke-report/artifacts',
  use: {
    baseURL,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.SMOKE_CHANNEL
          ? { channel: process.env.SMOKE_CHANNEL }
          : {}),
      },
    },
  ],
})
