const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures, runQuickFixture } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures', 'desadv');

async function findingsByCategory(page) {
  const items = await page.locator('#findings li').evaluateAll(
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
  // Neither side has any SSCC: ONE finding for that one fact, listing each
  // side's pallets (25 pallets/side would otherwise mean 50 separate
  // findings). Deliberate change: this used to be a "No SSCC found" block
  // per side next to a third "Neither message contains an SSCC" finding.
  const groupedLines = texts.filter(t => t.includes('Neither message contains an SSCC'));
  expect(groupedLines).toHaveLength(1);
  expect(groupedLines[0]).toContain('Supplier: 25 pallet groups without SSCC');
  expect(groupedLines[0]).toContain('Bol: 25 pallet groups without SSCC');
  expect(texts.some(t => t.includes('No SSCC found'))).toBe(false);

  // Past the ~20-item threshold, the tag list collapses behind <details>.
  const details = page.locator('#findings .wc-affected').locator('xpath=ancestor::details');
  await expect(details).toHaveCount(2);
  const tagCount = await page.locator('#findings .wc-affected li').count();
  expect(tagCount).toBe(50); // 25 pallets x 2 sides

  // Quick check still groups them into one "No SSCC found" finding.
  await openApp(page);
  await runQuickFixture(page, fixture);
  await expect(page.locator('#quickOverview')).toContainText('No SSCC found on 25 pallet groups');
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

// docs/formats-and-quirks.md: a pallet CPS can wrap nested package CPS
// groups instead of carrying items directly. If that top-level wrapper
// itself has no SSCC — even though the packages nested inside it do —
// the pallet has no usable SSCC from bol's point of view, since bol's
// system only reads the SSCC at pallet level, never one nested inside.
// This is a materially different, easy-to-miss gap from a flat pallet with
// no SSCC anywhere, and was previously invisible: a wrapper CPS with no
// items of its own and no SSCC was filtered out of both the "no SSCC"
// check and the pallet overview entirely.
test('a pallet wrapper missing its own SSCC is flagged even though nested packages inside it do carry one', async ({ page }) => {
  const fixture = path.join(FIX, 'pallet-sscc-only-on-package.edi');
  await openApp(page);
  await runQuickFixture(page, fixture);
  await expect(page.locator('#quickOverview')).toBeVisible();

  const overviewText = await page.locator('#quickOverview').innerText();
  expect(overviewText).toContain('No SSCC at pallet level');
  expect(overviewText).toContain('No SSCC found'); // the separate flat case (CPS 4) still fires too

  // A bare shipment-root CPS (no PAC/GIN at all, e.g. CPS+1 here) must
  // never be treated as "a pallet missing its SSCC" just because real
  // pallets happen to be nested under it — only 2 pallet groups total are
  // flagged here (the wrapper and the flat one), not the root.
  const wrapperMatches = overviewText.match(/No SSCC at pallet level on (\d+) pallet group/);
  expect(wrapperMatches[1]).toBe('1');
});

// Same fixture, Compare mode — parity rule: fires per side, stays a
// Message check (never sent to Transus, since it's a property of one
// side's own message construction, not a mapping question).
test('the pallet-level SSCC gap is also flagged per side in Compare, as a Message check never sent to Transus', async ({ page }) => {
  const fixture = path.join(FIX, 'pallet-sscc-only-on-package.edi');
  await openApp(page);
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#results')).toBeVisible();

  const buckets = await findingsByCategory(page);
  const wrapper = buckets.message.filter(t => /No SSCC at pallet level/i.test(t));
  expect(wrapper).toHaveLength(2); // one per side
  expect(wrapper.some(t => t.includes('Supplier —'))).toBe(true);
  expect(wrapper.some(t => t.includes('Bol —'))).toBe(true);
  expect(buckets.diff.some(t => /No SSCC at pallet level/i.test(t))).toBe(false);
});

// A real supplier (seen in production) sends DESADV as a flat, quoted-CSV
// record format (ENV/HDR/PAC/LIN/CNT) instead of EDIFACT segment syntax.
// Before this dialect was recognized, splitSegments found no `'`
// terminators at all and silently produced zero lines, so every item in
// bol's output showed up as "missing from the supplier" — a wall of false
// differences with nothing actually wrong. Confirmed against a real message
// where quantities matched on all lines once the format was parsed.
test('a flat quoted-CSV DESADV dialect is read, not silently treated as an empty supplier message', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'csv-dialect.sup.des'),
    path.join(FIX, 'csv-dialect.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('Quoted CSV');
  expect(resultsText).toContain('3/3'); // supplier / bol lines — none missing
  expect(resultsText).not.toMatch(/is present in the .* but .* missing/);

  // The real, separate difference this dialect surfaces once it's actually
  // parsed: the supplier's own pallets each carry an SSCC, but bol's output
  // flattens everything into one CPS with none at all.
  const buckets = await findingsByCategory(page);
  expect(buckets.diff.some(t => /2 SSCCs only in the supplier message/.test(t))).toBe(true);
  expect(buckets.message.some(t => /No SSCC found on 1 pallet group/.test(t))).toBe(true);
});

// Same fixture, Quick check on the supplier file alone — parity for format
// detection: detectMsgType must recognize this dialect too, or Quick check
// shows a blank overview instead of the business summary.
test('the CSV DESADV dialect is also recognized in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'csv-dialect.sup.des'));
  await expect(page.locator('#quickOverview')).toBeVisible();

  const overviewText = await page.locator('#quickOverview').innerText();
  expect(overviewText).toContain('9000001'); // order number read from the CSV
  expect(overviewText).toContain('3'); // 3 items
});

