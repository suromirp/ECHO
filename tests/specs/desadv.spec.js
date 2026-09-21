const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures, runQuickFixture } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures', 'desadv');

// docs/testing.md: "DESADV: GTIN-12/13 leading-zero padding normalized
// across sides."
test('GTIN-12/13 leading-zero padding is normalized across sides', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'gtin-padding.sup.edi'),
    path.join(FIX, 'gtin-padding.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const findingTexts = await page.locator('#findings li').allInnerTexts();
  expect(findingTexts.some(t => /missing/i.test(t))).toBe(false);

  // Exactly one item, matched — not treated as two separate GTINs.
  // Note: the "Quantities" label itself renders CSS-uppercased (text-transform),
  // so match on it case-insensitively rather than on exact rendered text
  // (see docs/testing.md point 5 on stale case-sensitive assertions).
  const qtyStat = page.locator('.stat', { hasText: /quantities/i }).first();
  await expect(qtyStat).toContainText('Match');
});

// docs/testing.md: "DESADV: bol's GTIN blanked entirely, falls back to
// article code."
test('bol GTIN blanked entirely falls back to matching on article code', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'gtin-blanked-article-fallback.sup.edi'),
    path.join(FIX, 'gtin-blanked-article-fallback.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const findingTexts = await page.locator('#findings li').allInnerTexts();
  expect(findingTexts.some(t => /missing/i.test(t))).toBe(false);
  const qtyStat = page.locator('.stat:has-text("Quantities")').first();
  await expect(qtyStat).toContainText('Match');
});

// docs/testing.md: "DESADV: bol's GTIN blanked and no article code anywhere
// — resolved via single-item-per-pallet SSCC pairing, not left as 'missing'."
test('bol GTIN blanked with no article code anywhere resolves via single-item-pallet SSCC pairing', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'sscc-single-item-fallback.sup.edi'),
    path.join(FIX, 'sscc-single-item-fallback.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const findingTexts = await page.locator('#findings li').allInnerTexts();
  expect(findingTexts.some(t => /missing/i.test(t))).toBe(false);
  const qtyStat = page.locator('.stat:has-text("Quantities")').first();
  await expect(qtyStat).toContainText('Match');
});

// docs/testing.md: "DESADV: pallet-weight sum vs. shipment-total mismatch
// detected."
test('pallet-weight sum vs. shipment-total mismatch is detected', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'pallet-weight-mismatch.sup.edi'),
    path.join(FIX, 'pallet-weight-mismatch.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const findingTexts = await page.locator('#findings li').allInnerTexts();
  const weightFindings = findingTexts.filter(t => t.includes("doesn't match the sum of its"));
  expect(weightFindings).toHaveLength(1);
  expect(weightFindings[0]).toContain('Supplier');
  expect(weightFindings[0]).toContain('100'); // stated shipment total
  expect(weightFindings[0]).toContain('80'); // sum of the two pallets
});

// docs/testing.md: "DESADV: blank LIN' segments detected and excluded from
// the line count."
test('blank LIN segments are flagged and excluded from the line count', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'blank-lin.sup.edi'),
    path.join(FIX, 'blank-lin.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const findingTexts = await page.locator('#findings li').allInnerTexts();
  expect(findingTexts.some(t => /Supplier.*blank LIN segment/i.test(t))).toBe(true);

  // The blank segment must not have been counted as a real (phantom) line.
  const itemsStat = page.locator('.stat:has-text("Items")').first();
  await expect(itemsStat).toContainText('1');
  const supBolLines = page.locator('.stat:has-text("Supplier / bol lines")').first();
  await expect(supBolLines).toContainText('1/1');
});

// docs/formats-and-quirks.md: the DTM-duplicate-qualifier check is shared
// by ORDRSP and DESADV — both go through the same LIN-parsing code
// (parseFactsEdifact) — so it must fire for DESADV too, not just ORDRSP
// where the real case was first found.
test('a DTM qualifier repeated with different dates within one line is also flagged for DESADV', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'dtm-duplicate-qualifier.edi'));
  await expect(page.locator('#quickOverview')).toContainText('DTM+67 appears more than once');
  await expect(page.locator('#quickOverview')).toContainText('20260908');
  await expect(page.locator('#quickOverview')).toContainText('20260916');
});

