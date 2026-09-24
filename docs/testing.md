# Testing methodology

Non-negotiable, no exceptions:

1. **Never** conclude a fix works from theory. Test against the actual
   uploaded production message (or a synthetic file built to reproduce its
   exact structure) every time.
2. Keep a running regression suite and re-run **all** of it after every
   change, not just the scenario just touched.
3. Use a headless browser (Playwright) to functionally test the actual
   tool — open the file, set both sides, click Compare / run Quick check,
   read the rendered result — not just code review.
4. `node --check` on the extracted `<script>` block after every edit,
   before functional testing.
5. When a test's own assertion fails, check whether the assertion is
   stale before assuming the application regressed. This happened
   several times: a test asserting old wording after a deliberate
   rewrite, a case-sensitivity mismatch against CSS-transformed
   (uppercased) text, an incomplete synthetic fixture missing a field the
   check actually needed.
6. Reading rendered text back with `.innerText` can silently miss content
   that's present in the DOM but not laid out the way Playwright expects
   — if a check "isn't showing up" in a test but you're confident the code
   path runs, check `.innerHTML` before assuming the feature is broken.

## Suggested harness

A `/tests` folder with Playwright, loading the built `index.html` directly
via `file://`, is enough — no dev server needed, matching the product's
own zero-dependency philosophy. Keep fixture files (the synthetic
EDIFACT/XML snippets below) as actual files in the repo, not inlined in
the test script, so they're easy to extend and diff.

## Regression scenarios worth a permanent fixture

Each of these caught a real, otherwise-invisible bug. Recreate them as
actual test fixtures, don't just keep this list as prose:

- **ORDRSP**: action-6-without-backorder findings grouped into one block,
  not repeated per line.
- **ORDRSP**: a message where none of its accepted lines carry a net price
  anywhere is flagged (both Quick check and per-side in Compare), rather
  than read as a clean match just because quantities and actions agree.
- **ORDRSP**: a net price (`PRI+AAA`) missing on only one of two lines for
  the same item split across different actions is flagged as a
  Transformation difference (never lost by aggregating purely per EAN),
  plus a standalone single-message observation in both Quick check and
  Compare.
- **ORDRSP** (and **DESADV**, same shared parser): a `DTM` qualifier
  (e.g. `67`, `69`) repeated within one `LIN` group with different dates
  is flagged as a Message check (never sent to Transus). Grouped by
  qualifier code; runs standalone in Quick check and per side in Compare
  for both message types.
- **ORDRSP (TRANSUSXML `<Article>` dialect)**: a cancelled quantity
  (`CancelledQuantity`, distinct from `RejectedQuantity` even when the
  latter is present as a literal `"0"`) is read correctly, correctly
  derives action 6 when paired with a delivered quantity and no
  backorder, doesn't trip the "action 6 without backorder" Message check,
  and `ArticleNetPrice` is read into the net-price comparison.
- **DESADV**: GTIN-12/13 leading-zero padding normalized across sides.
- **DESADV**: bol's GTIN blanked entirely, falls back to article code.
- **DESADV**: bol's GTIN blanked *and* no article code anywhere — resolved
  via single-item-per-pallet SSCC pairing, not left as "missing".
- **DESADV**: pallet-weight sum vs. shipment-total mismatch detected.
- **DESADV**: blank `LIN'` segments detected and excluded from the line
  count.
- **DESADV**: `RFF+BM` (bill of lading number), when present, is shown as
  the "Packing reference" instead of the BGM document number — leading
  source, not a second field — in both Quick check and Compare.
- **DESADV**: many pallets missing an SSCC are grouped into one finding per
  side with a collapsed tag list, not one finding per pallet.
- **DESADV**: a nested `CPS` group that carries its own SSCC is marked as
  "nested under" its parent pallet's SSCC, not shown as an independent
  pallet; a pallet overview past ~20 entries in Quick check defaults to
  "Only show flagged" with a toggle to see everything.
- **ORDRSP/DESADV**: a single search box, positioned just above the tables
  it filters (not at the very top of the results), filters Amendment
  details, the line table, and the pallet/SSCC overview together, live, by
  EAN, order number, SSCC or article code, in both Compare and Quick check
  — and a search match overrides the "only show differences"/"only show
  flagged" filter and Amendment details' collapsed state, rather than
  being hidden by either.
- **ORDRSP/DESADV**: Amendment details (backorder/amendment lines)
  collapses past 5 rows behind a "Show all N amendment lines" button, in
  both Compare and Quick check.
- **DESADV**: a pallet `CPS` group that wraps nested package `CPS` groups
  (instead of carrying items directly) but has no SSCC of its own is
  flagged, even though the packages nested inside it each carry their own
  — bol's system never reads an SSCC below pallet level, so this pallet
  has no usable SSCC at all. A bare shipment-root `CPS` (no `PAC`/`GIN`,
  just grouping several independent pallets) is never itself flagged for
  this, even when real pallets are nested under it.
- **ORDRSP/DESADV**: the "Distinct items" stat is labeled and explained via
  tooltip, not a bare "Items" count that reads as a total-units figure.
- **INVOIC**: multiple VAT-rate groups summed correctly for the taxable
  total (both the TRANSUSXML-style and bol's-own-UBL-style aggregation).
- **INVOIC**: TAX segment missing rate detected and grouped.
- **INVOIC**: qty×price vs. line-amount gap flagged only outside a
  rounding tolerance, and never sent to Transus.
- **INVOIC**: a uniform percentage gap shared by several/most lines is
  grouped into one finding, not repeated once per line — while a
  genuinely different, one-off gap stays its own individual finding.
- **INVOIC**: line-level allowance correctly shown as "not forwarded
  (expected)", not as a difference.
- **INVOIC**: a UBL line-amount gap that exactly matches a charge is
  treated as a match, not a difference.
- **INVOIC**: a VAT-rate position mismatch between line-level and
  summary-level TAX segments is flagged (in both Quick check and Compare),
  and never sent to Transus.
- **INVOIC**: the VAT number is shown per party in the top-level "Invoice
  details" table, not just buried in the detail panel.
- **INVOIC**: a line-level charge (e.g. `RAD`) matches across sides despite
  a GTIN-12/13 leading-zero difference on that line, instead of showing up
  as two contradictory findings ("only on the supplier" and "only on bol"
  at once).
- **INVOIC**: an illegal XML control character (e.g. `0x16`) in an `IMD`
  item description is flagged as a Message check on the supplier side
  (both Quick check and Compare), and when it's already inside an XML
  file (e.g. bol's own generated invoice), ECHO strips it and shows a
  loud banner explaining why delivery genuinely failed rather than
  silently showing an empty result.
- **ORDERS**: readable in Quick check; still declined in Compare.
- A ZIP with only one usable file switches to Quick check with a clear,
  readable (not instant/jarring) explanation, rather than failing.

When a new bug is found and fixed, add its scenario to this list and to
the actual test suite in the same commit as the fix.
