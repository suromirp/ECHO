const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, runCompareFixtures, runQuickFixture } = require('../helpers');

const FIX = path.join(__dirname, '..', 'fixtures', 'ordrsp');

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

// docs/testing.md: "ORDRSP: action-6-without-backorder findings grouped into
// one block, not repeated per line."
test('action-6-without-backorder findings are grouped, not repeated per line', async ({ page }) => {
  await openApp(page);
  const fixture = path.join(FIX, 'action6-no-backorder.edi');
  await runCompareFixtures(page, fixture, fixture);

  await expect(page.locator('#results')).toBeVisible();

  const findings = page.locator('#findings li');
  const texts = await findings.allInnerTexts();
  const groupedLines = texts.filter(t => t.includes('delivery-date-only amendment'));

  // One grouped block per side (Supplier, Bol) — never one per affected line
  // (there are 3 lines per side, so a per-line implementation would produce 6).
  // Each <li> renders an icon in its own leading span (e.g. "!\nSupplier — ..."),
  // so match on "Supplier —"/"Bol —" rather than a literal startsWith.
  expect(groupedLines).toHaveLength(2);
  expect(groupedLines.some(t => t.includes('Supplier —'))).toBe(true);
  expect(groupedLines.some(t => t.includes('Bol —'))).toBe(true);
  groupedLines.forEach(t => expect(t).toContain('(3 lines)'));

  // The grouped block lists every affected line as its own clickable tag.
  const tagCount = await page.locator('#findings .wc-affected li').count();
  expect(tagCount).toBe(6); // 3 lines x 2 sides
});

// docs/testing.md: "ORDRSP: an item split across two lines with different
// actions can carry a net price (PRI+AAA) on one line and not the other —
// aggregating purely by EAN would hide exactly this, since one bucket's
// price would mask the other's gap."
test('a net price missing on only one of two split-action lines for the same item is flagged, not lost by EAN-level aggregation', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'split-item-price-gap.sup.edi'),
    path.join(FIX, 'split-item-price-gap.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const buckets = await findingsByCategory(page);

  // The core bug: missing on bol, present on supplier — a Transformation
  // difference (reaches "Copy for Transus"), grouped into one block.
  const missing = buckets.diff.filter(t => /Net price is missing/i.test(t));
  expect(missing).toHaveLength(1);
  expect(missing[0]).toContain('missing on the bol side for 1 line');
  expect(missing[0]).toContain('present on the supplier side');
  expect(missing[0]).toContain('1111111111111');

  // A plain price mismatch (present both sides, different value) is a
  // separate finding, phrased as "differs" — not merged into the
  // "missing" wording above.
  const differs = buckets.diff.filter(t => /net price differs/i.test(t));
  expect(differs).toHaveLength(1);
  expect(differs[0]).toContain('3333333333333');
  expect(differs[0]).toContain('5.00');
  expect(differs[0]).toContain('6.00');

  // Nothing at all about the unrelated, non-split cancelled item
  // (2222222222222 matches on both sides).
  expect([...buckets.diff, ...buckets.message].some(t => t.includes('2222222222222'))).toBe(false);

  // Never (also) shows up as a Message check — it's a mapping question, not
  // a property of one message on its own.
  expect(buckets.message.some(t => /Net price is missing/i.test(t))).toBe(false);

  // Separate, standalone single-message observation (parity rule): bol's
  // own message shows the same item split across two actions with a price
  // on only one of them — supplier's own message doesn't have this issue.
  const splitNotice = buckets.message.filter(t => /appears on 2 lines in this message/i.test(t));
  expect(splitNotice).toHaveLength(1);
  expect(splitNotice[0]).toContain('Bol —');
  expect(splitNotice.some(t => t.includes('Supplier —'))).toBe(false);
});

// Same message, read standalone — the split-item price gap is visible
// without a second message to compare against (CLAUDE.md's parity rule).
test('the split-item price gap is also flagged standalone in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'split-item-price-gap.bol.edi'));
  await expect(page.locator('#quickOverview')).toContainText('appears on 2 lines in this message');
});

