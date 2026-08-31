// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// ECHO itself has no build step and no dev server — this harness matches
// that: index.html is opened directly via file://, so there is no
// webServer entry here at all (see docs/testing.md).
module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // This environment pre-installs Chromium outside Playwright's own
        // cache; point at it directly instead of downloading a browser.
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        },
      },
    },
  ],
});
