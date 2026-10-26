const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runQuickFixture, runCompareFixtures } = require('../helpers');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'orders', 'simple-orders.edi');

// docs/testing.md: "ORDERS: readable in Quick check; still declined in
// Compare."
test('ORDERS is readable in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, FIXTURE);

  const overview = page.locator('#quickOverview');
  await expect(overview.locator('.ov-type')).toHaveText('ORDERS');
  await expect(overview).toContainText('ORD9001');
});

test('ORDERS is still declined in Compare', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, FIXTURE, FIXTURE);

  // Compare refuses to run at all: no results panel, and an explanatory
  // status message referencing ORDERS instead.
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#compareStatus')).toContainText('ORDERS');
  await expect(page.locator('#compareStatus')).toHaveClass(/error/);
});

// Quick check limited the GS1 check-digit, all-zeros EAN and duplicate-DTM
// checks to ORDRSP/DESADV; they only need the message's own LIN groups, so
// ORDERS (Quick check only) gets them too.
test('ORDERS in Quick check gets the line-level checks: check digit, all-zeros EAN, duplicate DTM', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(__dirname, '..', 'fixtures', 'orders', 'line-checks.edi'));
  const overview = page.locator('#quickOverview');
  await expect(overview.locator('.ov-type')).toHaveText('ORDERS');
  await expect(overview).toContainText('EAN is all zeros');
  await expect(overview).toContainText("Check digit doesn't match");
  await expect(overview).toContainText('8712345000014');
  await expect(overview).toContainText('DTM+2 appears more than once with different dates');
});

// ORDERS in Quick check showed no price or date per line. Lines now show
// the requested delivery date (line DTM+2, else the header DTM+2, dimmed)
// and the price: net (PRI+AAA) and, when a line only has it, gross
// (PRI+AAB), each in its own labelled column. The header DTM+2 is a field
// in the overview. Real Supplier Bravo ORDERS: bol's copy has PRI+AAA and a DTM+2
// per line, the supplier-side copy only a header DTM+2.
test('ORDERS in Quick check shows requested delivery date and price per line', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(__dirname, '..', 'fixtures', 'orders', 'price-and-date.edi'));
  const overview = page.locator('#quickOverview');
  await expect(overview.locator('.ov-type')).toHaveText('ORDERS');
  await expect(overview.locator('.field', { hasText: 'Requested delivery' })).toContainText('10-02-2026');

  const table = page.locator('#quickLinesTable');
  const headers = await table.locator('th').allInnerTexts();
  expect(headers.map(h => h.toLowerCase())).toEqual(['#', 'ean', 'ordered', 'requested delivery', 'net price', 'gross price']);
  const rows = table.locator('tr:not(:has(th))');
  // Line 1: its own DTM+2 and PRI+AAA.
  await expect(rows.nth(0)).toContainText('14-02-2026');
  await expect(rows.nth(0)).toContainText('23.75');
  // Line 2: no DTM+2 of its own, so the header date, dimmed.
  await expect(rows.nth(1).locator('td').nth(3).locator('.dim')).toHaveText('10-02-2026');
  await expect(rows.nth(1)).toContainText('11.87');
  // Line 3: only PRI+AAB, in the Gross price column, not as a net price.
  const cells3 = await rows.nth(2).locator('td').allInnerTexts();
  expect(cells3[4]).toBe('—');
  expect(cells3[5]).toBe('15.40');
  // Valid GS1 check digits: no findings on this order.
  await expect(overview.locator('ul.findings')).toHaveCount(0);
});

test('ORDERS with a DTM+2 only on the lines shows that date in the overview, marked as on every line', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(__dirname, '..', 'fixtures', 'orders', 'line-date-only.edi'));
  const overview = page.locator('#quickOverview');
  const field = overview.locator('.field', { hasText: 'Requested delivery' });
  await expect(field).toContainText('10-02-2026');
  await expect(field).toContainText('on every line');
  const headers = await page.locator('#quickLinesTable th').allInnerTexts();
  expect(headers.map(h => h.toLowerCase())).toEqual(['#', 'ean', 'ordered', 'requested delivery', 'net price']);
  await expect(page.locator('#quickLinesTable .dim')).toHaveCount(0);
});

// An ORDERS is sent by the buyer, so its UNB sender is compared with
// NAD+BY. bol's own ORDERS (UNB sender = NAD+BY) is silent.
test('ORDERS: a UNB sender other than the buyer is an info note; the buyer itself is silent', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(__dirname, '..', 'fixtures', 'orders', 'unb-sender-differs.edi'));
  const qc = page.locator('#quickOverview ul.findings > li', { hasText: 'Sent from a different GLN than the buyer in the message' });
  await expect(qc).toHaveCount(1);
  await expect(qc).toHaveClass(/f-info/);
  await expect(qc).toContainText('NAD+BY');

  await openApp(page);
  await runQuickFixture(page, path.join(__dirname, '..', 'fixtures', 'orders', 'unb-from-buyer.edi'));
  await expect(page.locator('#quickOverview .ov-type')).toHaveText('ORDERS');
  await expect(page.locator('#quickOverview')).not.toContainText('Sent from a different GLN');
});