// The CSV dialect's HDR arrival date (field after the despatch date) wasn't
// read, so the header table only showed bol's DTM+132.
test('the CSV DESADV dialect\'s arrival date is read and matches bol\'s DTM+132', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'csv-dialect.sup.des'), path.join(FIX, 'csv-dialect.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const row = page.locator('#hdrFields tr', { hasText: 'Expected delivery' });
  await expect(row).toContainText('02-01-2026');
  await expect(row).not.toHaveClass(/differ/);
  expect((await row.locator('td').nth(1).innerText()).trim()).not.toBe('—');

  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'csv-dialect.sup.des'));
  await expect(page.locator('#quickOverview')).toContainText('02-01-2026');
});

// A real DESADV failed delivery outright with "Packing List Reference must
// not exceed 15 characters" — traced to an 18-character RFF+BM value, a
// hard downstream limit bol's own DESADV documentation doesn't mention at
// all (it only says the reference must be unique and visible on the
// physical shipment, no length given).
test('a Packing List Reference (RFF+BM) over 15 characters is flagged, per side', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'packing-reference-too-long.sup.edi'),
    path.join(FIX, 'packing-reference-too-long.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const buckets = await findingsByCategory(page);
  const tooLong = buckets.message.filter(t => /Packing List Reference too long/.test(t));
  expect(tooLong).toHaveLength(2); // one per side
  expect(tooLong.some(t => t.includes('Supplier —'))).toBe(true);
  expect(tooLong.some(t => t.includes('Bol —'))).toBe(true);
  tooLong.forEach(t => expect(t).toContain('17 characters'));
  // Never sent to Transus — it's a hard limit on the value itself, not a
  // mapping question.
  expect(buckets.diff.some(t => /Packing List Reference too long/.test(t))).toBe(false);
});

test('the Packing List Reference length check also fires standalone in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'packing-reference-too-long.sup.edi'));
  await expect(page.locator('#quickOverview')).toContainText('Packing List Reference too long');
  await expect(page.locator('#quickOverview')).toContainText('17 characters');
});

// Transus support's own ticket reply confirmed the mechanism: a CPS group
// with an SSCC (GIN+BJ) but no PAC segment doesn't just lose that one
// SSCC, it loses the packaging structure around it entirely — confirmed
// against a real message where 9 such CPS groups on the supplier side
// became one flat CPS with zero SSCCs on bol's side. A separate, lower-
// confidence observation from the same real message: one SSCC was 20
// characters (an Application Identifier "00" prefix bol's own
// documentation says not to include), kept as an info-level note since
// that alone hasn't been independently confirmed to cause a problem.
test('an SSCC without a PAC segment is flagged as a confirmed cause of the SSCC not reaching bol', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'sscc-no-pac.sup.edi'),
    path.join(FIX, 'sscc-no-pac.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const buckets = await findingsByCategory(page);
  const noPac = buckets.message.filter(t => /SSCC present but no PAC segment/.test(t));
  expect(noPac).toHaveLength(1); // supplier side only — bol's output has no SSCCs at all here
  expect(noPac[0]).toContain('Supplier —');
  expect(noPac[0]).toContain('3 pallet groups');
  expect(buckets.diff.some(t => /SSCC present but no PAC segment/.test(t))).toBe(false);

  const notEighteen = buckets.message.filter(t => /SSCC isn't 18 characters/.test(t));
  expect(notEighteen).toHaveLength(1);
  expect(notEighteen[0]).toContain('1 pallet group');
  expect(notEighteen[0]).toContain('00000000000000000099');
});

// Real Supplier Golf DESADV: "9 SSCC(s) only in the supplier message" was an err
// Transformation difference (sent to Transus), although every one of those
// SSCCs sat in a CPS without PAC — the Transus-confirmed supplier-side
// cause already flagged above. Now a Message check pointing there.
test('SSCCs missing from bol only because their CPS has no PAC are a Message check, not a Transformation difference', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'sscc-no-pac.sup.edi'), path.join(FIX, 'sscc-no-pac.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  expect(buckets.diff.some(t => /only in the supplier message/.test(t))).toBe(false);
  const msg = buckets.message.filter(t => /3 SSCCs only in the supplier message/.test(t));
  expect(msg).toHaveLength(1);
  expect(msg[0]).toContain('all in CPS groups without PAC');
  expect(msg[0]).toContain('see the PAC finding above');
  const transus = await page.evaluate(() => lastTransusTextEn);
  expect(transus).not.toContain('only in the supplier message');

  // A pallet that does carry PAC: still a Transformation difference.
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'sscc-only-one-side.sup.edi'), path.join(FIX, 'sscc-only-one-side.bol.edi'));
  const b2 = await findingsByCategory(page);
  expect(b2.diff.some(t => /22 SSCCs only in the supplier message/.test(t))).toBe(true);
});

