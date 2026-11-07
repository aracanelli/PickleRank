import { defineConfig, devices } from '@playwright/test'

/**
 * Fixture-mode end-to-end suite: runs against `vite --mode e2e` (fake Clerk + fake API).
 * These results are emulation against fixtures, not a real backend or a physical phone.
 * One worker: the fake API holds shared state that each test resets.
 */
const phone = (name: string, browser: 'chromium' | 'webkit', width: number, height: number, colorScheme: 'light' | 'dark') => ({
  name,
  use: {
    ...(browser === 'webkit' ? devices['iPhone 13'] : devices['Pixel 5']),
    browserName: browser,
    viewport: { width, height },
    colorScheme,
    hasTouch: true,
    isMobile: browser === 'chromium'
  }
})

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    phone('chromium-320-light', 'chromium', 320, 568, 'light'),
    phone('webkit-375-dark', 'webkit', 375, 667, 'dark'),
    phone('chromium-390-dark', 'chromium', 390, 844, 'dark'),
    phone('webkit-320-light', 'webkit', 320, 568, 'light'),
    phone('chromium-375-light', 'chromium', 375, 667, 'light'),
    phone('webkit-390-light', 'webkit', 390, 844, 'light'),
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, colorScheme: 'light' } }
  ],
  webServer: {
    command: 'npm run dev:e2e -- --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000
  }
})
