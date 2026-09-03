# Formats and quirks

## Supported message types

EDIFACT — ORDRSP, DESADV, INVOIC, and ORDERS (Quick check only; an
outbound bol→supplier purchase order has nothing to compare against, so
Compare still declines it — but Quick check reads it, since a supplier
complaint about a malformed test order is a real, recurring use case).

## bol's own UBL XML (`nl-inv:Invoice` namespace)

Always the "bol output" side for INVOIC. Confirmed traps:

- **Multiple `TaxSubtotal` blocks (one per VAT rate) must be summed** for
  the taxable total. Taking only the first silently under-reports it the
  moment a message has more than one VAT rate (e.g. 9% on goods, 0% on a
  charge). Fixed once in `parseInvoicBolXml`; watch for the same
  first-element-only mistake anywhere else totals get aggregated from a
  repeated element.
- **`LineExtensionAmount` includes line-level allowances/charges**, per
  standard UBL semantics — EDIFACT-style formats state the line amount
  *before* charges. When a "Line amount differs" gap exactly matches a
  matched line-level charge, that's this convention, not a mapping
  problem — reconciled in `compareInvoice`'s Line-amount comparison rather
  than flagged.
- **Non-standard field placement happens.** One real bol export put its
  header order reference under `<cbc:SalesOrderID>` instead of the
  standard `<cbc:ID>`, so ECHO's parser fell through to the line-level
  `OrderLineReference` instead — which was actually the *correct* value to
  compare against once traced through against the supplier's own
  reference fields.

## Three distinct supplier-side XML dialects beyond bol's UBL and EDIFACT

Always check root structure and distinctive fields before assuming a
schema — a root element literally named `<Invoice>` does not mean it's
UBL, or even that it's the same dialect as another `<Invoice>`-rooted
message from a different supplier.

### 1. Generic Transus XML

Wrapped in `<Invoice>`/`<CreditNote>` tags, deep-searched by field name
(`parseInvoicTransusXml`).

### 2. TRANSUSXML

`<Messages><Message>`, self-labelled `MessageStandard=TRANSUSXML`,
`<Article>` lines. - `ArticleNetPrice` is per `ArticleQuantityPerPriceUnit`, **not** per
  single unit (e.g. "1235.9 per 100 pcs") — divide before treating it as
  a unit price, or every qty×price check produces nonsense.
- Header `VATBaseAmount`/`VATAmount` reflect only **one** VAT-rate group;
  the full taxable base is the sum across every `<InvoiceVATTotals>`
  block.

### 3. Exact Online raw export

`<Invoice type="object">`, `<SalesInvoiceLines><SalesInvoiceLine>`,
Exact-specific fields like `<SupplierTID>`. - `NetPrice` is already per single unit here (no basis-quantity wrinkle).
- **Must be detected and routed before the generic `<Invoice>`-wrapped
  Transus XML parser**, or that parser matches the same root element,
  assumes the wrong field names, and silently extracts zero lines — which
  then looks exactly like "every one of bol's lines is missing from the
  supplier," a misleading symptom of a parsing gap, not a real mapping
  issue.

## `detectMsgType` bare-substring trap

Matching on a literal tag-name substring without a tag-boundary anchor
causes real misclassification:

- `OrderLine` (no anchor) matched inside UBL's ordinary
  `<cac:OrderLineReference>`.
- `DespatchAdviceNumber` (no anchor) matched inside an otherwise normal
  INVOIC field.

Both routed whole messages to the wrong parser entirely. Any new detection
regex needs a tag boundary (`<Foo[\s>]`), not a bare `Foo`.

## Concatenated XML documents

A real bol export contained two full XML documents glued together with a
stray text line between them (traced to a Transus retry/regeneration
artifact — the two documents differed in exactly one field, an earlier
attempt with it blank and a later one with it correctly filled in).

Handling:
- Detected generically (more than one `<?xml` declaration in one file),
  not by matching the specific stray text.