test('both SSCC checks also fire standalone in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'sscc-no-pac.sup.edi'));
  await expect(page.locator('#quickOverview')).toContainText('SSCC present but no PAC segment');
  await expect(page.locator('#quickOverview')).toContainText("SSCC isn't 18 characters");
});

// A real TRANSUSXML DESADV (<Messages><Message>, no <?xml declaration) was
// routed to the EDIFACT parser and showed 0 supplier lines, so every item
// read as "missing from the supplier message". Once parsed, the real issue
// underneath surfaced: bol's output carried each line's order number one
// line late (line n got line n-1's order). Fixture reproduces both.
test('a TRANSUSXML DESADV without an <?xml declaration is parsed, and shifted order numbers are flagged', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'transusxml-messages.sup.xml'),
    path.join(FIX, 'transusxml-messages.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('Transus XML');
  expect(resultsText).toContain('3/3');
  expect(resultsText).not.toMatch(/is present in the .* but .* missing/);

  const buckets = await findingsByCategory(page);
  // An XML DespatchUnit has no PAC segment by design — never flagged for it.
  expect(buckets.message.some(t => /no PAC segment/.test(t))).toBe(false);
  expect(buckets.diff.some(t => /ART-B: order numbers differ/.test(t))).toBe(true);
  expect(buckets.diff.some(t => /ART-C: order numbers differ/.test(t))).toBe(true);
  expect(buckets.diff.some(t => /ART-A: order numbers differ/.test(t))).toBe(false);
});

test('a TRANSUSXML DESADV without an <?xml declaration is read in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'transusxml-messages.sup.xml'));
  await expect(page.locator('#quickOverview')).toBeVisible();
  const overviewText = await page.locator('#quickOverview').innerText();
  expect(overviewText).toContain('9100002');
  expect(overviewText).toContain('387000000000000026');
});

// A real bol DESADV output had every LIN's EAN replaced by 0000000000000
// while the supplier sent a valid EAN on every line. The SSCC fallback
// still paired the lines, so ECHO showed a clean "Match" and said nothing.
test('an EAN replaced by zeros in bol\'s output is flagged as a transformation difference', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'sscc-single-item-fallback.sup.edi'),
    path.join(FIX, 'sscc-single-item-fallback.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  expect(buckets.diff.some(t => /EAN replaced by zeros in bol's output/.test(t) && t.includes('9999999999999'))).toBe(true);
  // Already explained by the diff finding — not repeated as a Bol message check.
  expect(buckets.message.some(t => /Bol — EAN is all zeros/.test(t))).toBe(false);
});

test('an all-zeros EAN is flagged standalone in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'sscc-single-item-fallback.bol.edi'));
  await expect(page.locator('#quickOverview')).toBeVisible();
  await expect(page.locator('body')).toContainText('EAN is all zeros');
});

// EANCOM's consignment level: a top-level CPS+1 with a summary PAC
// ("2 pallets") followed by the pallets themselves, each with an SSCC.
// Real Supplier Bravo/Supplier Alfa messages with exactly this shape were wrongly
// flagged as "No SSCC at pallet level" on CPS 1.
test('a top-level consignment CPS with a summary PAC is not flagged as a pallet missing its SSCC', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'consignment-summary-cps.edi'),
    path.join(FIX, 'consignment-summary-cps.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  expect(buckets.message.some(t => /No SSCC at pallet level/.test(t))).toBe(false);

  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'consignment-summary-cps.edi'));
  await expect(page.locator('#quickOverview')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('No SSCC at pallet level');
});

// Real Supplier Alfa DESADV: two lines on one pallet, both EANs replaced by zeros
// in bol's output. The SSCC fallback can't tell two items on one pallet
// apart, so this used to add "Item ?" / "K:?" knock-on differences next to
// the real finding. Same-line-number pairing (unambiguous: same line
// numbers, same SSCC) now matches them; the zeroing itself is still flagged.
test('several zeroed EANs on one pallet are flagged once, without knock-on "Item ?" differences', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'zero-ean-shared-pallet.sup.edi'),
    path.join(FIX, 'zero-ean-shared-pallet.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  expect(buckets.diff.some(t => /EAN replaced by zeros in bol's output on 2 lines/.test(t))).toBe(true);
  expect(buckets.diff.some(t => /Item \?|K:\?|missing from the supplier message/.test(t))).toBe(false);
  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).not.toMatch(/QUANTITIES\s*Difference/i);
});

