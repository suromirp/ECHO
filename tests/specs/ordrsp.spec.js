const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures', 'ordrsp');

// docs/testing.md: "ORDRSP: action-6-without-backorder findings grouped into
// one block, not repeated per line."
test('action-6-without-backorder findings are grouped, not repeated per line', async ({ page }) => {
  await openApp(page);
  const fixture = path.join(FIX, 'action6-no-backorder.edi');
  await runCompareFixtures(page, fixture, fixture);

  await expect(page.locator('#results')).toBeVisible();

  const findings = page.locator('#findings li');
  const texts = await findings.allInnerTexts();
  const groupedLines = texts.filter(t => t.includes('nothing is backordered'));

  // One grouped block per side (Supplier, Bol) — never one per affected line
  // (there are 3 lines per side, so a per-line implementation would produce 6).
  // Each <li> renders an icon in its own leading span (e.g. "!\nSupplier — ..."),
  // so match on "Supplier —"/"Bol —" rather than a literal startsWith.
  expect(groupedLines).toHaveLength(2);
  expect(groupedLines.some(t => t.includes('Supplier —'))).toBe(true);
  expect(groupedLines.some(t => t.includes('Bol —'))).toBe(true);
  groupedLines.forEach(t => expect(t).toContain('(3 lines)'));

  // The grouped block lists every affected line as its own clickable tag.
  const tagCount = await page.locator('#findings .wc-affected li').count();
  expect(tagCount).toBe(6); // 3 lines x 2 sides
});
