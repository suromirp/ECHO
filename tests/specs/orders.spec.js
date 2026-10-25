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
