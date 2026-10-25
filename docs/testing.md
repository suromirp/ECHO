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
  not repeated per line, and described neutrally as a recognized
  delivery-date-only amendment rather than a suspected mistake.
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
- **ORDRSP**: a run of ≥3 consecutive lines where bol's net price for
  line *i* exactly matches the supplier's own price for line *i−1* is
  flagged as one grouped "price shift" finding, not N independent
  "net price differs" findings — the last line in the run explicitly
  called out as having lost its own price entirely. Compare-only (needs
  both sides). When the line right before the run also tripped the
  duplicate-`DTM`-qualifier Message check, the finding names that line as
  the likely trigger instead of leaving the two findings unlinked.
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
- **DESADV**: a Packing List Reference (`RFF+BM`) over 15 characters is
  flagged, per side, in both Quick check and Compare — never sent to
  Transus.
- **DESADV**: a CPS group with an SSCC but no `PAC` segment is flagged as a
  confirmed (per Transus support) cause of the SSCC not reaching bol, in
  both Quick check and per-side in Compare. A 20-character SSCC (an
  Application Identifier prefix bol's docs say not to send) is flagged too,
  separately, at info level.
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
- **DESADV**: a supplier's flat, quoted-CSV DESADV dialect (`"ENV"`,
  `"HDR"`, `"PAC"`, `"LIN"`, `"CNT"` records, no EDIFACT segment syntax at
  all) is read correctly — items, quantities, order number and pallets
  with their SSCCs — rather than silently producing zero supplier lines
  and showing every item as "missing," in both Compare and Quick check.
- **ORDRSP**: the same supplier's CSV dialect, ORDRSP variant, is routed to
  its own parser (not the DESADV one) based on the `HDR` record's own
  document-type field, in both Compare and Quick check — rather than
  reading every action code as "(none)" and every item as the literal
  string "EAN".
- **DESADV (TRANSUSXML `<Messages>` dialect)**: a file with no `<?xml`
  declaration is routed to the XML parser, not the EDIFACT one. Lines,
  SSCCs and the `<DespatchUnitReference>` box link are read, no false
  "no PAC segment" finding appears, and bol's order numbers shifted by one
  line show up as per-item order-number differences. Covered in both Compare
  and Quick check.
- **ORDRSP/DESADV**: an all-zeros EAN is flagged. In Compare it is a
  Transformation difference when only bol's output is zeroed, and that
  line isn't repeated as a Bol message check. In Quick check it is a
  standalone Message check. Several zeroed lines on one pallet are paired
  by line number, so there is no knock-on "Item ?" difference.
- **DESADV**: a changed despatch date (`DTM+11`) or expected delivery date
  (`DTM+132`) between supplier and bol is a Transformation difference.
  Identical dates are never flagged. This check is Compare-only.
- **DESADV**: several CPS groups / XML units sharing one SSCC are compared as
  one pallet (no false "Pallet mapping differs"). A packing reference that
  almost matches the despatch advice number (only a suffix of up to 3 characters differs, or only the case)
  is a Message check in both modes.
- **ORDRSP/DESADV/INVOIC**: an EAN/GTIN (8/12/13/14 digits) or SSCC (18
  digits) whose GS1 check digit doesn't match is a Message check, per side,
  in both modes. Synthetic fixtures must use valid check digits, or this
  check adds findings that unrelated tests then count.
- **DESADV**: the SSCC stat and overview count distinct SSCCs, not CPS
  groups ("117 groups, 8 SSCCs").
- **ORDRSP/DESADV**: the "Header fields" table in Compare shows supplier vs
  bol per header field, with the source field (RFF+BM, PackingSlipNumber,
  DTM+11, …). It opens by itself when a shared field differs.
- **UI**: long explanations sit behind a collapsed "More info" toggle, and
  "Copy for Transus" contains only the headline.
- **ORDRSP/DESADV**: an order number that is another order number in the
  same message minus 1-2 leading characters is a Message check in both
  modes, reported once if bol's output carries the same. The header table
  doesn't show a false ≠ for header-only vs line-only orders.
- **DESADV**: an article placed on another pallet in bol's output (supplier
  sub-CPS per article, bol lists every LIN after the last pallet) is flagged
  per SSCC as a pallet mapping difference.
- **DESADV**: a top-level consignment `CPS` with a summary `PAC` (followed
  by pallets that each carry an SSCC) is never flagged as "No SSCC at
  pallet level", in either mode.
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
- **INVOIC**: when bol's own `LegalMonetaryTotal/LineExtensionAmount` is
  stuck at 0 but every `InvoiceLine`'s own line amount is correctly
  populated, the parser falls back to summing the lines instead of
  reporting a false "Total line amounts differs" against a header field
  bol's own downstream system doesn't rely on either.
- **DESADV (TRANSUSXML)**: header and line fields are told apart by position:
  a header-only `<OrderNumberBuyer>` applies to every Article (no false
  "order numbers differ"), an Article's own `<DeliveryDate>` never stands in
  for the header date, and a unit keeps its own `<LineNumber>` even when its
  nested Article comes first.
- **DESADV (TRANSUSXML)**: several `<Message>` elements in one file are
  split and paired by document number in Compare (not pooled into one), and
  shown one at a time with a picker in Quick check. A multi-`UNH` EDIFACT
  interchange gets the same picker in Quick check and keeps its message type
  per split message in Compare (the `UNA`-prefix bug).
- **Encoding**: a UTF-16 XML without a BOM is decoded and compared
  normally (not every line "missing"); windows-1252 characters (É, Ø, È)
  survive in Quick check; a UTF-16 XML inside a ZIP is decoded too.
- **INVOIC (TRANSUSXML)**: a date with a time part (`202601151200`) is
  normalized, not reported as "Invoice date differs"; an invoice labelled
  `<MessageFormat>TRANSUSXML` (instead of `<MessageStandard>`) is detected as
  INVOIC, not DESADV, in both modes.
- **INVOIC**: an `<?xml-stylesheet?>` instruction in bol's UBL is not
  mistaken for a second concatenated document (no false banner).
- **INVOIC**: bol's UBL `InvoiceTypeCode` `2` is read as a credit note
  (`1` stays an invoice), in Compare and Quick check. A supplier `BGM+381`
  credit against a bol credit with positive amounts shows matching document
  types and no amount differences.
- **XML reading**: whitespace before `<?xml` doesn't empty the message
  (DESADV XML, bol UBL invoice); text before the declaration is skipped with
  a banner; an illegal control character in a DESADV XML is stripped with
  the same banner INVOIC already had; malformed XML (DESADV, truncated UBL
  invoice) stops Compare with a plain-language banner naming the line and
  column, and shows the same banner in Quick check, rather than an empty
  result or a wall of "missing" findings.
- **ORDERS**: readable in Quick check; still declined in Compare.
- A ZIP with only one usable file switches to Quick check with a clear,
  readable (not instant/jarring) explanation, rather than failing.

When a new bug is found and fixed, add its scenario to this list and to
the actual test suite in the same commit as the fix.
