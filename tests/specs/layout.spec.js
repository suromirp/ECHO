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

// One glossary (docs/ui-conventions.md "Terminology"): DESADV QTY+12 is
// "Despatched", DTM+132 is "Expected delivery", "Packing reference"
// everywhere, and "Check" no longer means three things.
test('terminology: Despatched, Expected delivery, Packing reference, and distinct words for "check"', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'desadv', 'gtin-padding.sup.edi'), path.join(FIX, 'desadv', 'gtin-padding.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  await page.locator('#lineFilterToggle').uncheck({ force: true });
  await expect(page.locator('#lineTable')).toContainText('Despatched:');
  await expect(page.locator('#lineTable')).not.toContainText('Confirmed:');
  // Search counts name items (one row per item), not lines.
  await page.locator('#resultSearchInput').fill('zzz-no-such-value');
  await expect(page.locator('#lineFilterNote')).toContainText('No items match');

  await openApp(page);
  await page.locator('#tabQuickBtn').click();
  await page.locator('#quickFileInput').setInputFiles(path.join(FIX, 'desadv', 'bill-of-lading-reference.sup.edi'));
  const ov = page.locator('#quickOverview');
  await expect(ov.locator('.field .l', { hasText: /^Packing reference$/ })).toHaveCount(1);
  await expect(ov).not.toContainText('Packing reference number');
  await expect(ov).not.toContainText('Arrival date');
  await expect(ov.locator('#quickLinesTable th', { hasText: 'Despatched' })).toHaveCount(1);

  const legend = page.locator('#legendDetails');
  await expect(legend).not.toContainText('Check this first');
  await expect(legend).toContainText('Look at this first');
  await expect(legend.locator('.pill', { hasText: 'Minor difference' })).toHaveCount(1);
  await expect(legend.locator('.pill.neutral', { hasText: 'Not applicable' })).toHaveCount(1);
  await expect(legend.locator('.pill.neutral', { hasText: 'One side only' })).toHaveCount(1);
});

// "Not applicable" means absent on both sides (legend); a total sent on one
// side only is "One side only", and neither is shown in a warning colour.
test('INVOIC: a one-sided total is "One side only" in a neutral colour', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'invoic', 'rounding-gaps.sup.edi'), path.join(FIX, 'invoic', 'rounding-gaps.bol.ubl.xml'));
  const pill = page.locator('#invoiceResults table.inv tr', { hasText: 'Taxable amount' }).locator('.pill');
  await expect(pill).toHaveText('One side only');
  await expect(pill).toHaveClass(/neutral/);
});

function contrast(a, b) {
  const L = c => {
    const [r, g, bl] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => v / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Contrast: faint text and the "More info" toggle reach 4.5:1 on panels;
// the Compare button stands out from its panel.
test('faint text and "More info" reach 4.5:1 contrast; the Compare button stands out', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'desadv', 'date-shift.sup.edi'), path.join(FIX, 'desadv', 'date-shift.bol.edi'));
  const colors = await page.evaluate(() => {
    const cs = e => getComputedStyle(e);
    const probe = document.createElement('span');
    probe.style.color = 'var(--text-faint)';
    document.body.appendChild(probe);
    const panel = cs(document.querySelector('.panel')).backgroundColor;
    const panel3 = (() => { const d = document.createElement('div'); d.style.background = 'var(--panel-3)'; document.body.appendChild(d); return cs(d).backgroundColor; })();
    const more = cs(document.querySelector('details.f-more > summary')).color;
    const btn = document.getElementById('compareBtn');
    return { faint: cs(probe).color, panel, panel3, more, btnBg: cs(btn).backgroundColor, btnFg: cs(btn).color };
  });
  expect(contrast(colors.faint, colors.panel)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.faint, colors.panel3)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.more, colors.panel3)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.btnFg, colors.btnBg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.btnBg, colors.panel)).toBeGreaterThanOrEqual(3);
});

// Mobile isn't a priority, but the page must not scroll sideways at 390px
// (the version tag in the header used to cause it).
test('no horizontal page scroll at 390px wide', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await openApp(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.close();
});
