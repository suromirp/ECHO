// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures, runQuickFixture } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures');
const ORDER = path.join(FIX, 'orders', 'against-order.edi');

// An optional ORDERS file next to an ORDRSP or DESADV: the supplier's
// message checked against what was ordered. Real cases: a box EAN sent
// instead of the ordered unit, and a pick date sent as delivery date.
// Message checks, in both modes (parity rule); Compare checks the supplier.
test('an ORDRSP checked against its order: unknown EAN with a hint, unanswered item, more than ordered, date before requested', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'ordrsp', 'against-order.edi'));
  await page.locator('#orderInputQuick').setInputFiles(ORDER);
  const ov = page.locator('#quickOverview');
  await expect(ov).toContainText('EAN not in the order');
  await expect(ov).toContainText('ordered EAN 8712345670030 (5 ordered)?');
  await expect(ov).toContainText('Ordered item not in this response');
  await expect(ov).toContainText('More than ordered');
  await expect(ov).toContainText('8712345670023 · 15 confirmed, 10 ordered');
  await expect(ov).toContainText('Confirmed delivery date before the requested date');
  await expect(ov).toContainText('24-11-2026, requested 30-11-2026');
  await expect(page.locator('#orderNameQuick')).toContainText('Order 8123458');

  // Removing the order removes the checks.
  await page.locator('#orderClearQuick').click();
  await expect(ov).not.toContainText('EAN not in the order');

  // Compare: the supplier side, as Message checks, never a Transformation difference.
  await openApp(page);
  const r = path.join(FIX, 'ordrsp', 'against-order.edi');
  await page.locator('#orderInputCompare').setInputFiles(ORDER);
  await runCompareFixtures(page, r, r);
  const msg = await page.locator('#findingsList li, #results ul.findings > li').allInnerTexts();
  const all = msg.join('\n');
  expect(all).toContain('Supplier — EAN not in the order');
  expect(all).toContain('Supplier — Confirmed delivery date before the requested date');
});

test('a DESADV checked against its order; a different order skips the checks', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'desadv', 'against-order.edi'));
  await page.locator('#orderInputQuick').setInputFiles(ORDER);
  const ov = page.locator('#quickOverview');
  await expect(ov).toContainText('EAN not in the order');
  await expect(ov).toContainText('Expected arrival before the requested delivery date');
  // A partial delivery isn't flagged as missing items.
  await expect(ov).not.toContainText('Ordered item not in this response');

  // Another order: one finding, nothing else.
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'ordrsp', 'envelope-su-past-date.edi'));
  await page.locator('#orderInputQuick').setInputFiles(ORDER);
  await expect(ov).toContainText('The added order is a different order');
  await expect(ov).not.toContainText('EAN not in the order');

  // A file that isn't an order isn't added.
  await openApp(page);
  await page.locator('#tabQuickBtn').click();
  await page.locator('#orderInputQuick').setInputFiles(path.join(FIX, 'desadv', 'against-order.edi'));
  await expect(page.locator('#quickStatus')).toContainText("isn't an order");
  await expect(page.locator('#orderNameQuick')).toBeHidden();
});

// The order route's ZIP holds the same order twice (bol + supplier folder).
// "Add the order" takes a ZIP too and picks the ORDERS out of it.
test('the order can be added as a ZIP', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'ordrsp', 'against-order.edi'));
  await page.locator('#orderInputQuick').setInputFiles(path.join(FIX, 'zip', 'order-pair.zip'));
  await expect(page.locator('#orderNameQuick')).toContainText('Order 8123458');
  await expect(page.locator('#quickOverview')).toContainText('EAN not in the order');
});

// The same slot takes the supplier's order response next to a DESADV.
test('a DESADV against the order response: not confirmed, confirmed 0, more than confirmed, later arrival', async ({ page }) => {
  const resp = path.join(FIX, 'ordrsp', 'response-for-desadv.edi');
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'desadv', 'against-response.edi'));
  await page.locator('#orderInputQuick').setInputFiles(resp);
  const ov = page.locator('#quickOverview');
  await expect(page.locator('#orderNameQuick')).toContainText('Order response ORDRSP9530');
  await expect(ov).toContainText('Despatched item not in the order response');
  await expect(ov).toContainText('8712345610135 · 1 despatched');
  await expect(ov).toContainText('Despatched, while the order response confirmed 0');
  await expect(ov).toContainText('More despatched than confirmed');
  await expect(ov).toContainText('8 despatched, 6 confirmed');
  await expect(ov).toContainText('Expected arrival is after the confirmed delivery date');

  // Compare: supplier side; bol's DESADV without an order number is told
  // that the response names one.
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'desadv', 'against-response.edi'), path.join(FIX, 'desadv', 'against-response-no-order.edi'));
  await page.locator('#orderInputCompare').setInputFiles(resp);
  const res = page.locator('#results');
  await expect(res).toContainText('Supplier — More despatched than confirmed');
  await expect(res).toContainText("Bol — The order response names an order number, this message doesn't");
  await expect(res).toContainText('8123470');
});

// An invoice next to its order: the invoiced net price and quantity per
// EAN against what was ordered. Real case: an invoice that was consistent
// in itself but priced higher than the order. Both modes (parity rule).
test('an invoice checked against its order: price, more than ordered, EAN not in the order', async ({ page }) => {
  const INV = path.join(FIX, 'invoic', 'against-order.sup.edi');
  const ORD = path.join(FIX, 'orders', 'for-invoice.edi');
  await openApp(page);
  await runQuickFixture(page, INV);
  await page.locator('#orderInputQuick').setInputFiles(ORD);
  const ov = page.locator('#quickOverview');
  await expect(ov).toContainText('Net price differs from the order');
  await expect(ov).toContainText('8712345678906');
  await expect(ov).toContainText('Invoiced more than ordered');
  await expect(ov).toContainText('8712345678913 · 24 invoiced, 20 ordered');
  await expect(ov).toContainText('Invoiced EAN not in the order');
  await page.locator('#orderClearQuick').click();
  await expect(ov).not.toContainText('Net price differs from the order');
  // A different order: one note, no item checks.
  await page.locator('#orderInputQuick').setInputFiles(ORDER);
  await expect(ov).toContainText('The added order is a different order');
  await expect(ov).not.toContainText('Net price differs from the order');

  await openApp(page);
  await runCompareFixtures(page, INV, INV);
  await page.locator('#orderInputCompare').setInputFiles(ORD);
  const res = page.locator('#invoiceResults');
  await expect(res).toContainText('Supplier — Net price differs from the order');
  await expect(res).toContainText('Supplier — Invoiced more than ordered');
});
