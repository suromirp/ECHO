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

## Charge/line matching

Match a line-level charge to its line by the line's **GTIN**, not by the
raw line-reference number. Different dialects number lines completely
differently — e.g. a supplier's own `"10000"`/`"20000"` vs. bol's UBL
`"1"`/`"2"` `InvoiceLine` IDs — so the exact same charge on the exact same
line looks unrelated if matched on line numbering alone.

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
