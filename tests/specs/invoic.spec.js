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

  // The finding spells out the exact corrected segment shape, confirmed by
  // Transus support across more than one real case — not just "something's
  // wrong here", so it's directly actionable without a second round-trip.
  expect(mismatchFindings[0]).toContain("TAX+7+VAT+++:::21+S'");
  expect(mismatchFindings[0]).toContain("TAX+7+VAT+++21:S'");

  // Never a mapping question — must never reach "Copy for Transus" (cat 'diff').
  const mismatchInDiff = buckets.diff.filter(t => /different position/i.test(t));
  expect(mismatchInDiff).toHaveLength(0);

  // Same message, read standalone in Quick check, shows the same note.
  await runQuickFixture(page, sup);
  await expect(page.locator('#quickOverview')).toContainText('different position');
});

// Line-level charges are matched across sides by the line's own GTIN
// (index.html's chargeList()), separately from the line-matching key used
// for the rest of the comparison. A GTIN-12/13 leading-zero difference
// between supplier and bol (already normalized fine for the line match
// itself) previously wasn't run through normalizeGtin() for this second,
// charge-specific key — so the exact same charge, present on both sides
// with the same amount, showed up as two contradictory findings ("only on
// the supplier" and "only on bol" at once) instead of matching.
test('a line-level charge matches across sides despite a GTIN-12/13 leading-zero difference on that line', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'line-charge-gtin-padding.sup.edi'),
    path.join(FIX, 'line-charge-gtin-padding.bol.ubl.xml'),
  );
  await expect(page.locator('#invoiceResults')).toBeVisible();

  const buckets = await invoiceFindingsByCategory(page);
  expect([...buckets.diff, ...buckets.message].some(t => /RAD/i.test(t))).toBe(false);

  const chargeRows = page.locator('#invoiceResults table.inv tr', { hasText: 'RAD' });
  await expect(chargeRows).toHaveCount(1);
  await expect(chargeRows).toContainText('Match');
});

// The VAT number (RFF+VA / PartyTaxScheme CompanyID) was already parsed
// and shown in the "Show invoice overview" detail panel, but never in the
// top-level "Invoice details" side-by-side table where GLNs already are —
// real workflow need: checking the VAT number is part of the normal
// invoice-verification routine, not just an occasional detail lookup.
test('the VAT number is shown per party in the Invoice details table, alongside GLN', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'vat-number-shown.sup.edi'),
    path.join(FIX, 'vat-number-shown.bol.ubl.xml'),
  );
  await expect(page.locator('#invoiceResults')).toBeVisible();

  const supVatRow = page.locator('#invoiceResults table.inv tr', { hasText: 'Supplier (VAT)' });
  await expect(supVatRow).toContainText('DE111111111');
  const buyVatRow = page.locator('#invoiceResults table.inv tr', { hasText: 'Buyer (VAT)' });
  await expect(buyVatRow).toContainText('NL222222222B01');
});

// Confirmed against a real 25-line invoice: every line sat at exactly
// ~90.0% of qty×net price, with nothing in the message (no ALC/PCD
// segment) explaining why — 25 near-identical "worth a second look" notes
// (capped at 5, "20 more" hidden) completely buried that it was one
// uniform pattern, not 25 separate arithmetic mistakes. Fixture: 4 lines
// at a consistent 90%, plus a 5th at a distinctly different ratio (75%)
// that must stay its own, separate finding rather than being swept in.
test('a uniform percentage gap across multiple lines is grouped into one finding, not one per line', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'uniform-discount-pattern.sup.edi'),
    path.join(FIX, 'uniform-discount-pattern.bol.ubl.xml'),
  );
  await expect(page.locator('#invoiceResults')).toBeVisible();

  const buckets = await invoiceFindingsByCategory(page);
  const grouped = buckets.message.filter(t => /consistently at about/i.test(t));
  expect(grouped).toHaveLength(1);
  expect(grouped[0]).toContain('4 items');
  expect(grouped[0]).toContain('90.0%');
  expect(grouped[0]).toContain('1111111111111');
  expect(grouped[0]).toContain('2222222222222');
  expect(grouped[0]).toContain('3333333333333');
  expect(grouped[0]).toContain('4444444444444');
  // Never claims which side introduced it — attributes it to the message
  // itself and points at the feed generator, not bol/Transus.
  expect(grouped[0]).toContain("bol's transformation");

  // The outlier (a genuinely different ratio) is never folded into the
  // group — it still gets its own individual finding.
  const individual = buckets.message.filter(t => /quantity × net price/i.test(t) && t.includes('5555555555555'));
  expect(individual).toHaveLength(1);
  expect(individual[0]).not.toContain('consistently at about');

  // Never a mapping question — must never reach "Copy for Transus" (cat 'diff').
  expect(buckets.diff.some(t => /consistently at about/i.test(t))).toBe(false);
});

// docs/formats-and-quirks.md: a raw ASCII control character (e.g. 0x16) in
// an EDIFACT IMD item description is perfectly legal in EDIFACT but illegal
// in XML — confirmed real cause of a "Couldn't parse XML content of the
// file" delivery failure once it's carried through into bol's generated
// UBL invoice. Two related mechanisms: (1) flagged as a Message check on
// the supplier's own message, proactively, before it ever reaches XML; (2)
// when a file that's already XML (bol's own output) contains one, ECHO
// strips it so the comparison can still run, with a loud banner explaining
// why the real delivery failed rather than silently showing an empty
// "no invoice could be extracted" result.
test('an illegal XML control character in an item description is flagged on the supplier side, and stripped with a loud banner on the XML side', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'illegal-xml-char.sup.edi'),
    path.join(FIX, 'illegal-xml-char.bol.ubl.xml'),
  );
  await expect(page.locator('#invoiceResults')).toBeVisible();

  // The bol-side banner: file recovered, but the underlying delivery
  // genuinely failed and still needs an upstream fix.
  const resultsText = await page.locator('#invoiceResults').innerText();
  expect(resultsText).toContain('This file contains 1 illegal control character');
  expect(resultsText).toContain('0x16');
  expect(resultsText).toContain('Couldn\'t parse XML content of the file');

  // The supplier-side Message check, never sent to Transus.
  const buckets = await invoiceFindingsByCategory(page);
  const supFinding = buckets.message.filter(t => /illegal control character/i.test(t) && t.includes('Supplier —'));
  expect(supFinding).toHaveLength(1);
  expect(supFinding[0]).toContain('0x16');
  expect(supFinding[0]).toContain('Affected: line 1');
  expect(buckets.diff.some(t => /illegal control character/i.test(t))).toBe(false);
});

// Same fixture, supplier side read standalone in Quick check (CLAUDE.md's
// parity rule) — the file-level banner has nothing to compare in Quick
// check, but the per-description Message check still fires on its own.
test('the illegal-control-character finding is also flagged standalone in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'illegal-xml-char.sup.edi'));
  await expect(page.locator('#quickOverview')).toContainText('illegal control character');
  await expect(page.locator('#quickOverview')).toContainText('0x16');
});
