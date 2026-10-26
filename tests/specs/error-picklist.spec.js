const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures, runQuickFixture } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures');
const D = f => path.join(FIX, 'desadv', f);
const O = f => path.join(FIX, 'ordrsp', f);
const I = f => path.join(FIX, 'invoic', f);

// "Got an error message?": a colleague picks the error bol's system or
// Transus returned (or pastes its text), and ECHO says what it usually
// means, where to look, and links the related findings by their fkey keys
// (docs/ui-conventions.md "Error picklist").

test('Compare: picking an error from the dropdown links the related finding and flashes it', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, D('order-number-missing-digit.sup.edi'), D('order-number-missing-digit.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  // The control sits right under the verdict.
  const html = await page.locator('#results').innerHTML();
  expect(html.indexOf('id="verdict"')).toBeLessThan(html.indexOf('id="errPick-compare"'));
  expect(html.indexOf('id="errPick-compare"')).toBeLessThan(html.indexOf('id="findingsPanel"'));
  const card = page.locator('#errPickCard-compare');
  await expect(card).toBeHidden();

  await page.locator('#errPickSel-compare').selectOption('po-not-found');
  await expect(card).toBeVisible();
  await expect(card).toContainText('"Purchase Order not found"');
  await expect(card).toContainText('What it usually means:');
  await expect(card).toContainText('Where to look:');
  await expect(card).toContainText('RFF+ON');
  await expect(card).toContainText('ECHO found one related finding');
  const link = card.locator('.err-related a', { hasText: 'Order number looks incomplete' });
  await expect(link).toHaveCount(1);
  await expect(card.locator('.err-related')).toContainText('Message checks');
  await link.click();
  const target = page.locator('#findings li', { hasText: 'Order number looks incomplete' });
  await expect(target).toHaveClass(/\bf-pulse\b/);
  await expect(target).toBeInViewport();
  // No em-dashes in the card.
  expect(await card.innerText()).not.toContain('—');
});

test('pasted error text is matched by keywords, tolerant of IDs, numbers and quotes around it', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, D('order-number-missing-digit.sup.edi'), D('order-number-missing-digit.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const card = page.locator('#errPickCard-compare');
  await page.locator('#errPickTxt-compare').fill('Delivery 4711 failed: “PURCHASE ORDER   not found” (700001) 2026-10-26 10:15');
  await expect(card).toContainText('"Purchase Order not found"');
  await expect(card).toContainText('matched from your text');
  await expect(page.locator('#errPickSel-compare')).toHaveValue('po-not-found');
  await expect(card.locator('.err-related a')).toHaveCount(1);
  // The order number from the error text is looked up in the message.
  await expect(card).toContainText('700001 is in this message');
  await expect(card.locator('.clickable-val', { hasText: '700001' })).toHaveCount(1);
  await page.locator('#errPickTxt-compare').fill('Purchase Order not found: 123456789');
  await expect(card).toContainText("123456789 doesn't appear in this message");

  // The matcher on its own, on the known error texts with noise around them.
  const ids = await page.evaluate(() => [
    'Ean not known: 8700000012345',
    'ERROR: EAN 8700000012345 is not known',
    'Unit price is unknown; item EAN: 8700000012345',
    "  'Packing List Reference must not exceed 15 characters'  ",
    'Couldn’t parse XML content of the file (id 99887766)',
    'VAT percentage/amount is missing',
    'Duplicate reference: packing slip PKS1001 already received',
    'SSCC 387000000000000019 not found',
    '[#123] "purchase order not found"',
  ].map(t => (matchErrorText(t) || {}).id || null));
  expect(ids).toEqual(['ean-not-known', 'ean-not-known', 'unit-price-unknown', 'packref-too-long',
    'xml-parse', 'vat-missing', 'duplicate-reference', 'sscc', 'po-not-found']);
});

test('no match: says so plainly and offers the list; Clear resets', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, D('two-messages.edi'));
  const card = page.locator('#errPickCard-quick');
  await page.locator('#errPickTxt-quick').fill('Something completely unrelated happened 42');
  await expect(card).toContainText("ECHO doesn't recognise this error text yet.");
  await expect(page.locator('#errPickSel-quick')).toHaveValue('');
  const n = await page.evaluate(() => ERROR_CATALOGUE.length);
  await expect(card.locator('.err-choices button')).toHaveCount(n);
  await card.locator('.err-choices button', { hasText: 'SSCC not found' }).click();
  await expect(card).toContainText('"SSCC not found / pallet without SSCC"');
  await expect(page.locator('#errPickSel-quick')).toHaveValue('sscc');
  await page.locator('#errPickClear-quick').click();
  await expect(card).toBeHidden();
  await expect(page.locator('#errPickTxt-quick')).toHaveValue('');
});

