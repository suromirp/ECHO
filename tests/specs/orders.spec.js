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
