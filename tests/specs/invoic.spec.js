const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures, runQuickFixture } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures', 'invoic');

async function invoiceFindingTexts(page) {
  return page.locator('#invoiceResults ul.findings li').allInnerTexts();
}

/**
 * Splits the flat <li> list of #invoiceResults' findings into
 * { message: [...], diff: [...], info: [...] } based on the
 * "findings-cat" category headers that precede each bucket, mirroring the
 * cat 'message' / 'diff' / 'info' split described in CLAUDE.md §3.
 */
async function invoiceFindingsByCategory(page) {
  const items = await page.locator('#invoiceResults ul.findings li').evaluateAll(
    els => els.map(el => ({ isCat: el.classList.contains('findings-cat'), text: el.textContent })),
  );
  const buckets = { message: [], diff: [], info: [] };
  let current = null;
  const titleToKey = { 'Message checks': 'message', 'Transformation differences': 'diff', 'Good to know': 'info' };
  items.forEach(it => {
    if (it.isCat) { current = titleToKey[it.text.trim()] || null; return; }
    if (current) buckets[current].push(it.text);
  });
  return buckets;
}

// docs/testing.md: "INVOIC: multiple VAT-rate groups summed correctly for
// the taxable total (both the TRANSUSXML-style and bol's-own-UBL-style
// aggregation)."
test('multiple VAT-rate groups are summed for the taxable total, both formats', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'multi-vat.sup.transusxml.xml'),
    path.join(FIX, 'multi-vat.bol.ubl.xml'),
  );
  await expect(page.locator('#invoiceResults')).toBeVisible();

  const findingTexts = await invoiceFindingTexts(page);
  expect(findingTexts.some(t => /Taxable amount.*differs/i.test(t))).toBe(false);
  expect(findingTexts.some(t => /VAT amount.*differs/i.test(t))).toBe(false);

  const totalsTable = page.locator('#invoiceResults table.inv', { hasText: 'Taxable amount' });
  const taxableRow = totalsTable.locator('tr', { hasText: 'Taxable amount' });
  await expect(taxableRow).toContainText('200.00');
  await expect(taxableRow.locator('.pill')).toHaveText('Match');
});

// docs/testing.md: "INVOIC: TAX segment missing rate detected and grouped."
test('TAX segments with a category but no rate are grouped into one finding', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'tax-missing-rate.sup.edi'),
    path.join(FIX, 'tax-missing-rate.bol.ubl.xml'),
  );
  await expect(page.locator('#invoiceResults')).toBeVisible();

  const findingTexts = await invoiceFindingTexts(page);
  const taxFindings = findingTexts.filter(t => /no rate specified/i.test(t));
  expect(taxFindings).toHaveLength(1);
  expect(taxFindings[0]).toContain('3 tax segments');
  expect(taxFindings[0]).toContain('line 1');
  expect(taxFindings[0]).toContain('line 2');
  expect(taxFindings[0]).toContain('line 3');
});

// docs/testing.md: "INVOIC: qty×price vs. line-amount gap flagged only
// outside a rounding tolerance, and never sent to Transus."
test('qty x price vs line-amount gap is flagged only outside rounding tolerance, and stays out of Message checks -> never Transus', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'line-arithmetic-tolerance.sup.edi'),
    path.join(FIX, 'line-arithmetic-tolerance.bol.ubl.xml'),
  );
  await expect(page.locator('#invoiceResults')).toBeVisible();

  const buckets = await invoiceFindingsByCategory(page);
  const arithInMessage = buckets.message.filter(t => /quantity × net price/i.test(t));
  // One within-tolerance line (info) and one outside (warn) — both are
  // "message" category (the message's own arithmetic), never "diff".
  expect(arithInMessage).toHaveLength(2);
  expect(arithInMessage.some(t => t.includes('4444444444444') && t.includes('within what rounding'))).toBe(true);
  expect(arithInMessage.some(t => t.includes('5555555555555') && t.includes('worth a second look'))).toBe(true);

  const arithInDiff = buckets.diff.filter(t => /quantity × net price/i.test(t));
  expect(arithInDiff).toHaveLength(0);
});

// docs/testing.md: "INVOIC: line-level allowance correctly shown as 'not
// forwarded (expected)', not as a difference."
test('a line-level allowance absent on the bol side shows as Not forwarded (expected)', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'line-allowance-not-forwarded.sup.edi'),
    path.join(FIX, 'line-allowance-not-forwarded.bol.ubl.xml'),
  );
  await expect(page.locator('#invoiceResults')).toBeVisible();

  const chargeRow = page.locator('#invoiceResults table.inv tr', { hasText: 'DISCOUNT' });
  await expect(chargeRow).toContainText('Not forwarded (expected)');

  const findingTexts = await invoiceFindingTexts(page);
  expect(findingTexts.some(t => /Allowance.*only present in the supplier message/i.test(t))).toBe(false);
});

// docs/testing.md: "INVOIC: a UBL line-amount gap that exactly matches a
// charge is treated as a match, not a difference."
test('a UBL line-amount gap that exactly matches a line-level charge is a match, not a difference', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'ubl-line-amount-includes-charge.sup.edi'),
    path.join(FIX, 'ubl-line-amount-includes-charge.bol.ubl.xml'),
  );
  await expect(page.locator('#invoiceResults')).toBeVisible();

  // Scoped to the per-line finding format ("EAN <x>: Line amount differs ...")
  // — a header-level "Total line amounts" gap is a separate, pre-existing
  // total that isn't charge-reconciled the same way (see final summary);
  // it isn't what this scenario from docs/testing.md is about.
  const findingTexts = await invoiceFindingTexts(page);
  expect(findingTexts.some(t => /EAN.*Line amount.*differs/i.test(t))).toBe(false);

  const lineRow = page.locator('#invoiceResults table.inv tr', { hasText: '7777777777777' });
  await expect(lineRow.locator('.pill')).toHaveText('Match');
});

// A message whose summary-level TAX segment states the VAT rate in a
// different position than its own line-level TAX segments — ECHO still
// reads the rate fine either way, but this is a confirmed real cause of
// Transus rejecting a message with "VAT percentage/amount is missing".
test('a VAT-rate position mismatch between line-level and summary TAX segments is flagged, in both Compare and Quick check', async ({ page }) => {
  const sup = path.join(FIX, 'tax-rate-encoding-mismatch.sup.edi');
  const bol = path.join(FIX, 'tax-rate-encoding-mismatch.bol.ubl.xml');

  await openApp(page);
  await runCompareFixtures(page, sup, bol);
  await expect(page.locator('#invoiceResults')).toBeVisible();

  const buckets = await invoiceFindingsByCategory(page);
  const mismatchFindings = buckets.message.filter(t => /different position/i.test(t));
  expect(mismatchFindings).toHaveLength(1);
  expect(mismatchFindings[0]).toContain('Supplier —');
  expect(mismatchFindings[0]).not.toContain('Bol —'); // bol side is UBL XML, not subject to this EDIFACT-only quirk

  // Never a mapping question — must never reach "Copy for Transus" (cat 'diff').
  const mismatchInDiff = buckets.diff.filter(t => /different position/i.test(t));
  expect(mismatchInDiff).toHaveLength(0);

  // Same message, read standalone in Quick check, shows the same note.
  await runQuickFixture(page, sup);
  await expect(page.locator('#quickOverview')).toContainText('different position');
});
