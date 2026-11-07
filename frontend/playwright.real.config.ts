import { defineConfig, devices } from '@playwright/test'

/**
 * REAL TEST BACKEND suite: the new UI against the real FastAPI code and a local Postgres
 * (backend/tests/local_stack, started separately). Clerk is replaced by locally minted JWTs
 * that the real API verifies against a local JWKS. Never points at production.
 *
 *   PR_ORG_TOKEN=... PR_MEM_TOKEN=... PR_GROUP_ID=... npx playwright test -c playwright.real.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.real\.ts/,
  // separate output folder so a real-backend run never wipes the fixture suite's artifacts
  outputDir: 'test-results-real',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5198', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'real-chromium-375', use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } } },
    { name: 'real-webkit-390', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } }
  ],
  webServer: { command: 'npm run dev:e2e-real -- --strictPort', url: 'http://localhost:5198', reuseExistingServer: true, timeout: 60_000 }
})