// docs/formats-and-quirks.md: a DTM qualifier (67, 69) repeated within one
// LIN group with different dates can cause a downstream EDI processor to
// silently drop other line fields (the price, in the confirmed real case)
// instead of raising a clear error.
test('a DTM qualifier repeated with different dates within one line is flagged as a Message check, not sent to Transus', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'dtm-duplicate-qualifier.sup.edi'),
    path.join(FIX, 'dtm-duplicate-qualifier.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const buckets = await findingsByCategory(page);

  const dtm67 = buckets.message.filter(t => /DTM\+67 appears more than once/i.test(t));
  const dtm69 = buckets.message.filter(t => /DTM\+69 appears more than once/i.test(t));
  expect(dtm67).toHaveLength(1);
  expect(dtm69).toHaveLength(1);
  expect(dtm67[0]).toContain('Supplier —');
  expect(dtm67[0]).toContain('20260908');
  expect(dtm67[0]).toContain('20260916');
  expect(dtm69[0]).toContain('Supplier —');

  // Bol's own output only ever carries a single DTM+67 for this line — the
  // duplication is a supplier-side message-generation defect, not
  // something bol's transformation introduced.
  expect(dtm67.some(t => t.includes('Bol —'))).toBe(false);
  expect(dtm69.some(t => t.includes('Bol —'))).toBe(false);

  // Never a Transformation difference: it's a property of the supplier's
  // own message, meant to be reported back to the supplier, not copied to
  // Transus.
  expect(buckets.diff.some(t => /DTM\+/i.test(t))).toBe(false);

  // The confirmed real-world consequence also surfaces independently, via
  // the existing price comparison: bol's output dropped the price on
  // exactly this line.
  const priceMissing = buckets.diff.filter(t => /Net price is missing/i.test(t));
  expect(priceMissing).toHaveLength(1);

  // No finding at all about the unrelated, unaffected control line.
  expect([...buckets.diff, ...buckets.message].some(t => t.includes('2222222222222'))).toBe(false);
});

// Same message, read standalone (CLAUDE.md's parity rule).
test('the DTM duplicate-qualifier finding is also flagged standalone in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'dtm-duplicate-qualifier.sup.edi'));
  await expect(page.locator('#quickOverview')).toContainText('DTM+67 appears more than once');
  await expect(page.locator('#quickOverview')).toContainText('DTM+69 appears more than once');
});

// docs/formats-and-quirks.md: this TRANSUSXML ORDRSP dialect's <Article>
// element carries CancelledQuantity and RejectedQuantity as two distinct
// fields, not interchangeable dialect variants of the same concept — a
// real message had RejectedQuantity present as a literal "0" (masking the
// real CancelledQuantity value under a plain `||` fallback) and no branch
// deriving action 6 from a cancelled quantity alone, plus ArticleNetPrice
// wasn't read into netPrice at all. All three together made a message
// bol/Transus mapped correctly look like it had multiple mapping problems.
test('a cancelled quantity, its action-6 derivation, and its net price are all read correctly for this TRANSUSXML ORDRSP dialect', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'transusxml-cancelled-quantity.sup.xml'),
    path.join(FIX, 'transusxml-cancelled-quantity.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const qtyStat = page.locator('.stat', { hasText: 'Quantities' }).first();
  await expect(qtyStat).toContainText('Match');
  const actionStat = page.locator('.stat', { hasText: 'Actions' }).first();
  await expect(actionStat).toContainText('Match');

  const buckets = await findingsByCategory(page);
  const allText = [...buckets.message, ...buckets.diff, ...buckets.info].join(' | ');
  expect(allText).not.toMatch(/nothing is backordered/i);
  expect(allText).not.toMatch(/net price is missing/i);
  expect(allText).not.toMatch(/action codes differ/i);
});

// docs/formats-and-quirks.md: a message where NONE of its accepted lines
// carry a net price is a confirmed real cause of a "Unit price is
// unknown" delivery failure — but quantities and actions matching
// perfectly on both sides meant ECHO read this as a clean "Loud and
// clear" match before this check existed, with nothing about the missing
// price surfaced anywhere.
test('a message with no net price on any accepted line is flagged, not read as a clean match', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'no-price-anywhere.sup.edi'),
    path.join(FIX, 'no-price-anywhere.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const buckets = await findingsByCategory(page);
  const supFinding = buckets.message.filter(t => /none of the 3 accepted lines/i.test(t) && t.includes('Supplier —'));
  const bolFinding = buckets.message.filter(t => /none of the 3 accepted lines/i.test(t) && t.includes('Bol —'));
  expect(supFinding).toHaveLength(1);
  expect(bolFinding).toHaveLength(1);
  expect(supFinding[0]).toContain('Unit price is unknown');

  // Never a mapping question — it's a property of the message itself, not
  // something to send to Transus.
  expect(buckets.diff.some(t => /net price/i.test(t))).toBe(false);
});