// RFF+BM is the leading/authoritative source for the packing reference in
// bol's own systems (confirmed against bol's data sources) — so when
// present, it's shown AS "Packing reference" instead of BGM's document
// number, not as a second field alongside it. The fixture deliberately
// gives BGM and RFF+BM different values so a test asserting the wrong one
// would fail.
test('RFF+BM, when present, is shown as the packing reference instead of the BGM document number', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'bill-of-lading-reference.sup.edi'),
    path.join(FIX, 'bill-of-lading-reference.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const packStat = page.locator('.stat', { hasText: 'Packing reference' }).first();
  await expect(packStat).toContainText('123456789012345678');
  await expect(packStat).not.toContainText('DESADV0030');

  await runQuickFixture(page, path.join(FIX, 'bill-of-lading-reference.sup.edi'));
  await expect(page.locator('#quickOverview')).toContainText('123456789012345678');
});

// docs/ui-conventions.md: repeated findings of the same pattern group into
// one block with affected items as tags, and large lists (past ~20 items)
// collapse behind a way to still see everything — a real DESADV with 51
// SSCC-less pallets on each side produced 102 nearly-identical "No SSCC
// found" lines before this, one per pallet.
test('many pallets missing an SSCC are grouped into one finding with a collapsed list, not one line per pallet', async ({ page }) => {
  const fixture = path.join(FIX, 'many-pallets-missing-sscc.edi');
  await openApp(page);
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#results')).toBeVisible();

  const findings = page.locator('#findings li');
  const texts = await findings.allInnerTexts();
  const groupedLines = texts.filter(t => t.includes('No SSCC found'));
  // One grouped block per side, not one per pallet (25 pallets/side would
  // otherwise mean 50 separate findings).
  expect(groupedLines).toHaveLength(2);
  groupedLines.forEach(t => expect(t).toContain('25 pallet groups'));

  // Past the ~20-item threshold, the tag list collapses behind <details>.
  const details = page.locator('#findings .wc-affected').locator('xpath=ancestor::details');
  await expect(details).toHaveCount(2);
  const tagCount = await page.locator('#findings .wc-affected li').count();
  expect(tagCount).toBe(50); // 25 pallets x 2 sides
});

// docs/ui-conventions.md: "Distinct items", not "Items" — real user
// confusion over a message with many pallets/lines of the exact same EAN,
// where a bare "Items: 1" read as a total-units count rather than a
// distinct-product count.
test('the distinct-items stat is labeled and explained, not just a bare number', async ({ page }) => {
  const fixture = path.join(FIX, 'many-pallets-missing-sscc.edi');
  await openApp(page);
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#results')).toBeVisible();

  const itemsStat = page.locator('.stat', { hasText: 'Distinct items' }).first();
  await expect(itemsStat).toContainText('1'); // one EAN, spread across 25 pallets
  await expect(itemsStat).toHaveAttribute('title', /not the number of lines or pallets/i);
});

// docs/formats-and-quirks.md: a CPS group can be nested under a pallet CPS
// yet still carry its own SSCC (e.g. cartons each with their own SSCC,
// packed onto one pallet) — a legitimate two-level GS1 packing hierarchy,
// not the fold-up case (that only merges children with no SSCC of their
// own). Left flat and unmarked, this read as "an SSCC generated per unit
// instead of per pallet" on a real 268-entry message. Also covers
// docs/ui-conventions.md's "large lists collapse past ~20 items, with a
// way to still see everything" for Quick check's pallet overview, which
// previously had no collapsing at all (only Compare's separate panel did).
test('a nested CPS group that carries its own SSCC is marked as nested, not shown as an independent pallet, and a long pallet list collapses behind a toggle', async ({ page }) => {
  const fixture = path.join(FIX, 'nested-sscc-hierarchy.edi');
  await openApp(page);
  await runQuickFixture(page, fixture);
  await expect(page.locator('#quickOverview')).toBeVisible();

  const heading = page.locator('#quickOverview .sec-h', { hasText: 'pallet / SSCC overview' });
  await expect(heading).toContainText('(30)');

  // The intro line makes the true top-level-vs-nested split explicit,
  // instead of letting 30 flat entries read as 30 independent pallets.
  await expect(page.locator('#quickOverview .panel-intro')).toContainText('28 top-level pallets');
  await expect(page.locator('#quickOverview .panel-intro')).toContainText('2 nested units');

  // Each nested child names the parent pallet's SSCC it belongs under.
  await expect(page.locator('#quickOverview .pallet-list')).toContainText('nested under');
  await expect(page.locator('#quickOverview .pallet-list')).toContainText('000000000000000101');
  // The parent pallet, in turn, says how many nested units it has.
  await expect(page.locator('#quickOverview .pallet-list')).toContainText('+2 nested unit');

  // Past the 20-item threshold, the list defaults to collapsed (only
  // flagged entries shown) with a toggle to see everything.
  const toggle = page.locator('#quickOverview .pallet-block input[type=checkbox]');
  await expect(toggle).toBeChecked();
  const hiddenByDefault = await page.locator('#quickOverview .pallet-det.hidden').count();
  expect(hiddenByDefault).toBe(30); // every entry here matches cleanly, so all 30 start hidden
  await expect(page.locator('#quickOverview .pallet-block-note')).toContainText('All 30 match cleanly');

  // Toggling off reveals everything.
  await page.locator('#quickOverview .pallet-block .switch').click();
  await expect(page.locator('#quickOverview .pallet-det.hidden')).toHaveCount(0);
});

