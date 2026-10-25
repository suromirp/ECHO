# Item-matching cascade (GTIN / article code / SSCC)

Built up over several real failures, in this priority order
(`buildKeyResolver`):

1. **Article code**, if it's actually present and shared on **both** sides
   across the whole message.
2. **GTIN** (normalized — see below), if shared on both sides.
3. **SSCC-pallet fallback** (DESADV only, last resort): if *neither*
   identifier system is reliable anywhere in the message, and a specific
   pallet holds exactly **one** item on each side, the SSCC itself already
   uniquely says which item is which — pair them positionally.
   - This only fires when the global fallback has already failed
     everywhere (checked *first* when true, so a line that happens to
     still carry a real GTIN doesn't get matched by that GTIN alone while
     its actual counterpart — which lacks one — falls back to a different
     key and the two never meet).
   - A pallet with **more than one** unidentified item on either side
     still can't be resolved this way — genuine ambiguity stays reported,
     don't extend this to "closest guess" matching.
4. Whatever identifier the line itself has, even if not shared globally.
5. No match possible (`K:?`).

## GTIN normalization

GTIN-8/12/13/14 are the same product at different lengths — strip leading
zeros before comparing (`normalizeGtin`), applied everywhere a GTIN is
used as a match key: line matching, pallet mapping, and the
pallet-EAN-repeated-as-item check.

Separately, an all-zeros GTIN (`0000000000000`) gets normalized to an
**empty string** at parse time, not to a numeral. Treat `''`/`null` as "no
GTIN," not as a valid key of its own — otherwise every blanked line in a
message collapses into one phantom aggregate item (they'd all share the
same normalized-to-a-numeral key).

A bol line whose EAN was replaced by zeros (and that has no article code)
borrows the supplier's EAN from the line with the same line number, but
only when that pairing is unambiguous: same number of lines on both sides,
same unique set of line numbers, and the same SSCC when both sit on one.
This is positional pairing on an identical line-number set, not similarity
matching. Without it, several zeroed lines on one pallet (where the SSCC
fallback can't help) produced "Item ?" knock-on differences next to the
real "EAN replaced by zeros" finding, which is still reported.

INVOIC does the same (`invoiceZeroPairs`), with one extra rule, because
invoice dialects number lines differently (supplier `10`/`20`/`30`, bol UBL
`1`/`2`/`3`), so an identical line-number set almost never occurs there.
With the same number of lines on both sides, and different line numbers, a
zeroed bol line is paired by position only when **every other line** carries
the same (normalized) EAN at the same position on both sides. The
paired line borrows the supplier's EAN for the line match and for matching
its line-level charges. Anything less clear-cut stays unpaired: the zeroing
is then a per-side Message check and the line shows as unmatched.

## Charge/line matching

Match a line-level charge to its line by the line's **GTIN**, not by the
raw line-reference number. Different dialects number lines completely
differently — e.g. a supplier's own `"10000"`/`"20000"` vs. bol's UBL
`"1"`/`"2"` `InvoiceLine` IDs — so the exact same charge on the exact same
line looks unrelated if matched on line numbering alone.

That GTIN must go through `normalizeGtin()` for this too, exactly like
every other match key in this cascade — confirmed by a real case: a
supplier and bol agreed on a line (GTIN-12/13 leading-zero difference,
normalized fine for the line match itself), but the charge-matching key
was built from the raw, unnormalized GTIN. The result wasn't a missed
match reported once — it was the same line-level charge, present on both
sides with the same amount, appearing as **two** contradictory findings
at once ("only on the supplier" *and* "only on bol"). Any code path that
derives its own matching key from a line's GTIN — not just the main line
match — needs to normalize it the same way.

## Why this took two rounds to get right

The first version only added the article-code fallback (step 1) — enough
for a supplier that blanks its GTIN but still sends a `PIA` article code
on every line. It wasn't enough for a supplier that sends **neither** a
usable GTIN nor any article code at all: every item on every pallet
collapsed into one indistinguishable aggregate, even though each item sat
on its own uniquely-SSCC'd pallet the whole time. The SSCC fallback (step
3) exists specifically for that case, and only pairs positionally when
there is truly only one possible pairing — resist the urge to make it
"smarter" (e.g. matching by quantity or description similarity) for
messier cases; that trades a correctly-reported ambiguity for a
confidently-wrong guess.
