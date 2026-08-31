const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures } = require('../helpers');

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