- Each fragment is trimmed back to its own well-formed closing tag before
  parsing — otherwise the *earlier* fragment also fails to parse, since
  the stray text sits inside its own slice, right after its real content
  but before the next `<?xml`.
- The last parseable document is used for the actual comparison.
- A prominent, hard-to-miss banner (not quiet status text) explains what
  happened, because the underlying delivery to Transus genuinely failed
  and that needs a real fix upstream, not just a smoother read here. The
  banner also shows a field-level diff between the two documents, which
  is often the fastest way to see what the retry actually changed.

## Confirmed EDIFACT / qualifier-code quirks (real production data)

- **MOA qualifiers for "payable"**: `9` (Amount due) is common; `77`
  (Invoice amount) is a real, valid alternative some suppliers use for the
  identical concept — recognized as a fallback (never overriding `9` if
  both appear in the same message).
- **MOA `25`** ("Charge/allowance basis" per the official EDIFACT 5025
  code list) is used by some suppliers as if it directly stated the ALC
  amount — recognized as a fallback amount source for a charge/allowance,
  since the alternative (silently treating it as "no amount sent,"
  defaulting to 0) is worse.
- **An `ALC` segment with no following `MOA` at all** means "no amount was
  sent," which must render as `—`, never as `0.00` — a `0.00` display
  looks like a real, business-meaningful zero rather than "nothing was
  stated."
- **Line-level allowances (discounts) are deliberately dropped by bol's
  invoice process** — confirmed via a real Transus support ticket: bol's
  documented process (since 2015) only forwards article-level *charges*,
  never article-level *allowances*. A line-level allowance present only in
  the supplier message is therefore expected, not a mapping gap — shown
  in the Charges & Allowances table as "Not forwarded (expected)", not
  flagged as a Transformation difference. Line-level *charges* are still
  expected to be forwarded and are compared normally.
- **A `TAX` segment with a category but no rate** (e.g. `TAX+7+VAT++++E'`
  instead of `TAX+7+VAT+++:::0+E'`) is a real, confirmed cause of Transus
  rejecting a message outright ("Couldn't parse XML content" / validation
  failure tickets). Flagged as a Message check, grouped by (type,
  category) pair so a supplier tripping it on every line gets one note,
  not one per line.
- **A `TAX` segment stating the VAT rate at a different position than the
  rest of the message's own `TAX` segments** is a separate, real, confirmed
  cause of Transus rejecting a message ("VAT percentage/amount is
  missing") — the three line-level
  segments correctly carried the rate in C243 (element 5, 4th
  sub-component: `TAX+7+VAT+++:::21+S'`), but the summary-level segment
  left that element empty and appended the rate to the category code
  instead (`TAX+7+VAT+++21.000:S'`). ECHO's own defensive scan (which
  checks several positions and falls back to the first numeric part it
  finds) reads the rate correctly either way, so this never affects a
  comparison — but the inconsistency itself is exactly what trips a
  stricter validator. Detected by comparing, per invoice, whether the
  line-level and summary-level `TAX` segments resolved their rate via the
  same position or not (`taxRateEncodingMismatch` in `parseInvoicEdifact`)
  — flagged only when the two scopes are cleanly disjoint (all lines one
  way, the summary the other), not for a message that's merely
  inconsistent within one scope. Message check, both Quick check and
  Compare, never sent to Transus (it's a question about how the supplier's
  own message is built, not a mapping question).
- **A completely blank `LIN'` segment** (no EAN, action, or line number at
  all) appearing right before a real `LIN` is a confirmed, real cause of
  "blank item line" complaints from suppliers receiving Transus-generated
  test orders. Not stored as a phantom line (would otherwise inflate the
  line count with empty rows) — counted separately and flagged plainly.
- **Quantity/amount fields present but explicitly `0`** are a different,
  milder situation than the field being genuinely absent — e.g. action 5
  (fully accepted) with `QTY+12:0` reads as "worth being aware of, reads
  more like a cancellation" (soft warning), not the harder "no confirmed
  quantity is present" error reserved for the field being missing
  entirely. Conflating "explicitly zero" with "absent" was a real,
  reported point of confusion.