// Real Supplier Alfa DESADV: the supplier sent 12 Jan-style dates for DTM+11 and
// DTM+132, bol's output said 8 and 9 (Transus confirmed a wrong mapping).
// ECHO didn't compare these dates at all; now a Transformation difference.
test('a changed despatch date or expected delivery date is flagged as a transformation difference', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'date-shift.sup.edi'),
    path.join(FIX, 'date-shift.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  expect(buckets.diff.some(t => /Despatch date \(DTM\+11\) changed/.test(t))).toBe(true);
  expect(buckets.diff.some(t => /Expected delivery date \(DTM\+132\) changed/.test(t))).toBe(true);
});

test('identical dates on both sides are not flagged', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'date-shift.bol.edi'),
    path.join(FIX, 'date-shift.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#findings')).not.toContainText('date changed');
});

// Real Supplier Charlie DESADV: one <DespatchUnit> per article (117 units, 8
// SSCCs), mirrored by bol's output as one CPS per line. ECHO compared only
// the first group per SSCC and reported every pallet as a mapping
// difference. Same message: packing reference PKS100200 vs despatch advice
// number PKS100200A, a near-miss worth checking against the packing slip.
test('several groups sharing one SSCC are compared as one pallet, and a near-miss packing reference is flagged', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'repeated-sscc-units.sup.xml'),
    path.join(FIX, 'repeated-sscc-units.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  expect(buckets.diff.some(t => /Pallet mapping differs|pallet mapping difference/.test(t))).toBe(false);
  // Same values on both sides: reported once, about the supplier's message.
  const near = buckets.message.filter(t => /Packing reference almost matches the document number/.test(t));
  expect(near).toHaveLength(1);
  expect(near[0]).toContain('passed on unchanged');
  expect(near[0]).toContain('PKB1000A');

  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'repeated-sscc-units.sup.xml'));
  await expect(page.locator('#quickOverview')).toBeVisible();
  await expect(page.locator('body')).toContainText('Packing reference almost matches the document number');
});

// Findings stay short: explanation sits behind a collapsed "More info"
// toggle, and Copy for Transus sends only the headline.
test('long explanations sit behind a collapsed More info toggle and stay out of Copy for Transus', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'date-shift.sup.edi'),
    path.join(FIX, 'date-shift.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const more = page.locator('#findings details.f-more');
  expect(await more.count()).toBeGreaterThan(0);
  expect(await more.first().evaluate(e => e.open)).toBe(false);
  const transus = await page.evaluate(() => { setTransusLang('en'); return currentTransusText(); });
  expect(transus).toContain('Despatch date (DTM+11) changed');
  expect(transus).not.toContain('More info');
  expect(transus).not.toContain('Worth checking with Transus');
});

// Same Supplier Charlie shape: 5 units over 2 SSCCs. The SSCC stat counted
// every unit (5) instead of distinct SSCCs (2).
test('the SSCC count shows distinct SSCCs, not one per CPS group', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'repeated-sscc-units.sup.xml'),
    path.join(FIX, 'repeated-sscc-units.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const stat = await page.locator('.stat', { hasText: 'SSCCs' }).first().innerText();
  expect(stat).toMatch(/\b2\b/);
  await expect(page.locator('#results')).toContainText('5 groups, 2 SSCCs');
});

// GS1 check digit: a real Supplier Bravo SSCC had a wrong check digit and ECHO
// said nothing. One invalid EAN + one invalid SSCC; the valid EAN is not
// listed. Single-message observation, so Quick check too.
test('an EAN or SSCC with a wrong GS1 check digit is flagged, in Compare and Quick check', async ({ page }) => {
  const fx = path.join(FIX, 'gs1-check-digit.edi');
  await openApp(page);
  await runCompareFixtures(page, fx, fx);
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  const hits = buckets.message.filter(t => /Check digit doesn't match/.test(t));
  expect(hits).toHaveLength(2); // one per side
  expect(hits[0]).toContain('8700000000015');
  expect(hits[0]).toContain('387000000000000012');
  expect(hits[0]).not.toContain('8700000000025');

  await openApp(page);
  await runQuickFixture(page, fx);
  await expect(page.locator('#quickOverview')).toBeVisible();
  await expect(page.locator('body')).toContainText("Check digit doesn't match");
});

// A real supplier XML declares encoding="utf-16". Without a BOM, File.text()
// (UTF-8 only) left a NUL next to every character, so the file parsed as
// nothing and every bol line showed as "missing from the supplier message".
test('a UTF-16 XML DESADV without a BOM is decoded and compared normally', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'utf16-no-bom.sup.xml'),
    path.join(FIX, 'utf16-no-bom.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('Transus XML');
  expect(resultsText).toContain('2/2');
  expect(resultsText).not.toMatch(/missing from the supplier message/);
  expect(resultsText).not.toMatch(/only in the bol output/);
});

// Windows-1252 bytes (É, Ø, È) used to turn into U+FFFD replacement
// characters, because every file was decoded as UTF-8.
test('a windows-1252 XML DESADV keeps its accented characters in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'windows-1252.sup.xml'));
  await expect(page.locator('#quickOverview')).toBeVisible();
  const overviewText = await page.locator('#quickOverview').innerText();
  expect(overviewText).toContain('PLAID BOUCLÉ Ø40');
  expect(overviewText).toContain('KUSSEN CRÈME');
  expect(overviewText).not.toContain('�');
});

