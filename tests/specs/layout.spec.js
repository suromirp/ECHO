const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures');

/** DOM order of the given selectors (index in document order), -1 when absent. */
async function domOrder(page, selectors) {
  return page.evaluate(sels => {
    const all = [...document.querySelectorAll('*')];
    return sels.map(s => {
      const el = document.querySelector(s);
      return el ? all.indexOf(el) : -1;
    });
  }, selectors);
}

function expectAscending(order) {
  order.forEach(i => expect(i).toBeGreaterThan(-1));
  for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
}

// docs/ui-conventions.md "Verdict" and "Result layout": verdict + "Where to
// look" → Findings (Worth checking inside) → stats strip → Header fields
// (collapsed) → search box → tables → raw messages.
test('Compare results follow the findings-first layout, Worth checking sits inside Findings', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'desadv', 'date-shift.sup.edi'), path.join(FIX, 'desadv', 'date-shift.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  expectAscending(await domOrder(page, ['#verdict', '#findingsPanel', '#strip', '#hdrFields', '#searchPanel', '#lineTable', '#rawDetails']));
  expect(await page.locator('#findingsPanel #wcPanel').count()).toBe(1);
  expect(await page.locator('#hdrFields details.hdr-fields').evaluate(e => e.open)).toBe(false);
  // The search box is directly above the tables it filters.
  expectAscending(await domOrder(page, ['#searchPanel', '#backorderPanel', '#lineTable', '#ssccPanel']));
});

test('a clean comparison says there is nothing to act on', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'desadv', 'two-messages.edi'),
    path.join(FIX, 'desadv', 'transusxml-two-messages.bol.edi'),
  );
  const verdict = page.locator('#verdict');
  await expect(verdict).toHaveClass(/\bok\b/);
  await expect(verdict.locator('.vtitle')).toHaveText("Bol's output matches the supplier message");
  await expect(verdict.locator('.vplay')).toHaveText('Loud and clear.');
  await expect(verdict.locator('.vwhere')).toContainText('Where to look: Nothing to act on.');
});

// The "Where to look" link scrolls to the section it names.
test('the "Where to look" link points at the findings section it names', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'desadv', 'date-shift.sup.edi'), path.join(FIX, 'desadv', 'date-shift.bol.edi'));
  const link = page.locator('#verdict .vwhere a', { hasText: 'Transformation differences' });
  await expect(link).toHaveAttribute('onclick', /cfc-diff/);
  await expect(page.locator('#cfc-diff')).toHaveText('Transformation differences');
});

test('INVOIC results: verdict with "Where to look", Findings before the stats, Invoice details collapsed', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'invoic', 'zero-ean-bol-output.sup.edi'), path.join(FIX, 'invoic', 'zero-ean-bol-output.bol.ubl.xml'));
  await expect(page.locator('#invoiceResults')).toBeVisible();
  const verdict = page.locator('#invVerdict');
  await expect(verdict.locator('.vtitle')).toHaveText("Bol's invoice differs from the supplier invoice");
  await expect(verdict.locator('.vwhere')).toContainText('Transformation differences (1)');
  expectAscending(await domOrder(page, ['#invVerdict', '#invoiceResults ul.findings', '#invoiceResults .strip', '#invHdrDetails', '#invRawDetails']));
  expect(await page.locator('#invHdrDetails').evaluate(e => e.open)).toBe(false);
  await expect(page.locator('#invHdrDetails > summary')).toContainText('Invoice details');
});

// Tables never contradict findings (docs/ui-conventions.md): a line whose
// EAN bol's output replaced by zeros shows "supplier EAN → 0000000000000"
// and Difference (it used to read Match), its SSCC's pallet pill is a
// Difference, and the Quantities tile says it is per EAN.
test('a zeroed bol EAN shows in the line table and pallet overview as a Difference', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'desadv', 'zero-ean-shared-pallet.sup.edi'), path.join(FIX, 'desadv', 'zero-ean-shared-pallet.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  await page.locator('#lineFilterToggle').uncheck({ force: true });
  const zeroRows = page.locator('#lineTable tr', { hasText: '→ 0000000000000' });
  await expect(zeroRows).toHaveCount(2);
  for (const r of await zeroRows.all()) await expect(r.locator('.pill')).toHaveText('Difference');
  const pallets = page.locator('#ssccBody .pallet-det > summary', { hasText: '387000000000000033' });
  await expect(pallets).toHaveCount(2);
  for (const p of await pallets.all()) {
    await expect(p).toContainText('Difference');
    await expect(p).toContainText("EAN zeroed in bol's output");
    await expect(p).not.toContainText('Match');
  }
  const qty = page.locator('#strip .stat', { hasText: 'Quantities' });
  await expect(qty.locator('.l')).toHaveText('Quantities (per EAN)');
  await expect(qty).toHaveAttribute('title', /per EAN/);
});

test('an SSCC a Message check is about never shows a plain OK/Match pill (Quick check and Compare)', async ({ page }) => {
  const fx = path.join(FIX, 'desadv', 'gs1-check-digit.edi');
  await openApp(page);
  await page.locator('#tabQuickBtn').click();
  await page.locator('#quickFileInput').setInputFiles(fx);
  const qc = page.locator('#quickOverview .pallet-det > summary', { hasText: '387000000000000012' });
  await expect(qc).toContainText("check digit doesn't match");
  await expect(qc).not.toContainText('OK');

  await openApp(page);
  await runCompareFixtures(page, fx, fx);
  const cmp = page.locator('#ssccBody .pallet-det > summary', { hasText: '387000000000000012' });
  await expect(cmp.first()).toContainText("check digit doesn't match");
  await expect(cmp.first()).not.toContainText('Match');
});

test('INVOIC: a zeroed bol EAN shows in the line table as a Difference', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'invoic', 'zero-ean-bol-output.sup.edi'), path.join(FIX, 'invoic', 'zero-ean-bol-output.bol.ubl.xml'));
  await expect(page.locator('#invoiceResults')).toBeVisible();
  const row = page.locator('#invoiceResults table.inv tr', { hasText: '→ 0000000000000' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.pill')).toHaveText('Difference');
});