// docs/ui-conventions.md / docs/testing.md: one search box filters the line
// table and the pallet/SSCC overview together, live, by EAN, order number,
// SSCC or article code — in both Compare and Quick check. Also covers a
// real bug caught while building this: the box was originally ANDed with
// the existing "only show flagged/differences" filter, so searching for a
// specific item inside an all-clean message hid everything instead of
// finding it — a search match now overrides that filter while active.
test('a single search box filters the line table and pallet overview together, by EAN, order, SSCC or article code', async ({ page }) => {
  const fixture = path.join(FIX, 'search-fields.edi');
  await openApp(page);
  await runQuickFixture(page, fixture);
  await expect(page.locator('#quickSearchPanel')).toBeVisible();

  await page.locator('#quickSearchInput').fill('2222222222223'); // EAN
  await expect(page.locator('#quickLinesTable tr[data-search]:not(.hidden)')).toHaveCount(1);
  await expect(page.locator('#quickOverview .pallet-det:not(.hidden)')).toHaveCount(1);

  await page.locator('#quickSearchInput').fill('ARTCCC'); // article code
  await expect(page.locator('#quickLinesTable tr[data-search]:not(.hidden)')).toHaveCount(1);
  await expect(page.locator('#quickOverview .pallet-det:not(.hidden)')).toHaveCount(1);

  await page.locator('#quickSearchInput').fill('PO4001'); // order number (line table only — pallets don't carry order refs)
  await expect(page.locator('#quickLinesTable tr[data-search]:not(.hidden)')).toHaveCount(1);

  await page.locator('#quickSearchInput').fill('000000000000000302'); // SSCC (pallet overview only)
  await expect(page.locator('#quickOverview .pallet-det:not(.hidden)')).toHaveCount(1);
  await expect(page.locator('#quickOverview .pallet-det:not(.hidden)')).toContainText('000000000000000302');

  await page.locator('#quickSearchInput').fill('does-not-exist');
  await expect(page.locator('#quickSearchNote')).toContainText('No lines match');
  await expect(page.locator('#quickOverview .pallet-block-note')).toContainText('No pallets match');

  await page.locator('#quickSearchInput').fill('');
  await expect(page.locator('#quickLinesTable tr[data-search]:not(.hidden)')).toHaveCount(3);
});

// Same fixture, Compare mode — and the specific regression: a search match
// must show up even though every pallet in this message matches cleanly
// (status 'ok'), which the diff-only toggle would otherwise hide.
test('the search box also works in Compare, across both sides, and overrides the "only show differences" filter', async ({ page }) => {
  const fixture = path.join(FIX, 'search-fields.edi');
  await openApp(page);
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#searchPanel')).toBeVisible();

  await page.locator('#resultSearchInput').fill('ARTBBB');
  await expect(page.locator('#lineTable tr:not(:has(th))')).toHaveCount(1);
  // One pallet per side (supplier + bol), both carrying this article code.
  await expect(page.locator('#ssccBody .pallet-det:not(.hidden)')).toHaveCount(2);

  await page.locator('#resultSearchInput').fill('000000000000000301');
  await expect(page.locator('#ssccBody .pallet-det:not(.hidden)')).toHaveCount(2);

  await page.locator('#resultSearchInput').fill('');
  await expect(page.locator('#lineTable tr:not(:has(th))')).toHaveCount(3);
});
