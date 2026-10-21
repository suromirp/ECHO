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

// JSZip's 'string' output always assumes UTF-8 and ignores a BOM, so a
// UTF-16 XML inside a ZIP was read as garbage (and even routed to the
// EDIFACT parser). Entries are now decoded from their bytes.
test('a UTF-16 XML file inside a ZIP is decoded and compared normally', async ({ page }) => {
  await openApp(page);
  await page.locator('#zipInput').setInputFiles(path.join(__dirname, '..', 'fixtures', 'zip', 'utf16-pair.zip'));
  await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('Transus XML');
  expect(resultsText).toContain('2/2');
  expect(resultsText).not.toMatch(/missing from the supplier message/);
});