// Whitespace before "<?xml" is a hard DOMParser error, so a file starting
// with a blank line used to parse as nothing: every bol line "missing".
test('an XML DESADV starting with a blank line before <?xml is read normally', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'leading-whitespace.sup.xml'),
    path.join(FIX, 'leading-whitespace.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('2/2');
  expect(resultsText).not.toMatch(/missing from the supplier message/);
});

// Text before the declaration (e.g. a stray log line) is skipped so the
// contents can be shown, with a banner saying a strict reader would refuse it.
test('text before the XML declaration is skipped with a banner', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'text-before-declaration.sup.xml'));
  await expect(page.locator('#quickOverview')).toContainText('has text before its XML declaration');
  await expect(page.locator('#quickOverview')).toContainText('Resent by export job, attempt 2');
  await expect(page.locator('#quickOverview')).toContainText('TX100');
});

// The illegal-control-character recovery used to exist for INVOIC XML only;
// in a DESADV XML the same byte made the whole file parse as nothing.
test('an illegal control character in a DESADV XML is stripped with a banner, not read as an empty file', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'illegal-xml-char.sup.xml'),
    path.join(FIX, 'illegal-xml-char.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#factsBanners')).toContainText('illegal control character');
  await expect(page.locator('#factsBanners')).toContainText('0x16');
  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('2/2');
  expect(resultsText).not.toMatch(/missing from the supplier message/);
});

// Malformed XML used to produce an empty message and a wall of "missing"
// findings. Now the comparison stops with a banner naming the position.
test('a malformed XML DESADV shows a plain-language banner instead of an empty comparison', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'malformed.sup.xml'),
    path.join(FIX, 'malformed.bol.edi'),
  );
  const banner = page.locator('#compareBanner .xml-error-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("The supplier file couldn't be read as XML");
  await expect(banner).toContainText('line 2, column');
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#compareStatus')).toContainText('read as XML');

  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'malformed.sup.xml'));
  await expect(page.locator('#quickOverview .xml-error-banner')).toContainText("This file couldn't be read as XML");
});

// Header vs line in XML: a header-only <OrderNumberBuyer> wasn't inherited by
// the Articles (false "order numbers differ" on every line), an Article's own
// <DeliveryDate> stood in for the missing header date (false "Expected
// delivery date changed"), and a unit took its nested Article's LineNumber.
test('XML header fields are read from the header, and a header order number applies to every line', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'transusxml-header-scope.sup.xml'),
    path.join(FIX, 'transusxml-header-scope.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  expect(buckets.diff.some(t => /order numbers differ/.test(t))).toBe(false);
  expect(buckets.diff.some(t => /delivery date/i.test(t))).toBe(false);
  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('Loud and clear');
  expect(resultsText).toContain('CPS 900');
});

// Several <Message> elements in one <Messages> file used to be read as ONE
// message: all Articles pooled, the first header on top, and a reused
// DespatchUnitReference linking a later message's Article to the first
// message's unit. Now split and paired by document number, like multi-UNH.
test('a <Messages> file with several <Message> elements is split and paired by document number', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'transusxml-two-messages.sup.xml'),
    path.join(FIX, 'transusxml-two-messages.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('Loud and clear');
  expect(resultsText).toContain('1/1');
  await expect(page.locator('#factsNotes')).toContainText('contains 2 documents');
  await expect(page.locator('#factsNotes')).toContainText('MM200');
});

test('Quick check shows each <Message> of a multi-message XML separately, with a picker', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'transusxml-two-messages.sup.xml'));
  const picker = page.locator('#quickOverview .quick-doc-picker');
  await expect(picker).toContainText('2 separate messages');
  await expect(page.locator('#quickOverview')).toContainText('MM100');
  await expect(page.locator('#quickOverview')).not.toContainText('8700000000025');
  await picker.getByRole('button', { name: 'DESADV MM200' }).click();
  await expect(page.locator('#quickOverview')).toContainText('Showing message 2 of 2');
  await expect(page.locator('#quickOverview')).toContainText('8700000000025');
  await expect(page.locator('#quickOverview')).toContainText('387000000000000095');
  await expect(page.locator('#quickOverview')).not.toContainText('8700000000018');
});

// Parity for EDIFACT: a multi-UNH interchange was merged into one overview in
// Quick check (last message's number, every line pooled). Also covers the
// UNA-prefix bug that made each split message lose its type ("UUNH"), so
// Compare skipped every DESADV-specific check on multi-message files.
test('a multi-UNH EDIFACT DESADV keeps its type per message, in Quick check and Compare', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'two-messages.edi'));
  const picker = page.locator('#quickOverview .quick-doc-picker');
  await expect(picker).toContainText('2 separate messages');
  await expect(picker.getByRole('button', { name: 'DESADV MM100' })).toBeVisible();

  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'two-messages.edi'),
    path.join(FIX, 'transusxml-two-messages.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('.stat', { hasText: /^type/i }).first()).toContainText('DESADV');
  await expect(page.locator('#results')).toContainText('Loud and clear');
});