test('Quick check: a clean message says honestly that ECHO sees nothing related', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, D('two-messages.edi'));
  await expect(page.locator('#quickOverview .quick-summary')).toContainText('Nothing unusual found.');
  // The control sits above the overview.
  await expect(page.locator('#quickErrPick .err-pick')).toBeVisible();
  await page.locator('#errPickSel-quick').selectOption('po-not-found');
  const card = page.locator('#errPickCard-quick');
  await expect(card).toContainText('ECHO sees nothing in this message that explains it; check in bol');
  await expect(card.locator('.err-related')).toHaveCount(0);
});

test('Quick check: related findings for the packing reference and the price errors', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, D('packing-reference-too-long.sup.edi'));
  await page.locator('#errPickSel-quick').selectOption('packref-too-long');
  const card = page.locator('#errPickCard-quick');
  const link = card.locator('.err-related a', { hasText: 'Packing reference too long' });
  await expect(link).toHaveCount(1);
  await link.click();
  await expect(page.locator('#quickOverview .findings li', { hasText: 'Packing reference too long' })).toHaveClass(/\bf-pulse\b/);

  await openApp(page);
  await runQuickFixture(page, O('no-price-anywhere.sup.edi'));
  await page.locator('#errPickTxt-quick').fill('Unit price is unknown; item EAN: 8700000000018');
  await expect(card).toContainText('"Unit price is unknown"');
  await expect(card.locator('.err-related a', { hasText: 'none of the' })).toHaveCount(1);
  // An error that usually comes with another message type says so.
  await page.locator('#errPickSel-quick').selectOption('packref-too-long');
  await expect(card).toContainText('this error usually comes with a DESADV, and this is an ORDRSP');
});

test('Compare: nothing related in a clean pair; INVOIC: the VAT error links the tax findings', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, D('gtin-padding.sup.edi'), D('gtin-padding.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  await page.locator('#errPickSel-compare').selectOption('packref-too-long');
  await expect(page.locator('#errPickCard-compare')).toContainText('ECHO sees nothing in this message that explains it; check the packing reference in the source system.');

  await runCompareFixtures(page, I('tax-missing-rate.sup.edi'), I('tax-missing-rate.bol.ubl.xml'));
  await expect(page.locator('#invoiceResults')).toBeVisible();
  await expect(page.locator('#invoiceResults #errPick-compare')).toBeVisible();
  // Only one picker in Compare, even after an ORDRSP/DESADV result before.
  await expect(page.locator('#errPick-compare')).toHaveCount(1);
  await page.locator('#errPickTxt-compare').fill('VAT percentage/amount is missing');
  const card = page.locator('#errPickCard-compare');
  await expect(card).toContainText('"VAT percentage/amount is missing"');
  await expect(card.locator('.err-related a', { hasText: 'no rate specified' })).toHaveCount(1);
});

test('Copy report gets one "Error reported" line; Copy for Transus does not', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, D('order-number-missing-digit.sup.edi'), D('order-number-missing-digit.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  expect(await page.evaluate(() => reportTextWithError(lastReportText))).not.toContain('Error reported');
  await page.locator('#errPickSel-compare').selectOption('po-not-found');
  let report = await page.evaluate(() => reportTextWithError(lastReportText));
  const lines = report.split('\n');
  expect(lines.filter(l => l.startsWith('Error reported:'))).toEqual(['Error reported: Purchase Order not found']);
  // After the context lines, before the findings.
  expect(lines.indexOf('Error reported: Purchase Order not found')).toBeLessThan(lines.indexOf(''));
  // Pasted text wins over the label: it's what the colleague actually got.
  await page.locator('#errPickTxt-compare').fill('Purchase Order not found: 700001');
  await expect(page.locator('#errPickCard-compare')).toContainText('matched from your text');
  report = await page.evaluate(() => reportTextWithError(lastReportText));
  expect(report).toContain('Error reported: Purchase Order not found: 700001');
  expect(await page.evaluate(() => lastTransusTextEn + lastTransusTextNl)).not.toContain('Error reported');
});

test('error catalogue: every entry is complete, neutral and free of em-dashes', async ({ page }) => {
  await openApp(page);
  const problems = await page.evaluate(() => ERROR_CATALOGUE.flatMap(e => {
    const out = [];
    ['id', 'label', 'meaning', 'where', 'elsewhere'].forEach(k => { if (!e[k]) out.push(`${e.id}: no ${k}`); });
    if (!e.match.length || !e.keys.length) out.push(`${e.id}: no match/keys`);
    if (!matchErrorText(e.label) || matchErrorText(e.label).id !== e.id) out.push(`${e.id}: own label doesn't match`);
    [e.label, e.meaning, e.where, e.elsewhere].forEach(t => { if (/—/.test(t)) out.push(`${e.id}: em-dash`); if (/\b(invalid|wrong|mistake|error by)\b/i.test(t.replace(/<[^>]+>/g, ''))) out.push(`${e.id}: judging word`); });
    return out;
  }));
  expect(problems).toEqual([]);
});
