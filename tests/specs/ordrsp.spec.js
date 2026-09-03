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
  const groupedLines = texts.filter(t => t.includes('nothing is backordered'));

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
  // own message, and Transus already knows about it — this is meant to be
  // reported back to the supplier, not copied to Transus.
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