// Header fields table: supplier vs bol value per header field, with the
// field each came from. Opens by itself when something differs.
test('the header fields table shows each value with its source field, and opens on a difference', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'date-shift.sup.edi'), path.join(FIX, 'date-shift.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const det = page.locator('#hdrFields details.hdr-fields');
  expect(await det.evaluate(e => e.open)).toBe(true);
  await expect(det.locator('summary')).toContainText('2 differ');
  await expect(det.locator('tr.differ', { hasText: 'Despatch date' })).toContainText('DTM+11');

  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'repeated-sscc-units.sup.xml'), path.join(FIX, 'repeated-sscc-units.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const row = page.locator('#hdrFields tr', { hasText: 'Packing reference' });
  await expect(row).toContainText('PackingSlipNumber');
  await expect(row).toContainText('RFF+BM');
  expect(await page.locator('#hdrFields details.hdr-fields').evaluate(e => e.open)).toBe(false);
});

// Real Supplier Alfa DESADV: each article in its own sub-CPS under its pallet;
// bol's output listed both pallets first and every LIN after the last one,
// so pallet 1 came out empty and its article moved to pallet 2. Quantities
// still match, so only the per-SSCC comparison shows it.
test('an article moved to another pallet in bol\'s output is flagged as a pallet mapping difference', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'sub-cps-per-item.sup.edi'), path.join(FIX, 'sub-cps-per-item.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  expect(buckets.diff.some(t => /387000000000000019/.test(t) && /missing on the bol side/.test(t))).toBe(true);
  expect(buckets.diff.some(t => /387000000000000026/.test(t) && /missing on the supplier side/.test(t))).toBe(true);
  // Headline names the SSCC and the count; the per-item diffs sit in More info.
  const mapping = page.locator('#findings li', { hasText: /Pallet mapping differs for SSCC 387000000000000019/ });
  await expect(mapping).toContainText('(1 difference)');
  await expect(mapping.locator('details.f-more')).toContainText('missing on the bol side');
});

// Real Supplier Foxtrot DESADV: RFF+ON:310467 on two lines next to 9310467, delivery
// failed with "Purchase Order not found". Passed on unchanged, so Compare
// said nothing. Also: the header table compared supplier header orders
// against bol line orders and showed a false ≠.
test('an order number missing its leading digit is flagged once, and the header table compares all orders', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'order-number-missing-digit.sup.edi'), path.join(FIX, 'order-number-missing-digit.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  const hits = buckets.message.filter(t => /Order number looks incomplete/.test(t));
  expect(hits).toHaveLength(1);
  expect(hits[0]).toContain('passed on unchanged');
  expect(hits[0]).toContain('700001 → 9700001?');
  expect(hits[0]).not.toContain('9700002 →');
  await expect(page.locator('#hdrFields tr', { hasText: 'Order' })).not.toHaveClass(/differ/);

  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'order-number-missing-digit.sup.edi'));
  await expect(page.locator('#quickOverview')).toBeVisible();
  await expect(page.locator('body')).toContainText('Order number looks incomplete');
});

// The verdict used to ignore the finding category: a Message check at err
// level (here RFF+BM over 15 characters, the same on both sides) gave
// "Something got lost in translation" although the transformation was
// clean. And a DESADV with a real Transformation difference at warn level
// (the Supplier Alfa date shift) said "The transformation matches" — inverted.
test('the verdict is based on Transformation differences; Message checks alone get the calm verdict', async ({ page }) => {
  await openApp(page);
  const fixture = path.join(FIX, 'message-checks-only.edi');
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  expect(buckets.message.filter(t => /Packing List Reference too long/.test(t))).toHaveLength(2);
  expect(buckets.diff.some(t => /All compared values match/.test(t))).toBe(true);
  const verdict = page.locator('#verdict');
  await expect(verdict).toContainText('Almost in sync');
  await expect(verdict).toContainText('The transformation and pallet mappings match.');
  await expect(verdict).toContainText('see Message checks below');
  await expect(verdict).not.toContainText('lost in translation');
  await expect(page.locator('#findings li.findings-cat', { hasText: 'Message checks' }))
    .toHaveAttribute('title', /supplier's or bol's own message/);

  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'date-shift.sup.edi'), path.join(FIX, 'date-shift.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  await expect(verdict).toContainText('Almost in sync');
  await expect(verdict).toContainText('see Transformation differences below');
  await expect(verdict).not.toContainText('The transformation and pallet mappings match');
});

