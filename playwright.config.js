import { defineConfig, devices } from '@playwright/test';

// Keep Playwright's HTML artifacts for both local runs and CI. Locally, emit
// concise terminal progress/failure details rather than per-test status lines.
/** @param {boolean} [isCi] @returns {import('@playwright/test').PlaywrightTestConfig['reporter']} */
export function e2eReporters(isCi = Boolean(process.env.CI)) {
  /** @type {['html', { outputFolder: string, open: 'never' }]} */
  const html = ['html', { outputFolder: '.playwright/report', open: 'never' }];
  return isCi ? [html] : [['dot'], html];
}

export default defineConfig({
  testDir: './e2e',
  outputDir: '.playwright/test-results',
  reporter: e2eReporters(),
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
