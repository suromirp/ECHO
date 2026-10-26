# ECHO regression suite

Playwright tests that open the shipped `index.html` directly via `file://` —
no dev server, no build step, matching the product's own zero-dependency
philosophy (see `docs/testing.md`).

## Running

From the repo root:

```
npm test
```

Or directly from this folder:

```
npm install
npx playwright test
```

This environment pre-installs Chromium outside Playwright's own cache;
`playwright.config.js` points at it directly (`/opt/pw-browsers/chromium`,
overridable via `PLAYWRIGHT_CHROMIUM_PATH`). Do **not** run
`playwright install` — it tries to download a browser and will fail in a
network-restricted environment.

## Layout

- `fixtures/` — synthetic EDIFACT/XML messages, one pair (or single file)
  per regression scenario from `docs/testing.md`. Kept as real files, not
  inlined in the specs, so they're easy to diff and extend.
- `specs/` — one Playwright spec file per message type, each covering the
  scenarios from `docs/testing.md`'s "Regression scenarios worth a
  permanent fixture" list.
- `helpers.js` — shared setup: opening the app, loading fixtures into
  Compare or Quick check.

## Fixture catalog

One row per regression scenario from `docs/testing.md`. `sup`/`bol` under
Fixture(s) are relative to `fixtures/<message type>/`.

