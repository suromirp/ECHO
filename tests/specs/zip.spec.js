const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp } = require('../helpers');

const ZIP_FIXTURE = path.join(__dirname, '..', 'fixtures', 'zip', 'single-file.zip');

// docs/testing.md: "A ZIP with only one usable file switches to Quick check
// with a clear, readable (not instant/jarring) explanation, rather than
// failing."
test('a ZIP with only one usable file switches to Quick check with a clear explanation', async ({ page }) => {
  await openApp(page);
  await page.locator('#zipInput').setInputFiles(ZIP_FIXTURE);

  // The switch is intentionally not instant (see index.html's handleZip) —
  // give it time to show the status line, pause, then actually switch tabs.
  await expect(page.locator('#compareStatus')).toContainText('only contains one message', { timeout: 5000 });
  await expect(page.locator('#viewQuick')).toHaveClass(/active/, { timeout: 5000 });
  await expect(page.locator('#tabQuickBtn')).toHaveClass(/active/);

  // The message itself is shown (not just an empty tab switch)...
  await expect(page.locator('#quickInput')).toHaveValue(/DESADV9999/);
  // ...alongside a prominent, hard-to-miss banner explaining what happened.
  const banner = page.locator('#quickOverview .note-inline', { hasText: 'Switched here automatically' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('lonely-message.edi');
});
