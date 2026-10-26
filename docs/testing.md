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
  side with a collapsed tag list, not one finding per pallet. In Compare,
  when neither side has any SSCC, that is one "Neither message contains an
  SSCC" finding listing both sides' pallets (not three findings).
- **ORDRSP/DESADV**: Worth checking's "EANs appear a different number of
  times" counts per EAN + order (a multi-order message isn't flagged just
  for repeating an EAN once per order) and labels by EAN, not article code;
  an order list past ~20 collapses in the Compare strip and header table.
- **DESADV**: the SSCC length finding says when a value is "00" + a valid
  SSCC-18, or a 17-digit value valid with a leading 0, in both modes.
- **DESADV**: the Header fields table's Packing reference falls back to
  `RFF+DQ`/`RFF+AAS` (source labelled) when there's no `RFF+BM`.
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
- **DESADV**: the CSV dialect's `HDR` arrival date is read (Header fields
  table and Quick check), matching bol's `DTM+132`.
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
  DTM+11, …). It is collapsed; the summary says how many fields differ.
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
- **ORDRSP/DESADV**: the Compare verdict headline is driven by
  Transformation differences only. A Message check alone, even at err level
  (RFF+BM too long, no PAC, an ORDRSP action rule), gives the calm "The
  mapping looks right; … has something worth a look" headline, never "lost
  in translation", though its icon shows ⚠; a DESADV with a Transformation
  difference at warn level never says the output matches.
- **ORDRSP**: each action rule keeps its own level (a warn rule never shows
  as err because another rule on the same line is err); the action-6
  date-only amendment is info. Short headline + "More info", in Compare and
  Quick check.
- **DESADV**: order numbers shifted one line down in bol's output (bol line
  i = supplier line i−1, run ≥ 3 changed lines) are one grouped
  Transformation difference, not N per-item findings; an unrelated
  order-number mismatch is its own finding at Difference level (row status
  Difference, not Check). Compare-only.
- **UI**: Copy for Transus' "…and N more" counts the items behind a capped
  "N more item(s)" summary, not the number of left-out findings.
- **DESADV**: pallet overview — an SSCC with no items on one side while
  the other side has items for it is a Difference ("0 items", not "1 item"
  and "Match"); a line with a zeroed EAN reads "EAN zeroed", not "No
  items"; the quantities next to the pill are SSCC totals on both sides.
  Quick check shows the same labels.
- **DESADV**: SSCCs only in the supplier message that all sit in CPS
  groups without PAC are a Message check pointing at the PAC finding, not
  a Transformation difference sent to Transus; with PAC present they stay
  a Transformation difference.
- **DESADV**: SSCCs only on one side are listed as clickable tags,
  collapsed past ~20, not one long inline list; "Pallet mapping differs"
  is headed by its SSCC and difference count, the per-item differences in
  More info.
- **DESADV**: "Pallet EAN repeated as item" and "Item not linked to a
  pallet" are one grouped finding each (tags per item), not one per line;
  the shipment-weight and "No SSCC found" findings have a short headline +
  More info; warn-level pallet pills use "!" (⚠ is for errors), in both
  modes.
- **DESADV**: a message with only `RFF+BM` (empty BGM number) is not
  flagged "no packing reference", in either mode. The near-miss finding is
  headed "Packing reference almost matches the document number" with both
  values visible and the advice in More info; the header table row is
  "Packing reference".
- **ORDRSP**: a changed confirmed delivery date (`DTM+67`) is a grouped
  Transformation difference, compared per (item, action) bucket like the
  net price, only when both sides state it (Compare-only). Quick check's
  Lines table shows the delivery date and net price per line.
- **ORDRSP**: supplier action 6 used as a date-only amendment that bol's
  output carries as action 5 (same `QTY+12`, same `DTM+67`, no
  backorder/cancel) is one grouped Good-to-know note, not N "action codes
  differ" errors; a line whose `DTM+67` changed is still an action
  difference. Compare-only (needs both sides).
- **ORDRSP**: "Worth checking" counts any of QTY+12/83/182 as a quantity,
  so a cancelled line (action 2, QTY+182 only) isn't "Quantity missing".
- **ORDRSP/DESADV**: message values in Compare findings (article code,
  quantity, action, order number) are HTML-escaped — `ART<b>1` shows as
  text, never as markup.
- **UI**: "Copy report" marks each finding by section — `[DIFFERENCE]`,
  `[CHECK]` (Message checks), `[INFO]`, `[OK]` — never `[ERROR]`, which read
  as "you did something wrong" on a supplier's own message check.
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
- **INVOIC**: an all-zeros EAN only in bol's UBL output (supplier lines
  10/20/30, bol lines 1/2/3) is a Transformation difference, paired by
  position, with no knock-on "missing" or "without an EAN" findings; Quick
  check on bol's output shows it standalone.
- **INVOIC**: an all-zeros EAN and an order number missing its leading
  digit, both passed on unchanged to bol, are each reported once as the
  supplier's Message check in Compare, and show in Quick check for either
  file.
- **INVOIC**: an `MOA+203` right after a line-level `ALC` is read as the
  charge amount and doesn't overwrite the line amount (no false line-amount,
  charge, total or arithmetic findings).
- **INVOIC**: qty × net price vs. line amount runs per line (an EAN on two
  lines with different prices shows no gap and no summed price), per side in
  Compare, reported once when bol carries the same gap; `PRI+INV` stands in
  for a missing `PRI+AAA`. Same result in Quick check for either file.
