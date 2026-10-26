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
