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
| ORDRSP | net price missing on only one of two split-action lines for the same item | `ordrsp/split-item-price-gap.{sup,bol}.edi` | `specs/ordrsp.spec.js` |
| DESADV | GTIN-12/13 leading-zero padding normalized | `desadv/gtin-padding.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | bol's GTIN blanked, falls back to article code | `desadv/gtin-blanked-article-fallback.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | bol's GTIN blanked and no article code — SSCC single-item fallback | `desadv/sscc-single-item-fallback.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | pallet-weight sum vs. shipment-total mismatch | `desadv/pallet-weight-mismatch.{sup,bol}.edi` | `specs/desadv.spec.js` |
| DESADV | blank `LIN'` segments excluded from the line count | `desadv/blank-lin.{sup,bol}.edi` | `specs/desadv.spec.js` |
| INVOIC | multiple VAT-rate groups summed (TRANSUSXML + bol UBL) | `invoic/multi-vat.sup.transusxml.xml`, `invoic/multi-vat.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | TAX segment missing rate, grouped | `invoic/tax-missing-rate.sup.edi`, `invoic/tax-missing-rate.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | qty×price vs. line-amount gap, rounding tolerance | `invoic/line-arithmetic-tolerance.sup.edi`, `invoic/line-arithmetic-tolerance.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | line-level allowance "not forwarded (expected)" | `invoic/line-allowance-not-forwarded.sup.edi`, `invoic/line-allowance-not-forwarded.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | UBL line-amount gap matching a charge treated as a match | `invoic/ubl-line-amount-includes-charge.sup.edi`, `invoic/ubl-line-amount-includes-charge.bol.ubl.xml` | `specs/invoic.spec.js` |
| INVOIC | VAT-rate position mismatch between line and summary TAX segments | `invoic/tax-rate-encoding-mismatch.sup.edi`, `invoic/tax-rate-encoding-mismatch.bol.ubl.xml` | `specs/invoic.spec.js` |
| ORDERS | readable in Quick check; still declined in Compare | `orders/simple-orders.edi` (same file both sides) | `specs/orders.spec.js` |
| ZIP | single usable file switches to Quick check with an explanation | `zip/single-file.zip` (packs `zip/lonely-message.edi`) | `specs/zip.spec.js` |

## Adding a new regression fixture

Per `docs/testing.md`: when a new bug is found and fixed, add its scenario
to that file's list **and** to this suite in the same commit as the fix —
a new fixture pair under `fixtures/`, a test asserting the correct
behaviour, and a new row in the table above.