// Same message, read standalone in Quick check (CLAUDE.md's parity rule).
test('the no-price-anywhere finding is also flagged standalone in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'no-price-anywhere.sup.edi'));
  await expect(page.locator('#quickOverview')).toContainText('none of the 3 accepted lines');
});

// docs/ui-conventions.md: large lists collapse past a threshold, with a way
// to still see everything — Amendment details previously rendered every
// backorder/amendment line unconditionally and grew as long as the full
// Lines table on a message with many of them. Also covers the search box
// (moved down to sit just above the tables it filters, not at the very
// top of the results) now also filtering Amendment details, overriding
// its collapsed state for a match — same "search wins" rule as the pallet
// overview and line table already follow.
test('Amendment details collapses past 5 lines behind a "Show all" button, and the search box also filters it, overriding the collapse', async ({ page }) => {
  const fixture = path.join(FIX, 'amendment-details-collapse.edi');
  await openApp(page);
  await runQuickFixture(page, fixture);
  await expect(page.locator('#quickOverview')).toContainText('Amendment details (8)');

  // Search sits after the Actions grid, above Amendment details/Lines —
  // not at the very top of the Quick check output.
  const overviewHtml = await page.locator('#quickOverview').innerHTML();
  const actionsIdx = overviewHtml.indexOf('amx-grid');
  const searchIdx = overviewHtml.indexOf('id="quickSearchPanel"');
  const amendIdx = overviewHtml.indexOf('Amendment details');
  expect(actionsIdx).toBeGreaterThan(-1);
  expect(searchIdx).toBeGreaterThan(actionsIdx);
  expect(amendIdx).toBeGreaterThan(searchIdx);

  const rows = page.locator('#quickAmendTable tr[data-search]');
  const visibleRows = page.locator('#quickAmendTable tr[data-search]:not(.hidden)');
  await expect(rows).toHaveCount(8);
  await expect(visibleRows).toHaveCount(5);

  const btn = page.locator('#quickAmendTableBtn');
  await expect(btn).toHaveText('Show all 8 amendment lines');
  await btn.click();
  await expect(visibleRows).toHaveCount(8);
  await expect(btn).toHaveText('Show fewer');
  await btn.click();
  await expect(visibleRows).toHaveCount(5);

  // A search match past the collapsed 5 is still found.
  await page.locator('#quickSearchInput').fill('ART008');
  await expect(visibleRows).toHaveCount(1);
  await expect(page.locator('#quickAmendTableNote')).toContainText('Showing 1 of 8 amendment lines matching "ART008"');

  await page.locator('#quickSearchInput').fill('');
  await expect(visibleRows).toHaveCount(5);
});

// Same fixture, Compare mode — the search box moved from the very top of
// #results to just above the panels it filters (Amendment details, Line
// comparison, pallet overview), and Amendment details there gets the same
// collapse-plus-search treatment as Quick check.
test('Amendment details collapses and is searchable in Compare too, with the search box positioned above it', async ({ page }) => {
  const fixture = path.join(FIX, 'amendment-details-collapse.edi');
  await openApp(page);
  await runCompareFixtures(page, fixture, fixture);
  await expect(page.locator('#results')).toBeVisible();

  const resultsHtml = await page.locator('#results').innerHTML();
  const toggleIdx = resultsHtml.indexOf('id="togglePanel"');
  const searchIdx = resultsHtml.indexOf('id="searchPanel"');
  const backorderIdx = resultsHtml.indexOf('id="backorderPanel"');
  expect(toggleIdx).toBeGreaterThan(-1);
  expect(searchIdx).toBeGreaterThan(toggleIdx);
  expect(backorderIdx).toBeGreaterThan(searchIdx);

  const rows = page.locator('#compareAmendTable tr[data-search]');
  const visibleRows = page.locator('#compareAmendTable tr[data-search]:not(.hidden)');
  await expect(rows).toHaveCount(8);
  await expect(visibleRows).toHaveCount(5);

  await page.locator('#resultSearchInput').fill('ART008');
  await expect(visibleRows).toHaveCount(1);

  await page.locator('#resultSearchInput').fill('');
  await expect(visibleRows).toHaveCount(5);
});

