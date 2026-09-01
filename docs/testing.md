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
- **ORDRSP**: a net price (`PRI+AAA`) missing on only one of two lines for
  the same item split across different actions is flagged as a
  Transformation difference (never lost by aggregating purely per EAN),
  plus a standalone single-message observation in both Quick check and
  Compare.
- **DESADV**: GTIN-12/13 leading-zero padding normalized across sides.
- **DESADV**: bol's GTIN blanked entirely, falls back to article code.
- **DESADV**: bol's GTIN blanked *and* no article code anywhere — resolved
  via single-item-per-pallet SSCC pairing, not left as "missing".
- **DESADV**: pallet-weight sum vs. shipment-total mismatch detected.
- **DESADV**: blank `LIN'` segments detected and excluded from the line
  count.
- **INVOIC**: multiple VAT-rate groups summed correctly for the taxable
  total (both the TRANSUSXML-style and bol's-own-UBL-style aggregation).
- **INVOIC**: TAX segment missing rate detected and grouped.
- **INVOIC**: qty×price vs. line-amount gap flagged only outside a
  rounding tolerance, and never sent to Transus.
- **INVOIC**: line-level allowance correctly shown as "not forwarded
  (expected)", not as a difference.
- **INVOIC**: a UBL line-amount gap that exactly matches a charge is
  treated as a match, not a difference.
- **INVOIC**: a VAT-rate position mismatch between line-level and
  summary-level TAX segments is flagged (in both Quick check and Compare),
  and never sent to Transus.
- **ORDERS**: readable in Quick check; still declined in Compare.
- A ZIP with only one usable file switches to Quick check with a clear,
  readable (not instant/jarring) explanation, rather than failing.

When a new bug is found and fixed, add its scenario to this list and to
the actual test suite in the same commit as the fix.
