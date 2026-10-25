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
| DESADV | many pallets missing an SSCC grouped into one finding with a collapsed list | `desadv/many-pallets-missing-sscc.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | nested CPS group with its own SSCC marked as nested, not an independent pallet; long Quick check pallet list collapses behind a toggle | `desadv/nested-sscc-hierarchy.edi` (same file both sides) | `specs/desadv.spec.js` |
| ORDRSP/DESADV | one search box filters the line table and pallet overview together (EAN, order, SSCC, article code), overriding the diff/flagged-only filter, in both Compare and Quick check | `desadv/search-fields.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | a pallet wrapper missing its own SSCC is flagged even though nested packages inside it carry one; a bare shipment-root CPS is never flagged for this | `desadv/pallet-sscc-only-on-package.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | a flat, quoted-CSV DESADV dialect (no EDIFACT segment syntax) is read correctly instead of silently producing zero supplier lines | `desadv/csv-dialect.sup.des`, `desadv/csv-dialect.bol.edi` | `specs/desadv.spec.js` |
| ORDRSP | the same CSV dialect's ORDRSP variant is routed to its own parser (by the HDR record's doc-type field), not misread as DESADV | `ordrsp/csv-dialect.sup.ORD`, `ordrsp/csv-dialect.bol.edi` | `specs/ordrsp.spec.js` |
| DESADV | a TRANSUSXML DESADV with no `<?xml` declaration is parsed as XML (not EDIFACT), linked to its boxes by `DespatchUnitReference`, and bol's one-line-late order numbers surface as order-number differences | `desadv/transusxml-messages.sup.xml`, `desadv/transusxml-messages.bol.edi` | `specs/desadv.spec.js` |
| ORDRSP/DESADV | an all-zeros EAN in bol's output, where the supplier sent a real one, is flagged as a Transformation difference; standalone Message check in Quick check | `desadv/sscc-single-item-fallback.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | several zeroed EANs on one pallet flagged once, paired by line number, with no "Item ?" knock-on differences | `desadv/zero-ean-shared-pallet.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | a changed despatch date (DTM+11) or expected delivery date (DTM+132) flagged as a Transformation difference; identical dates not flagged | `desadv/date-shift.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | several groups sharing one SSCC compared as one pallet; a near-miss packing reference vs despatch advice number flagged in both modes | `desadv/repeated-sscc-units.sup.xml`, `desadv/repeated-sscc-units.bol.edi` | `specs/desadv.spec.js` |
| ORDRSP/DESADV/INVOIC | GS1 check digit mismatch on an EAN/GTIN or SSCC flagged as a Message check in both modes (fixtures elsewhere use valid check digits) | `desadv/gs1-check-digit.edi` (same file both sides) | `specs/desadv.spec.js` |
| DESADV | SSCC stat counts distinct SSCCs, overview header shows groups vs SSCCs | `desadv/repeated-sscc-units.{sup.xml,bol.edi}` | `specs/desadv.spec.js` |
| ORDRSP/DESADV | Header fields table: supplier vs bol per field with its source field, open when something differs | `desadv/date-shift.*`, `desadv/repeated-sscc-units.*` | `specs/desadv.spec.js` |
| UI | long explanations behind a collapsed "More info" toggle; Copy for Transus sends only the headline | `desadv/date-shift.{sup,bol}.edi` | `specs/desadv.spec.js` |
| ORDRSP/DESADV | order number missing its leading digit flagged (once, passed on unchanged); header table compares all orders | `desadv/order-number-missing-digit.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | article moved to another pallet in bol's output flagged per SSCC | `desadv/sub-cps-per-item.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | a top-level consignment CPS with a summary PAC is not flagged as a pallet missing its SSCC | `desadv/consignment-summary-cps.edi` (same file both sides) | `specs/desadv.spec.js` |
| ORDRSP/DESADV | "Distinct items" stat labeled and explained via tooltip, not a bare "Items" count | `desadv/many-pallets-missing-sscc.edi` (same file both sides) | `specs/desadv.spec.js` |
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
| ORDERS | readable in Quick check; still declined in Compare | `orders/simple-orders.edi` (same file both sides) | `specs/orders.spec.js` |
| ZIP | single usable file switches to Quick check with an explanation | `zip/single-file.zip` (packs `zip/lonely-message.edi`) | `specs/zip.spec.js` |

## Adding a new regression fixture

Per `docs/testing.md`: when a new bug is found and fixed, add its scenario
to that file's list **and** to this suite in the same commit as the fix —
a new fixture pair under `fixtures/`, a test asserting the correct
behaviour, and a new row in the table above.
