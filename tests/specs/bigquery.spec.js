const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures, runQuickFixture } = require('../helpers');

const I = f => path.join(__dirname, '..', 'fixtures', 'invoic', f);

// "Copy BigQuery query" (docs/ui-conventions.md): a colleague's own query,
// kept in this browser only, filled in with the invoice number(s).
test('the query is filled in: one per invoice, a list for {invoices}, quotes escaped', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => [
    bqFill("SELECT * FROM t WHERE nr = '{invoice}';", ['INV001']),
    bqFill("SELECT * FROM t WHERE nr = '{invoice}';", ['INV001', 'INV002', 'INV001']),
    bqFill('SELECT * FROM t WHERE nr IN ({invoices})', ['INV001', 'INV002']),
    bqFill("WHERE nr = '{invoice}'", ["A'B"]),
    bqFill("WHERE nr = '{invoice}'", []),
  ]);
  expect(r[0]).toBe("SELECT * FROM t WHERE nr = 'INV001';");
  expect(r[1]).toBe("SELECT * FROM t WHERE nr = 'INV001';\n\nSELECT * FROM t WHERE nr = 'INV002';");
  expect(r[2]).toBe("SELECT * FROM t WHERE nr IN ('INV001', 'INV002')");
  expect(r[3]).toBe("WHERE nr = 'A\\'B'");
  expect(r[4]).toBe('');
});

test('invoice button: without a query it opens Settings, with one it copies the filled-in query; parity in Quick check', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { localStorage.removeItem('echo.bqInvoiceQuery'); window.__copied = null; window.copyTextToClipboard = t => { window.__copied = t; }; });
  await runCompareFixtures(page, I('tax-missing-rate.sup.edi'), I('tax-missing-rate.bol.ubl.xml'));
  const btn = page.locator('#invoiceResults .bq-btn');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.locator('#bqSetup')).toHaveAttribute('open', '');
  await expect(page.locator('#bqQuery')).toBeFocused();
  await expect(page.locator('#bqState')).toContainText('No query yet');

  await page.locator('#bqQuery').fill("SELECT * FROM t WHERE nr = '{invoice}'");
  await expect(page.locator('#bqState')).toHaveText('Saved in this browser.');
  await btn.click();
  const nums = await page.evaluate(() => bqNumbers(cstate.sup.text));
  expect(nums.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__copied)).toContain(`'${nums[0]}'`);

  await runQuickFixture(page, I('tax-missing-rate.sup.edi'));
  await expect(page.locator('#quickOverview .bq-btn')).toBeVisible();
});