| Message type | Scenario | Fixture(s) | Spec |
|---|---|---|---|
| ORDRSP | action-6-without-backorder grouped, not repeated per line | `ordrsp/action6-no-backorder.edi` (same file both sides) | `specs/ordrsp.spec.js` |
| ORDRSP | no net price anywhere on any accepted line flagged, not read as a clean match | `ordrsp/no-price-anywhere.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| ORDRSP | net price missing on only one of two split-action lines for the same item | `ordrsp/split-item-price-gap.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| ORDRSP | `DTM` qualifier repeated with different dates within one line | `ordrsp/dtm-duplicate-qualifier.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| ORDRSP | a run of consecutive lines each showing the previous line's price grouped as one shift, not N independent price differences | `ordrsp/cascading-price-shift.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| ORDRSP | Amendment details collapses past 5 lines behind "Show all", searchable, search box positioned above the tables it filters | `ordrsp/amendment-details-collapse.edi` (same file both sides) | `specs/ordrsp.spec.js` |
| ORDRSP | TRANSUSXML `<Article>` dialect: cancelled quantity, its action-6 derivation, and net price all read correctly | `ordrsp/transusxml-cancelled-quantity.sup.xml`, `ordrsp/transusxml-cancelled-quantity.bol.edi` | `specs/ordrsp.spec.js` |
| DESADV | GTIN-12/13 leading-zero padding normalized | `desadv/gtin-padding.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | bol's GTIN blanked, falls back to article code | `desadv/gtin-blanked-article-fallback.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | bol's GTIN blanked and no article code — SSCC single-item fallback | `desadv/sscc-single-item-fallback.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | pallet-weight sum vs. shipment-total mismatch | `desadv/pallet-weight-mismatch.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | blank `LIN'` segments excluded from the line count | `desadv/blank-lin.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | `DTM` qualifier repeated with different dates within one line (same shared check as ORDRSP) | `desadv/dtm-duplicate-qualifier.edi` | `specs/desadv.spec.js` |
| DESADV | `RFF+BM`, when present, shown as the packing reference instead of the BGM document number | `desadv/bill-of-lading-reference.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | a Packing List Reference (`RFF+BM`) over 15 characters is flagged, per side — a confirmed hard delivery limit, undocumented on bol's own DESADV page | `desadv/packing-reference-too-long.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | a CPS group with an SSCC but no PAC segment is flagged as a confirmed (Transus-support) cause of the SSCC not reaching bol; a 20-character SSCC is flagged separately at info level | `desadv/sscc-no-pac.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | many pallets missing an SSCC grouped into one finding with a collapsed list; in Compare with no SSCC on either side, one "Neither message contains an SSCC" finding listing both sides | `desadv/many-pallets-missing-sscc.edi` (same file both sides) | `specs/desadv.spec.js` |
| ORDRSP/DESADV | Worth checking EAN-repeat pattern keyed per EAN + order; long order lists collapse in strip and header table | `desadv/many-orders.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | SSCC length finding notes "00" + valid SSCC-18 / valid with a leading 0 | `desadv/sscc-length-hints.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | header table Packing reference falls back to RFF+DQ, source labelled | `desadv/packing-ref-dq-only.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | nested CPS group with its own SSCC marked as nested, not an independent pallet; long Quick check pallet list collapses behind a toggle | `desadv/nested-sscc-hierarchy.edi` (same file both sides) | `specs/desadv.spec.js` |
| ORDRSP/DESADV | one search box filters the line table and pallet overview together (EAN, order, SSCC, article code), overriding the diff/flagged-only filter, in both Compare and Quick check | `desadv/search-fields.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | a pallet wrapper missing its own SSCC is flagged even though nested packages inside it carry one; a bare shipment-root CPS is never flagged for this | `desadv/pallet-sscc-only-on-package.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | a flat, quoted-CSV DESADV dialect (no EDIFACT segment syntax) is read correctly instead of silently producing zero supplier lines | `desadv/csv-dialect.sup.des`, `desadv/csv-dialect.bol.edi` | `specs/desadv.spec.js` |
| DESADV | the CSV dialect's HDR arrival date is read and matches bol's DTM+132 (Compare header table, Quick check) | `desadv/csv-dialect.sup.des`, `desadv/csv-dialect.bol.edi` | `specs/desadv.spec.js` |
| ORDRSP | the same CSV dialect's ORDRSP variant is routed to its own parser (by the HDR record's doc-type field), not misread as DESADV | `ordrsp/csv-dialect.sup.ORD`, `ordrsp/csv-dialect.bol.edi` | `specs/ordrsp.spec.js` |
| DESADV | a TRANSUSXML DESADV with no `<?xml` declaration is parsed as XML (not EDIFACT), linked to its boxes by `DespatchUnitReference`, and bol's one-line-late order numbers surface as order-number differences | `desadv/transusxml-messages.sup.xml`, `desadv/transusxml-messages.bol.edi` | `specs/desadv.spec.js` |
| ORDRSP/DESADV | an all-zeros EAN in bol's output, where the supplier sent a real one, is flagged as a Transformation difference; standalone Message check in Quick check | `desadv/sscc-single-item-fallback.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | several zeroed EANs on one pallet flagged once, paired by line number, with no "Item ?" knock-on differences | `desadv/zero-ean-shared-pallet.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | a changed despatch date (DTM+11) or expected delivery date (DTM+132) flagged as a Transformation difference; identical dates not flagged | `desadv/date-shift.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | several groups sharing one SSCC compared as one pallet; a near-miss packing reference vs despatch advice number flagged in both modes | `desadv/repeated-sscc-units.sup.xml`, `desadv/repeated-sscc-units.bol.edi` | `specs/desadv.spec.js` |
| ORDRSP/DESADV/INVOIC | GS1 check digit mismatch on an EAN/GTIN or SSCC flagged as a Message check in both modes (fixtures elsewhere use valid check digits) | `desadv/gs1-check-digit.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | SSCC stat counts distinct SSCCs, overview header shows groups vs SSCCs | `desadv/repeated-sscc-units.{sup.xml,bol.edi}` | `specs/desadv.spec.js` |
| ORDRSP/DESADV | Header fields table: supplier vs bol per field with its source field, collapsed with a "N differ" summary | `desadv/date-shift.*`, `desadv/repeated-sscc-units.*` | `specs/desadv.spec.js` |
| UI | long explanations behind a collapsed "More info" toggle; Copy for Transus sends only the headline | `desadv/date-shift.{sup,bol}.edi` | `specs/desadv.spec.js` |
| ORDRSP/DESADV | order number missing its leading digit flagged (once, passed on unchanged); header table compares all orders | `desadv/order-number-missing-digit.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | article moved to another pallet in bol's output flagged per SSCC | `desadv/sub-cps-per-item.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | a top-level consignment CPS with a summary PAC is not flagged as a pallet missing its SSCC | `desadv/consignment-summary-cps.edi` (same file both sides) | `specs/desadv.spec.js` |
| ORDRSP/DESADV | "Distinct items" stat labeled and explained via tooltip, not a bare "Items" count | `desadv/many-pallets-missing-sscc.edi` (same file both sides) | `specs/desadv.spec.js` |
| ORDRSP/DESADV | verdict headline driven by Transformation differences only: Message checks alone (even err) get the calm "mapping looks right" headline with a ⚠ icon; a DESADV diff at warn level never reads "matches" | `desadv/message-checks-only.edi` (same file both sides), `desadv/date-shift.{sup,bol}.edi` | `specs/desadv.spec.js` |
| ORDRSP | each action rule keeps its own level (not the line's worst); action-6 date-only amendment is info; Message checks alone keep the verdict calm | `ordrsp/rule-levels.edi` (same file both sides) | `specs/ordrsp.spec.js` |
| DESADV | order numbers shifted one line down in bol's output grouped into one finding; an order mismatch is a Difference (err), not Check | `desadv/order-shift.{sup,bol}.edi` | `specs/desadv.spec.js` |
| UI | Copy for Transus "…and N more" counts items behind capped summaries | `ordrsp/transus-more-count.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| DESADV | pallet overview: empty SSCC vs items on the other side is a Difference with "0 items"; zeroed EAN labelled; pill quantities are SSCC totals on both sides | `desadv/pallet-overview-empty-and-zeroed.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | SSCCs only in the supplier message, all in PAC-less CPS groups, are a Message check (not sent to Transus); with PAC they stay a difference | `desadv/sscc-no-pac.{sup,bol}.edi`, `desadv/sscc-only-one-side.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | SSCCs only on one side listed as tags, collapsed past 20; "Pallet mapping differs" headline = SSCC + count, per-item diffs in More info | `desadv/sscc-only-one-side.{sup,bol}.edi`, `desadv/sub-cps-per-item.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | pallet EAN repeated as item / item not linked to a pallet grouped into one finding each with tags; weight-sum finding short; warn pills use "!" | `desadv/pallet-structure-grouping.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | only `RFF+BM` (no BGM number) is not "no packing reference" (both modes); near-miss finding has a neutral headline, advice in More info | `desadv/packing-ref-bm-only.edi` (same file both sides), `desadv/repeated-sscc-units.{sup.xml,bol.edi}` | `specs/desadv.spec.js` |
| ORDRSP | changed DTM+67 (per item + action) is a Transformation difference; Quick check Lines table shows date and price | `ordrsp/delivery-date-differs.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| ORDRSP | date-only action 6 carried as action 5 by bol (same QTY+12/DTM+67) is one Good-to-know note, not an action difference; a changed DTM+67 still is | `ordrsp/action6-remapped-to-5.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| ORDRSP | a cancelled line carrying only QTY+182 isn't reported as "Quantity missing" in Worth checking (Quick check and Compare) | `ordrsp/cancelled-line-quantity.edi` (same file both sides) | `specs/ordrsp.spec.js` |
| ORDRSP/DESADV | message values (article code, quantity, action, order number) in Compare findings are escaped, not rendered as HTML | `ordrsp/html-in-values.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| UI | Copy report uses neutral per-section marks (`[DIFFERENCE]`/`[CHECK]`/`[INFO]`/`[OK]`), never `[ERROR]` | `desadv/message-checks-only.edi`, `desadv/date-shift.{sup,bol}.edi` | `specs/desadv.spec.js` |
| INVOIC | multiple VAT-rate groups summed (TRANSUSXML + bol UBL) | `invoic/multi-vat.sup.transusxml.xml`, `invoic/multi-vat.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | TAX segment missing rate, grouped | `invoic/tax-missing-rate.sup.edi`, `invoic/tax-missing-rate.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | qty×price vs. line-amount gap, rounding tolerance | `invoic/line-arithmetic-tolerance.sup.edi`, `invoic/line-arithmetic-tolerance.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | uniform percentage gap across multiple lines grouped into one finding; a genuine outlier stays individual | `invoic/uniform-discount-pattern.sup.edi`, `invoic/uniform-discount-pattern.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | line-level allowance "not forwarded (expected)" | `invoic/line-allowance-not-forwarded.sup.edi`, `invoic/line-allowance-not-forwarded.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | UBL line-amount gap matching a charge treated as a match | `invoic/ubl-line-amount-includes-charge.sup.edi`, `invoic/ubl-line-amount-includes-charge.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | VAT-rate position mismatch between line and summary TAX segments | `invoic/tax-rate-encoding-mismatch.sup.edi`, `invoic/tax-rate-encoding-mismatch.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | line-level charge matches across sides despite a GTIN-12/13 leading-zero difference on that line | `invoic/line-charge-gtin-padding.sup.edi`, `invoic/line-charge-gtin-padding.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | VAT number shown per party in the Invoice details table, alongside GLN | `invoic/vat-number-shown.sup.edi`, `invoic/vat-number-shown.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | illegal XML control character in an item description flagged on the supplier side, and stripped with a loud banner when already inside an XML file | `invoic/illegal-xml-char.sup.edi`, `invoic/illegal-xml-char.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | bol's `LegalMonetaryTotal/LineExtensionAmount` stuck at 0 falls back to summing the invoice lines instead of a false "Total line amounts differs" | `invoic/ubl-line-total-zero.sup.edi`, `invoic/ubl-line-total-zero.bol.ubl.xml` | `specs/invoic.spec.js` |
| DESADV | XML header vs line fields: a header-only order number applies to every Article, a line `<DeliveryDate>` isn't read as the header date, a unit keeps its own `<LineNumber>` | `desadv/transusxml-header-scope.sup.xml`, `desadv/transusxml-header-scope.bol.edi` | `specs/desadv.spec.js` |
| DESADV | several `<Message>` elements in one XML file split and paired by document number (Compare), shown one at a time with a picker (Quick check) | `desadv/transusxml-two-messages.sup.xml`, `desadv/transusxml-two-messages.bol.edi` | `specs/desadv.spec.js` |
| DESADV | a multi-UNH EDIFACT interchange gets the same Quick check picker and keeps its message type per split message in Compare | `desadv/two-messages.edi`, `desadv/transusxml-two-messages.bol.edi` | `specs/desadv.spec.js` |
| DESADV | a UTF-16 XML without a BOM is decoded from its bytes and compared normally, not read as an empty message | `desadv/utf16-no-bom.sup.xml`, `desadv/utf16-no-bom.bol.edi` | `specs/desadv.spec.js` |
| DESADV | windows-1252 characters (É, Ø, È) survive in Quick check instead of becoming U+FFFD | `desadv/windows-1252.sup.xml` | `specs/desadv.spec.js` |
| ZIP | a UTF-16 XML (with BOM) inside a ZIP is decoded from its bytes, not as UTF-8 | `zip/utf16-pair.zip` | `specs/zip.spec.js` |
| DESADV | whitespace before `<?xml` doesn't make the XML parse as nothing | `desadv/leading-whitespace.sup.xml`, `desadv/leading-whitespace.bol.edi` | `specs/desadv.spec.js` |
| DESADV | text before the XML declaration skipped, with a banner | `desadv/text-before-declaration.sup.xml` | `specs/desadv.spec.js` |
| DESADV | illegal control character in a DESADV XML stripped with a banner, not read as an empty file | `desadv/illegal-xml-char.sup.xml`, `desadv/illegal-xml-char.bol.edi` | `specs/desadv.spec.js` |
| DESADV | malformed XML stops Compare with a plain-language banner (line/column) instead of an empty comparison; same banner in Quick check | `desadv/malformed.sup.xml`, `desadv/malformed.bol.edi` | `specs/desadv.spec.js` |
| INVOIC | bol UBL invoice starting with a blank line is still read | `invoic/multi-vat.sup.transusxml.xml`, `invoic/leading-whitespace.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | truncated XML invoice shows a banner with the reader position, in Compare and Quick check | `invoic/multi-vat.sup.transusxml.xml`, `invoic/truncated.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | TRANSUSXML date with a time part (12 digits) normalized, no false "Invoice date differs" | `invoic/transusxml-datetime.sup.transusxml.xml`, `invoic/multi-vat.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | TRANSUSXML invoice labelled `<MessageFormat>` detected and read as INVOIC (not DESADV), Compare and Quick check | `invoic/transusxml-messageformat.sup.transusxml.xml`, `invoic/multi-vat.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | an `<?xml-stylesheet?>` instruction isn't mistaken for a concatenated second document | `invoic/multi-vat.sup.transusxml.xml`, `invoic/xml-stylesheet.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | bol UBL `InvoiceTypeCode` 2 read as a credit note (1 stays an invoice); positive amounts on both sides of a credit are no difference | `invoic/credit-type-code-2.{sup.edi,bol.ubl.xml}` | `specs/invoic.spec.js` |
| INVOIC | all-zeros EAN only in bol's output: Transformation difference, paired by position across different line numbering, no knock-on findings; standalone in Quick check | `invoic/zero-ean-bol-output.{sup.edi,bol.ubl.xml}` | `specs/invoic.spec.js` |
| INVOIC | all-zeros EAN and order number missing its leading digit, passed on unchanged: each reported once in Compare, shown in Quick check for both files | `invoic/zero-ean-order-digit.{sup.edi,bol.ubl.xml}` | `specs/invoic.spec.js` |
| INVOIC | `MOA+203` right after `ALC` read as the charge amount, not the line amount | `invoic/alc-moa-203.{sup.edi,bol.ubl.xml}` | `specs/invoic.spec.js` |
| INVOIC | one-side findings (no identifier, ambiguous reference) are Message checks; info notes under Good to know; header field absent on both sides is Not applicable | `invoic/finding-categories.{sup.edi,bol.ubl.xml}`, `invoic/credit-type-code-2.*` | `specs/invoic.spec.js` |
| INVOIC | blank `LIN'` counted and flagged (not a phantom line); no order number anywhere flagged; zeroed-EAN line not double-counted | `invoic/blank-lin-no-order.{sup.edi,bol.ubl.xml}`, `invoic/zero-ean-order-digit.*` | `specs/invoic.spec.js` |
| INVOIC | per-EAN differences capped at 5 per kind with a summary line; credit-note note behind More info | `invoic/many-qty-diffs.{sup.edi,bol.ubl.xml}`, `invoic/credit-type-code-2.*` | `specs/invoic.spec.js` |
| INVOIC | `TAX` inside a line's ALC group kept on the charge, not the line's VAT % (no false VAT difference; charge chip shows its VAT) | `invoic/alc-tax-line-vat.{sup.edi,bol.ubl.xml}` | `specs/invoic.spec.js` |
| INVOIC | Quick check Findings list with Message checks section, `!` for warn, signal follows the worst level | `invoic/tax-missing-rate.sup.edi`, `invoic/alc-tax-line-vat.sup.edi` | `specs/invoic.spec.js` |
| INVOIC | illegal control character in any field (NAD, FTX, IMD) grouped into one finding with a tag per segment, both modes | `invoic/illegal-chars-free-text.{sup.edi,bol.ubl.xml}` | `specs/invoic.spec.js` |
| INVOIC | `MOA+131` ≠ sum of ALC amounts flagged per side / once when passed on unchanged / in Quick check; matching `MOA+131` silent | `invoic/charge-total-mismatch.{sup.edi,bol.ubl.xml}`, `invoic/alc-moa-203.sup.edi` | `specs/invoic.spec.js` |
| INVOIC | `RFF+CO` read as an order reference (no false "no order number"); bol carrying none is Good to know, labelled RFF+CO, in Compare and Quick check | `invoic/rff-co-order.{sup.edi,bol.ubl.xml}` | `specs/invoic.spec.js` |
| INVOIC | qty × price checked per line and per side (no summed prices for an EAN on two lines), once when passed on unchanged; `PRI+INV` as net-price fallback | `invoic/arith-per-line.{sup.edi,bol.ubl.xml}` | `specs/invoic.spec.js` |
| ORDERS | readable in Quick check; still declined in Compare | `orders/simple-orders.edi` (same file both sides) | `specs/orders.spec.js` |
| ORDERS | Quick check runs the GS1 check-digit, all-zeros EAN and duplicate-DTM checks | `orders/line-checks.edi` | `specs/orders.spec.js` |
| ORDERS | Quick check shows the requested delivery date per line (line `DTM+2`, else the header's, dimmed), net price (`PRI+AAA`) and gross price (`PRI+AAB`) in labelled columns, and the requested delivery date in the overview fields | `orders/price-and-date.edi`, `orders/line-date-only.edi` | `specs/orders.spec.js` |
| ORDRSP/DESADV | an order number only in bol's output is the supplier's Message check (naming bol's number), not a per-item difference for Transus; Quick check runs the same check | `ordrsp/order-only-on-bol.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| ORDRSP/DESADV | an order number missing from bol's output is one grouped Transformation difference plus bol's own Message check | `ordrsp/order-lost-in-bol.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| DESADV | SSCCs only in bol's output (supplier has none) are the supplier's Message check, not a difference for Transus; a side without any SSCC gets one finding listing its pallet groups (Compare per side and Quick check), no separate "No SSCC found" | `desadv/sscc-only-on-bol.{sup,bol}.edi`, `desadv/csv-dialect.*`, `desadv/many-pallets-missing-sscc.edi` | `specs/desadv.spec.js` |
| UI | Compare verdict: descriptive headline, playful subtitle, "Where to look" from the findings' cat, icon = worst level of any cat; findings-first layout with Worth checking inside Findings, Header fields / Invoice details collapsed | `desadv/date-shift.{sup,bol}.edi`, `desadv/message-checks-only.edi`, `desadv/two-messages.edi`, `invoic/zero-ean-bol-output.*` | `specs/layout.spec.js`, `specs/desadv.spec.js` |
| UI | Quick check summary line ("Nothing unusual found" / "N things to look at"); long order list and Lines table collapse past 20 (search still finds hidden rows); status line says "below"; one-line XML pretty-printed so jump-to-source lands on the value; Import file styled as a button | `desadv/two-messages.edi`, `desadv/message-checks-only.edi`, `desadv/many-orders.edi`, `desadv/transusxml-messages.sup.xml`, `invoic/tax-missing-rate.sup.edi` | `specs/quick.spec.js` |
| ORDRSP/DESADV/INVOIC | one finding per cause: same per-side check on both sides reported once as "passed on unchanged"; PAC finding carries the SSCC effects and length note as sub-lines; date-only action 6 → 5 only in Good to know; INVOIC rounding gaps grouped with EAN tags; one-sided header rows/totals not repeated as findings | `desadv/sscc-no-pac.*`, `desadv/gs1-check-digit.edi`, `desadv/packing-reference-too-long.*`, `ordrsp/csv-dialect.*`, `ordrsp/action6-no-backorder.edi`, `invoic/rounding-gaps.{sup.edi,bol.ubl.xml}` | `specs/desadv.spec.js`, `specs/ordrsp.spec.js`, `specs/invoic.spec.js` |
| UI | tables never contradict findings: zeroed bol EAN is `EAN → 0000000000000` + Difference in the line table and its SSCC a Difference; an SSCC with a Message check never shows OK/Match; "Quantities (per EAN)" tile | `desadv/zero-ean-shared-pallet.{sup,bol}.edi`, `desadv/gs1-check-digit.edi`, `invoic/zero-ean-bol-output.*` | `specs/layout.spec.js` |
| UI | Copy for Transus: message ID / supplier / document in the intro, full headlines with tags or per-pallet differences as sub-items, no "…" truncation; Copy report has the same context and spaces between blocks | `zip/Message_ID_100000001.zip` (packs `desadv/sub-cps-per-item.*`), `desadv/order-shift.{sup,bol}.edi` | `specs/reports.spec.js` |
| ZIP | single usable file switches to Quick check with an explanation | `zip/single-file.zip` (packs `zip/lonely-message.edi`) | `specs/zip.spec.js` |

## Adding a new regression fixture

Per `docs/testing.md`: when a new bug is found and fixed, add its scenario
to that file's list **and** to this suite in the same commit as the fix —
a new fixture pair under `fixtures/`, a test asserting the correct
behaviour, and a new row in the table above.