// "Copy report" marked every err-level finding "[ERROR]", including a
// supplier's own Message check. Marks are neutral now and name the section.
test('Copy report uses neutral marks per section, not [ERROR]', async ({ page }) => {
  await openApp(page);
  const fixture = path.join(FIX, 'message-checks-only.edi');
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#results')).toBeVisible();
  let report = await page.evaluate(() => lastReportText);
  expect(report).not.toContain('[ERROR]');
  expect(report).not.toContain('[WARNING]');
  expect(report).toMatch(/\[CHECK\] Supplier — Packing List Reference too long/);
  expect(report).toMatch(/\[OK\] All compared values match/);

  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'date-shift.sup.edi'), path.join(FIX, 'date-shift.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  report = await page.evaluate(() => lastReportText);
  expect(report).toMatch(/\[DIFFERENCE\] Despatch date \(DTM\+11\) changed/);
});

// "No packing reference" ignored RFF+BM (the leading source), so a message
// with only RFF+BM and an empty BGM number was told it had none.
// Terminology is "packing reference" throughout (docs/ui-conventions.md).
test('a message with only RFF+BM is not flagged as having no packing reference', async ({ page }) => {
  await openApp(page);
  const fixture = path.join(FIX, 'packing-ref-bm-only.edi');
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#findings')).not.toContainText('no packing reference');
  await expect(page.locator('.stat', { hasText: 'Packing reference' }).first()).toContainText('PKREF7401');
  await expect(page.locator('#hdrFields tr', { hasText: 'Packing reference' })).toContainText('PKREF7401');

  await openApp(page);
  await runQuickFixture(page, fixture);
  await expect(page.locator('#quickOverview')).toBeVisible();
  await expect(page.locator('#quickOverview')).not.toContainText(/no packing reference/i);

  // The near-miss finding: neutral headline with both values, advice in More info.
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'repeated-sscc-units.sup.xml'), path.join(FIX, 'repeated-sscc-units.bol.edi'));
  const near = page.locator('#findings li', { hasText: 'Packing reference almost matches the document number' });
  await expect(near).toContainText('PKB1000A');
  const visible = await near.evaluate(el => { const c = el.cloneNode(true); c.querySelectorAll('details').forEach(d => d.remove()); return c.textContent; });
  expect(visible).not.toContain('Check with the supplier');
  await expect(near.locator('details.f-more')).toContainText('Check with the supplier');
});

// checkPalletStructure emitted one "Pallet EAN repeated as item" finding per
// item and one "Item not linked to a pallet" finding per line. Both are now
// one grouped finding with tags; the weight-sum and "No SSCC" findings got
// a short headline + More info. Warn-level pills use "!", not "⚠".
test('pallet structure findings are grouped with tags, in Compare and Quick check', async ({ page }) => {
  await openApp(page);
  const fixture = path.join(FIX, 'pallet-structure-grouping.edi');
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  const repeated = buckets.message.filter(t => /Supplier — Pallet EAN repeated as item/.test(t));
  expect(repeated).toHaveLength(1);
  expect(repeated[0]).toContain('on 2 lines');
  expect(repeated[0]).toContain('CPS 2 · 8712345000134 (qty 1)');
  expect(repeated[0]).toContain('CPS 3 · 8712345000158 (qty 1)');
  const unlinked = buckets.message.filter(t => /Supplier — Item not linked to a pallet/.test(t));
  expect(unlinked).toHaveLength(1);
  expect(unlinked[0]).toContain('on 2 lines');
  expect(unlinked[0]).toContain('8712345000011');
  expect(unlinked[0]).toContain('8712345000028');
  const weight = page.locator('#findings li', { hasText: /Supplier — Shipment weight doesn't match the sum of its pallet weights/ });
  await expect(weight).toContainText('100 KGM vs 80 KGM');
  await expect(weight.locator('details.f-more')).toContainText('CPS 1');

  await openApp(page);
  await runQuickFixture(page, fixture);
  await expect(page.locator('#quickOverview')).toBeVisible();
  const ov = page.locator('#quickOverview');
  expect(await ov.locator('li', { hasText: 'Pallet EAN repeated as item' }).count()).toBe(1);
  expect(await ov.locator('li', { hasText: 'Item not linked to a pallet' }).count()).toBe(1);
  const html = await ov.innerHTML();
  expect(html).toContain('! Repeated pallet EAN');
  expect(html).not.toContain('⚠ Repeated pallet EAN');
});

// "N SSCC(s) only in …" listed every SSCC inline in one <code> run. They are
// clickable tags now, collapsed behind a toggle past ~20.
test('SSCCs only on one side are listed as tags, collapsed past 20', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'sscc-only-one-side.sup.edi'), path.join(FIX, 'sscc-only-one-side.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const sup = page.locator('#findings li', { hasText: '22 SSCCs only in the supplier message' });
  await expect(sup).toHaveCount(1);
  await expect(sup.locator('details > summary')).toContainText('Show 22 SSCCs');
  expect(await sup.locator('.wc-affected li').count()).toBe(22);
  await expect(sup.locator('.wc-affected')).toContainText('008712345000001003');
  await expect(page.locator('#findings li', { hasText: '22 SSCCs only in the bol output' })).toHaveCount(1);
});

// Pallet overview (real Supplier Delta / Supplier Bravo / Supplier Alfa DESADVs): an empty
// CPS group read "1 item" and "Match" although the other side had items for
// that SSCC; a line with a zeroed EAN showed as "No items"; and "(1 → 2)"
// put a per-line quantity next to the other side's SSCC total.
test('pallet overview: empty group vs items on the other side is a Difference, zeroed EAN labelled, totals on both sides', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'pallet-overview-empty-and-zeroed.sup.edi'), path.join(FIX, 'pallet-overview-empty-and-zeroed.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  await page.locator('#palletFilterToggle').uncheck();
  const blocks = page.locator('#ssccBody .pallet-block');
  const supA = blocks.nth(0).locator('details.pallet-det', { hasText: '008712345000000013' });
  await expect(supA.locator('summary')).toContainText('2 items');
  const bolA = blocks.nth(1).locator('details.pallet-det', { hasText: '008712345000000013' });
  await expect(bolA).toHaveAttribute('data-status', 'diff');
  await expect(bolA.locator('summary')).toContainText('0 items');
  await expect(bolA.locator('summary')).toContainText('Difference');
  expect(await bolA.innerHTML()).toContain('no items here; 2 on the other side');
  const bolB = blocks.nth(1).locator('details.pallet-det', { hasText: '008712345000000020' });
  expect(await bolB.innerHTML()).toContain('EAN zeroed');
  expect(await bolB.innerHTML()).not.toContain('No items');
  // Both numbers are the item's SSCC total on each side: 3 → 3, never 2 → 3.
  const supAHtml = await supA.innerHTML();
  expect(supAHtml).not.toMatch(/\(2 → /);
  expect(supAHtml).not.toMatch(/\(1 → /);
  expect(supAHtml).toContain('(3 → —)');

  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'pallet-overview-empty-and-zeroed.bol.edi'));
  await expect(page.locator('#quickOverview')).toBeVisible();
  const q = await page.locator('#quickOverview').innerHTML();
  expect(q).toContain('EAN zeroed');
  expect(q).toContain('0 items');
});