// docs/formats-and-quirks.md: one broken line (e.g. the duplicate-DTM case
// above, closing its own line early before the price is set) can shift
// every line after it in bol's output — each one ends up with the price
// that belonged to the line before it, all the way to the end of the
// message, with the very last line losing its own price entirely.
// Confirmed against a real 11-line cascade traced back to exactly one
// earlier broken line. Detected as one grouped finding (a run of ≥3
// consecutive shifted lines) instead of N independent "price differs"
// findings, the same grouping shape as groupUniformArithmeticGap for
// INVOIC.
test('a run of consecutive lines each showing the previous line\'s price is flagged as one shift, not N independent price differences', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'cascading-price-shift.sup.edi'),
    path.join(FIX, 'cascading-price-shift.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const buckets = await findingsByCategory(page);

  // The origin line (its own price genuinely missing on bol) is still its
  // own separate, existing finding — the cascade is about what happens
  // to every line AFTER it, not the origin itself.
  const missing = buckets.diff.filter(t => /Net price is missing/i.test(t));
  expect(missing).toHaveLength(1);
  expect(missing[0]).toContain('2222222222222');

  const cascade = buckets.diff.filter(t => /consecutive lines each show/i.test(t));
  expect(cascade).toHaveLength(1);
  expect(cascade[0]).toContain('3 consecutive lines');
  expect(cascade[0]).toContain('3333333333333');
  expect(cascade[0]).toContain('4444444444444');
  expect(cascade[0]).toContain('5555555555555');
  // The last line in the run loses its own price outright — called out
  // by name and value, since that's the most consequential part.
  expect(cascade[0]).toContain('5555555555555) loses its own price');
  expect(cascade[0]).toContain('40.00');

  // The fixture's origin line (2222222222222) also has a duplicate DTM+67
  // — a confirmed real trigger for this exact shift (per a real Transus
  // support ticket) — so the cascade finding should name that connection
  // explicitly instead of leaving the reader to notice it themselves.
  expect(cascade[0]).toContain('This starts right after');
  expect(cascade[0]).toContain('right after 2222222222222');
  expect(cascade[0]).toContain('duplicate DTM qualifier');

  // None of the three shifted lines also appear as an ordinary
  // "net price differs" finding — they're covered once, by the cascade
  // finding, not twice.
  const individual = buckets.diff.filter(t => /net price differs/i.test(t));
  expect(individual).toHaveLength(0);

  // Reaches "Copy for Transus" — this is exactly the kind of thing worth
  // reporting to Transus as a mapping question, not a supplier-message
  // quirk.
  expect(buckets.message.some(t => /consecutive lines each show/i.test(t))).toBe(false);
});

// Same quoted-CSV family as the DESADV dialect in desadv.spec.js, but the
// ORDRSP variant — confirmed against a real Stichd order confirmation.
// Before this was recognized, ECHO routed every "ENV"-prefixed file to the
// DESADV parser regardless of actual type: the type badge showed "DESADV",
// every action code read as "(none)", and the EAN column showed the
// literal string "EAN" instead of the GTIN. Routed correctly now by the
// HDR record's own document-type field (231 vs 351, mirroring EDIFACT's
// own BGM codes for ORDRSP vs DESADV).
test('a flat quoted-CSV ORDRSP dialect is read, not routed to the DESADV parser', async ({ page }) => {
  await openApp(page);
  await runCompareFixtures(
    page,
    path.join(FIX, 'csv-dialect.sup.ORD'),
    path.join(FIX, 'csv-dialect.bol.edi'),
  );
  await expect(page.locator('#results')).toBeVisible();

  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('TYPE\nORDRSP');
  expect(resultsText).toContain('Stichd CSV');
  expect(resultsText).toContain('3/3'); // supplier / bol lines — all read
  expect(resultsText).not.toContain('(none)');
  expect(resultsText).toContain('4000000000011'); // the real GTIN, not the literal "EAN" qualifier string

  // The real example this is based on showed every supplier line sent as
  // action 6 (date-only amendment), remapped to action 5 in bol's own
  // output — a genuine, expected action-code difference, correctly
  // explained by the date-only Message check rather than read as an error.
  const buckets = await findingsByCategory(page);
  expect(buckets.message.some(t => /delivery-date-only amendment/.test(t))).toBe(true);
});

// Same fixture, Quick check on the supplier file alone — detectMsgType must
// also route this dialect to ORDRSP, not DESADV, or Quick check shows the
// wrong business overview entirely (or none at all).
test('the CSV ORDRSP dialect is also recognized in Quick check', async ({ page }) => {
  await openApp(page);
  await runQuickFixture(page, path.join(FIX, 'csv-dialect.sup.ORD'));
  await expect(page.locator('#quickOverview')).toBeVisible();

  const overviewText = await page.locator('#quickOverview').innerText();
  expect(overviewText).toContain('ORDRSP');
  expect(overviewText).toContain('9000002'); // order number read from the CSV
});
