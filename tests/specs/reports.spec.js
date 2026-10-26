const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures');

// Copy for Transus: the intro names the message ID (from the ZIP name),
// the supplier (folder name, GLN) and the document; a pallet difference
// says what differs; nothing is cut off mid-sentence. Copy report gets the
// same context lines and no run-together text ("(1 difference)item …").
test('Copy for Transus names message ID, supplier and document, and lists what differs per pallet', async ({ page }) => {
  await openApp(page);
  await page.locator('#zipInput').setInputFiles(path.join(FIX, 'zip', 'Message_ID_100000001.zip'));
  await expect(page.locator('#results')).toBeVisible();
  const en = await page.evaluate(() => lastTransusTextEn);
  expect(en).toContain('Message ID: 100000001');
  expect(en).toContain('Supplier: Supplier A (GLN 8700000000007)');
  expect(en).toMatch(/Document: DESADV \S+/);
  expect(en).toMatch(/- Pallet mapping differs for SSCC 387000000000000019 \(1 difference\)\n  - item \d+ missing on the (bol|supplier) side of this pallet/);
  expect(en).not.toContain('…\n');
  const nl = await page.evaluate(() => lastTransusTextNl);
  expect(nl).toContain('Bericht-ID: 100000001');
  expect(nl).toContain('Leverancier: Supplier A');

  const report = await page.evaluate(() => lastReportText);
  expect(report).toContain('Message ID: 100000001');
  expect(report).toMatch(/\(1 difference\) item \d+/);
  expect(report).not.toMatch(/\)item/);
});

// A long tag list (e.g. order numbers shifted on many lines) is listed in
// full under its headline, never truncated with "…" mid-sentence.
test('Copy for Transus lists every tag of a long finding instead of truncating it', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'desadv', 'order-shift.sup.edi'), path.join(FIX, 'desadv', 'order-shift.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const en = await page.evaluate(() => lastTransusTextEn);
  const tagCount = await page.locator('#findings li', { hasText: 'shifted one line down' }).first().locator('.wc-affected li').count();
  expect(tagCount).toBeGreaterThan(2);
  const subItems = en.split('\n').filter(l => l.startsWith('  - '));
  expect(subItems.length).toBeGreaterThanOrEqual(tagCount);
  en.split('\n').filter(l => l.startsWith('- ')).forEach(l => expect(l.endsWith('…')).toBe(false));
});