- **INVOIC**: lines without an identifier and ambiguous references are
  per-side Message checks; info notes (credit note, soft header rows, "not
  compared") sit under Good to know, not Transformation differences; a header
  field absent on both sides shows "Not applicable".
- **INVOIC**: blank `LIN'` segments are counted and flagged, not read as
  lines; no order number anywhere is flagged (once when neither side has
  one); both in Compare and Quick check. An all-zeros-EAN line isn't also
  counted as "without an EAN or item number".
- **INVOIC**: per-EAN differences are capped at 5 per kind with an "N more"
  line; the credit-note note is a short headline with More info.
- **INVOIC**: a `TAX` segment inside a line's `ALC` group is the charge's
  VAT rate (kept on the ALC, shown in Quick check's charge chip), never the
  line's: no false "VAT % differs" for a 21% charge on a 9% line.
- **INVOIC**: Quick check shows a Findings list (Message checks / Good to
  know) like ORDRSP/DESADV, `!` for warnings and `⚠` only for errors, and
  the ECHO signal reacts to the worst level instead of always "all good".
- **INVOIC**: an illegal XML control character in any EDIFACT field (NAD
  name/address, FTX, IMD, …) is one grouped Message check with a tag per
  segment, in both modes.
- **INVOIC**: summary `MOA+131` (total charges/allowances) that doesn't equal
  the sum of the message's ALC amounts (beyond a cent) is a Message check,
  per side in Compare and once when passed on unchanged, and in Quick
  check; a matching `MOA+131` is silent.
- **INVOIC**: `RFF+CO` (buyer's order number) counts as an order reference,
  so a message carrying only `RFF+CO` isn't "no order number" (either
  mode); bol's output carrying no order reference at all is a Good-to-know
  note naming `RFF+CO`, not a Transformation difference.
- **XML reading**: whitespace before `<?xml` doesn't empty the message
  (DESADV XML, bol UBL invoice); text before the declaration is skipped with
  a banner; an illegal control character in a DESADV XML is stripped with
  the same banner INVOIC already had; malformed XML (DESADV, truncated UBL
  invoice) stops Compare with a plain-language banner naming the line and
  column, and shows the same banner in Quick check, rather than an empty
  result or a wall of "missing" findings.
- **ORDERS**: readable in Quick check; still declined in Compare.
- **ORDERS**: Quick check runs the line-level checks too (GS1 check digit,
  all-zeros EAN, duplicate `DTM` qualifier), not only for ORDRSP/DESADV.
- **ORDERS**: Quick check's Lines table shows the requested delivery date
  (line `DTM+2`, else the header `DTM+2`, dimmed) and the price: net
  (`PRI+AAA`) and gross (`PRI+AAB`) each in its own labelled column. The
  overview fields show the header's requested delivery date, or the line
  date "on every line" when only the lines carry one.
- **ORDRSP/DESADV**: when only one side has no order number (`RFF+ON`)
  anywhere, that side gets the same Message check Quick check runs. Only
  the supplier lacking it (bol's output has one) is never a difference and
  never reaches Copy for Transus; the line rows aren't Differences. bol's
  output lacking it is one grouped Transformation difference ("No order
  number in bol's output"), not one per item.
- **DESADV**: a side with no SSCC anywhere gets one finding that lists its
  SSCC-less pallet groups (no separate per-pallet "No SSCC found"), per side
  in Compare and in Quick check. SSCCs only in bol's output while the
  supplier message has none are named in the supplier's Message check, not
  a Transformation difference; the reverse stays a difference.
- **UI**: the Compare verdict (ORDRSP/DESADV and INVOIC) has a descriptive
  headline, the playful line as subtitle and a "Where to look" line derived
  from the findings' `cat`; its icon is the worst err/warn level of any cat
  (an err Message check shows ⚠ with the calm "mapping looks right"
  headline). Layout is findings-first: verdict → Findings (Worth checking
  inside, "!" icon) → stats → Header fields / Invoice details (collapsed,
  "N differ") → search → tables → raw messages.
- **UI (Quick check)**: a summary line above the Findings says "Nothing
  unusual found" or "N things to look at" (ORDRSP/DESADV/ORDERS and INVOIC);
  long order lists and Lines tables collapse past 20 with "Show all N
  lines", a search match still shows; the status line says the overview is
  below; one-line XML is pretty-printed for display and jump-to-source lands
  on the value; "Import file" is a button.
- **ORDRSP/DESADV/INVOIC**: one finding per cause — a per-side Message
  check carried unchanged by bol's output is reported once as "Supplier
  (passed on unchanged to bol)"; an SSCC without PAC is one finding whose
  effect lines say the SSCCs aren't in bol's output and that the values are
  20 characters (no separate "only in the supplier message", bol "No SSCC"
  or SSCC-length finding, in either mode); ORDRSP's date-only action 6
  carried as 5 is only the Good-to-know note (no Message check, no
  Amendment details rows, badge "Actions match (see Good to know)"); INVOIC
  rounding gaps on several lines are one finding with EAN tags, and
  one-sided header rows / totals are table rows only.
- **UI**: tables never contradict findings — a zeroed bol EAN shows as
  `supplier EAN → 0000000000000` and Difference in the line table (DESADV
  and INVOIC), its SSCC is a Difference in the pallet overview; an SSCC
  with a Message check (e.g. a wrong check digit) never shows OK/Match, in
  Quick check and Compare; the Quantities tile reads "Quantities (per
  EAN)" with a tooltip.
- A ZIP with only one usable file switches to Quick check with a clear,
  readable (not instant/jarring) explanation, rather than failing.

When a new bug is found and fixed, add its scenario to this list and to
the actual test suite in the same commit as the fix.
