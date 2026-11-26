const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runQuickFixture } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures');

// Quick check opens with a one-line summary so a clean result reads as
// "checked, nothing unusual" — never as "not checked".
test('Quick check summary line: "Nothing unusual found" vs "N things to look at"', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'desadv', 'two-messages.edi'));
  const summary = page.locator('#quickOverview .quick-summary');
  await expect(summary).toContainText('Nothing unusual found.');
  await expect(summary).toContainText('ECHO ran its checks on this DESADV');
  await expect(summary).toHaveClass(/\bok\b/);

  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'desadv', 'message-checks-only.edi'));
  await expect(summary).toContainText(/\d+ things? to look at/);
  await expect(summary).toHaveClass(/\berr\b/);
  // Summary sits above the Findings list.
  const html = await page.locator('#quickOverview').innerHTML();
  expect(html.indexOf('quick-summary')).toBeLessThan(html.indexOf('class="findings"'));

  // INVOIC Quick check gets the same line.
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'invoic', 'tax-missing-rate.sup.edi'));
  await expect(page.locator('#quickOverview .quick-summary')).toContainText('to look at');
});

// Long lists collapse past ~20 like Compare: the order list in the overview
// fields and the Lines table (first 20 rows, "Show all N lines"); a search
// match still shows a collapsed row.
test('Quick check collapses long order lists and long Lines tables; search still finds hidden rows', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'desadv', 'many-orders.edi'));
  await expect(page.locator('#quickOverview .field', { hasText: 'Order(s)' }).locator('details.order-list > summary')).toHaveText('22 orders');
  const visible = page.locator('#quickLinesTable tr[data-search]:not(.hidden)');
  await expect(visible).toHaveCount(20);
  const btn = page.locator('#quickOverview .long-table-btn');
  await expect(btn).toHaveText('Show all 22 lines');
  await btn.click();
  await expect(visible).toHaveCount(22);
  await btn.click();
  await expect(visible).toHaveCount(20);
  const lastEan = await page.locator('#quickLinesTable tr[data-search]').last().getAttribute('data-search');
  await page.locator('#quickSearchInput').fill(lastEan.split(' ')[0]);
  await expect(page.locator('#quickLinesTable tr[data-search]:not(.hidden)').last()).toHaveAttribute('data-search', lastEan);
});

// The status line sits above the overview, so it can't say "overview above".
test('Quick check status line points down to the overview', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'desadv', 'two-messages.edi'));
  await expect(page.locator('#quickStatus')).not.toContainText('above');
  await expect(page.locator('#quickStatus')).toContainText('below');
});

// XML on a single line is indented for display only, so a jump-to-source
// lands on the line with the value; Copy still copies the original text.
test('one-line XML is pretty-printed for display, and jump-to-source lands on the value', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'desadv', 'transusxml-messages.sup.xml'));
  // Wait for the rendered source before counting: count() doesn't wait.
  await expect(page.locator('#quickOutput .edi-row').nth(20)).toBeAttached();
  expect(await page.locator('#quickOutput .edi-row').count()).toBeGreaterThan(20);
  await page.locator('#quickOverview .pallet-det .clickable-val', { hasText: '387000000000000019' }).first().click();
  const hl = page.locator('#quickOutput .src-hl');
  await expect(hl.first()).toContainText('387000000000000019');
  expect((await hl.first().innerText()).length).toBeLessThan(120);
  expect(await page.evaluate(() => quickPlain.trim().split('\n').length)).toBe(1);
});

// Quick check opens like Compare: a drop zone first, pasting second, and
// no empty "Original message" block until there is a message.
test('Quick check starts with a drop zone; the original message shows once there is one', async ({ page }) => {
  await openApp(page);
  await page.locator('#tabQuickBtn').click();
  await expect(page.locator('#quickDrop')).toBeVisible();
  expect(await page.evaluate(() => !!(document.getElementById('quickDrop').compareDocumentPosition(document.getElementById('quickInput')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('#quickOrigPanel')).toBeHidden();
  await page.locator('#quickFileInput').setInputFiles(path.join(FIX, 'desadv', 'date-shift.sup.edi'));
  await expect(page.locator('#quickOrigPanel')).toBeVisible();
  await expect(page.locator('#quickOutput .edi-row').first()).toBeVisible();
  await page.locator('#quickClearBtn').click();
  await expect(page.locator('#quickOrigPanel')).toBeHidden();
});