- **An item split across multiple ORDRSP lines with different actions can
  lose its net price (`PRI+AAA`) on only one of those lines** : an EAN appeared
  twice in the same message, once accepted (action 5) and once cancelled
  (action 2, likely a later addendum), and bol's output carried the price
  on the accepted line but dropped it on the cancelled one for that exact
  EAN. A *different*, non-split cancelled item elsewhere in the same
  message had no such issue — so this is specifically about the split,
  not "cancelled lines never get a price". ORDRSP previously compared no
  price field at all, so this was invisible; comparing purely aggregated
  by EAN (summing/merging across actions, as the rest of ORDRSP's
  comparison does) would also hide it again, since one bucket's price
  would mask the other's gap. Compared per (item, action) bucket instead
  (`parseFactsEdifact` now reads `PRI+AAA` into `netPrice`; the bucketing
  lives in `compare()`). Two distinct findings: a plain price mismatch is
  worded as "differs" (`cat:'diff'`, capped like other per-item diffs); a
  price present on only one side is worded distinctly ("Net price is
  missing on the \<side\> side ... — present on the \<other side\>",
  `cat:'diff'`, grouped by which side is missing it — `priceMissingFindings`)
  so it never reads like an ordinary rounding-style mismatch. Both reach
  "Copy for Transus" — this is a mapping question, not a message-quality
  one. A related, single-message observation (the same split-with-a-price-
  gap pattern, visible without any second message) also runs standalone
  in Quick check and per-side in Compare as a Message check
  (`checkSplitItemPriceGap`), per CLAUDE.md's parity rule.
- **A `DTM` qualifier code (e.g. `67` delivery date, `69` despatch date)
  appearing more than once within the same `LIN` group, with genuinely
  different dates, can cause a downstream EDI processor to silently drop
  other fields on that line** (confirmed case: the price, `PRI+AAA`).
  Some systems only accept one `DTM+67` and one `DTM+69` per article
  line; a real affected line carried both twice, with different dates:
  ```
  LIN+<line>+2+<EAN>:EN'
  PIA+1+<article>:SA'
  QTY+182:<qty>'
  DTM+67:<date1>:102'
  DTM+69:<date1>:102'
  DTM+67:<date2>:102'
  DTM+69:<date2>:102'
  PRI+AAA:<price>:CT:NTP'
  ```
  (quantity, dates and price shown as placeholders here — the exact
  values aren't relevant to the pattern, only the duplicated qualifiers)
  A different, unaffected line in the same message had only one `DTM+67`
  and one `DTM+69` — confirming the trigger is the duplication itself, not
  something about that particular item or action. Worth reporting back to
  whoever generates the feed, since the duplication originates in the
  supplier's own message. Detected by tracking every raw `DTM` occurrence
  per line during parsing (not just the last value, which is all
  `cur.dtm` itself keeps) and flagging when a qualifier's distinct values
  within one line number more than one (`cur.dtmConflicts`,
  `checkDtmDuplicateQualifier`). Message check (`cat:'message'`) — never
  sent to Transus, since it's a property of the supplier's own message,
  not a mapping question. `parseFactsEdifact` is shared by ORDRSP and
  DESADV, so this check runs for both, in both Quick check and Compare
  (per side), per CLAUDE.md's parity rule — confirmed to actually fire
  for DESADV too, not just assumed from the shared code path.
- **Credit notes**: EDIFACT's own BGM function code (381/384) is
  authoritative for detecting a credit note — bol's `InvoiceTypeCode`
  isn't reliable (looks constant regardless of document type). Bol's own
  negative-totals signal is only trusted as *confirmation* once the
  supplier's BGM has already said "credit note," never as the sole
  trigger — otherwise a normal invoice with one negative/return line would
  be misread as a credit note. Quantities/amounts are then compared by
  absolute value, since sign convention differs between supplier and bol.