// Real Supplier Delta DESADV: bol's line n carried the supplier's order number
// of line n-1, reported as many unrelated per-item "order numbers differ"
// warnings (status "Check"). Now one grouped shift finding; an unrelated
// order-number mismatch is still its own finding, at Difference level.
test('order numbers shifted one line down in bol\'s output are one grouped finding; an order mismatch is a Difference', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'order-shift.sup.edi'), path.join(FIX, 'order-shift.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const buckets = await findingsByCategory(page);
  const shift = buckets.diff.filter(t => /Order numbers shifted one line down in bol's output/.test(t));
  expect(shift).toHaveLength(1);
  expect(shift[0]).toContain('on 4 lines');
  expect(shift[0]).toContain('line 2 · 8712345000028: 9100002 → 9100001');
  expect(shift[0]).toContain('line 5 · 8712345000059: 9100005 → 9100004');
  const perItem = buckets.diff.filter(t => /order numbers differ/.test(t));
  expect(perItem).toHaveLength(1);
  expect(perItem[0]).toContain('8712345000066');
  expect(await page.locator('#findings li.f-err', { hasText: 'order numbers differ' }).count()).toBe(1);
  const statuses = await page.evaluate(() => lastLineRows.rows.filter(r => r.orderDiff).map(r => r.status));
  expect(statuses.length).toBe(5);
  statuses.forEach(s => expect(s).toBe('diff'));
});

// Real Supplier Golf DESADV: 20-character SSCCs starting "00". The finding now says
// when the value is "00" + a check-digit-valid SSCC-18, or a 17-digit value
// that is valid with a leading 0.
test('the SSCC length finding says when a value is "00" + a valid SSCC or valid with a leading 0', async ({ page }) => {
  await openApp(page);
  const fixture = path.join(FIX, 'sscc-length-hints.edi');
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#results')).toBeVisible();
  const f = page.locator('#findings li', { hasText: "Supplier — SSCC isn't 18 characters" });
  await expect(f).toContainText('00008712345000000013 (20 chars: "00" + a valid 18-digit SSCC)');
  await expect(f).toContainText('08712345000000020 (17 chars: valid as an SSCC with a leading 0)');

  await openApp(page);
  await runQuickFixture(page, fixture);
  await expect(page.locator('#quickOverview')).toContainText('"00" + a valid 18-digit SSCC');
});

// The header table's "Packing reference" row showed "—" for a supplier with
// only an RFF+DQ despatch note reference; it falls back to it now, with the
// source labelled.
test('the header table packing reference falls back to RFF+DQ, labelled as such', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(page, path.join(FIX, 'packing-ref-dq-only.sup.edi'), path.join(FIX, 'packing-ref-dq-only.bol.edi'));
  await expect(page.locator('#results')).toBeVisible();
  const row = page.locator('#hdrFields tr', { hasText: 'Packing reference' });
  const supCell = row.locator('td').nth(1);
  await expect(supCell).toContainText('PS8401');
  await expect(supCell).toContainText('RFF+DQ');
  await expect(row.locator('td').nth(2)).toContainText('RFF+BM');
  await expect(row).not.toHaveClass(/differ/);
});
