import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// `npm run perf`: spins the globe in a real, headed Chrome with the GPU on and
// prints a frame-time table. It measures a production build (the dev server's
// React checks would skew the numbers); set PERF_DEV=1 to use the dev server.
const port = Number(process.env.PERF_PORT ?? 3210)
const dev = process.env.PERF_DEV === '1'

export default defineConfig({
  ...base,
  testMatch: '**/*.bench.ts',
  reporter: 'list',
  retries: 0,
  fullyParallel: false,
  timeout: 10 * 60_000,
  projects: [
    {
      name: 'perf',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        headless: false,
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          // Keep the window rendering at full rate even if another one covers
          // it, and let the GPU through (no --disable-gpu).
          args: [
            '--ignore-gpu-blocklist',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-timer-throttling',
            '--disable-features=CalculateNativeWinOcclusion',
          ],
        },
      },
    },
  ],
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  webServer: {
    command: dev
      ? `npx vite --port ${port} --strictPort`
      : `npx vite build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
