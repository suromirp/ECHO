# ECHO — EDI Message Inspector

This file is the standing reference for anyone (human or Claude) working on
ECHO. Read it before making changes. It captures *why* ECHO is built the
way it is, not just *what* the code does — the two have diverged from a
naive first guess often enough that the reasoning matters as much as the
result.

## 1. What ECHO is

ECHO is a single, self-contained HTML file (`index.html` / `echo.html`) —
no server, no build step, no dependencies beyond what's inlined — built for
bol.com's OSM/EDI colleagues who are *not* EDI experts. It parses and
compares EDIFACT and Transus/UBL XML messages (ORDRSP, DESADV, INVOIC)
entirely in the browser, so no data ever leaves the machine.

Two modes:

- **Compare** — supplier message ↔ bol output, side by side. The core
  question: *did bol's transformation preserve the supplier's business
  data correctly?*
- **Quick check** — one message, inspected on its own. The core question:
  *what does this message actually say, and is anything about it worth a
  second look?*

**Both modes must stay useful on their own.** A check built for Compare
that only makes sense with two sides (e.g. "these two SSCCs don't match")
stays Compare-only. A check that's really about *one side's own message*
(missing order number, no SSCC anywhere, a blank structural segment, an
internal arithmetic gap) belongs in **both** — Quick check runs it
standalone, Compare runs it once per side. Every time this project shipped
a check in only one place, it turned out to be an oversight, not a design
choice. When adding a new check, ask explicitly: *does this need two
messages, or did I just build it in the mode I happened to be looking at?*

Distribution: public GitHub repo `suromirp/ECHO`, served via GitHub Pages.
Deliberately public — EDIFACT is an open standard, and bol's own supplier
help site already names Transus, GLNs, SSCCs and the four message types.

## 2. Core philosophy — do not deviate

These five rules predate this file and have been tested against a lot of
real, messy production data. They hold up. Every "bug" that turned out not
to be a bug traced back to one of these being ignored.

1. **"Understand the message → normalize → compare."** Never a raw
   structural diff. Never strict spec enforcement.
2. **ECHO never claims a message is valid/invalid/compliant.** It reports
   what it observes, in neutral language. This gets harder to hold to as
   checks get smarter (see §6, arithmetic/price checks) — the temptation
   to say "this is wrong" instead of "this doesn't reconcile" is real and
   must be resisted.
3. **Distinguish technical/structural difference (expected in
   transformation, not worth a mention) from business difference (worth
   flagging).** This is the single biggest source of "bugs" that weren't
   bugs: GTIN padding, price-basis quantities, UBL baking charges into the
   line amount, bol dropping line-level allowances by design — all
   structural, none of them business problems, all of them *looked* like
   bugs on first read.
4. **Zero hardcoded EANs/SSCCs/order numbers/quantities in the logic.**
   Every check must work on the shape of the data, not specific values.
5. **When something looks like a bug, read the raw source data before
   concluding anything.** Every real fix in this project's history started
   with staring at the actual EDIFACT segments or XML, not at ECHO's
   rendered output. Several near-misses were caught only because a
   "confirmed" bug turned out to reconcile perfectly once the raw numbers
   were actually added up (see §6, a real supplier line-amount case).

Two rules this project *learned* the hard way, worth treating with equal
weight:

6. **Verify claims about external systems (bol's mapping, Transus's
   validation, another AI's analysis) against the raw data before
   agreeing with them.** More than once a plausible-sounding claim ("bol
   doesn't recalculate anything") turned out to be right for the wrong
   reason, or half-right — the arithmetic almost always settles it either
   way.
7. **A finding that could read as "you did something wrong" needs a
   generous tolerance and neutral framing, or it shouldn't exist.**
   Rounding artifacts, price-basis conventions, and format differences
   are common and mostly harmless. The bar for surfacing them at all is
   "this explains something a human would otherwise have to dig for,"
   not "this technically isn't identical."

## 3. The three-way finding taxonomy

Every finding has a `level` (`err`/`warn`/`info`/`ok` — controls the icon)
and a `cat` (`message`/`diff`/`info` — controls which section it renders
under and whether it can ever reach Transus). These are orthogonal; don't
conflate them.

- **Message checks** (`cat: 'message'`) — an observation about *one side's
  own message*, independent of the other side. Never sent to "Copy for
  Transus" — if it's the supplier's own data issue, Transus can't fix it
  by remapping anything; if it's a structural quirk, it's not a mapping
  problem either. Examples: missing SSCC, missing order number, blank LIN
  segments, a TAX segment with no rate, quantity×price not reconciling
  with the line amount, pallet-weight sums not matching the shipment
  total.
- **Transformation differences** (`cat: 'diff'`) — a genuine question
  about whether the supplier→bol mapping preserved something. This is
  what "Copy for Transus" pulls from (filtered to `err`/`warn`).
- **Good to know** (`cat: 'info'`) — expected, non-problematic behaviour
  worth being aware of, not filed as a difference at all.

Repeated findings of the *same pattern* are grouped into one block with
the affected items listed as tags (`groupActionFindings`,
`taxIssueFindings`), not repeated once per line — a supplier that trips
one rule on every line should produce one explanation, not a wall of
identical paragraphs. Cap-and-summarize (`N more line(s) — see below`) is
the fallback where grouping isn't natural.

## 4. Supported formats — and the traps in each

**EDIFACT** — ORDRSP, DESADV, INVOIC, and ORDERS (Quick check only; an
outbound bol→supplier purchase order has nothing to compare against, so
Compare still declines it — but Quick check reads it, since a supplier
complaint about a malformed test order is a real, recurring use case).

**bol's own UBL XML** (`nl-inv:Invoice` namespace) — always the "bol
output" side for INVOIC. Traps found in production data:
- Multiple `TaxSubtotal` blocks (one per VAT rate) must be **summed** for
  the taxable total — taking only the first silently under-reports it the
  moment a message has more than one VAT rate (e.g. 9% on goods, 0% on a
  charge). Fixed once; watch for the same first-element-only mistake
  anywhere else totals get aggregated.
- `LineExtensionAmount` **includes** line-level allowances/charges, per
  standard UBL semantics — EDIFACT-style formats state the line amount
  *before* charges. When a "Line amount differs" gap exactly matches a
  matched line-level charge, that's this convention, not a mapping
  problem (see `compareInvoice`'s Line-amount comparison).
- Non-standard field placement happens: one real bol export put its
  header order reference under `<cbc:SalesOrderID>` instead of the
  standard `<cbc:ID>`, so ECHO's parser silently fell through to the
  line-level `OrderLineReference` instead — which was actually the
  *correct* value to compare against once traced through.

**Three distinct supplier-side XML dialects exist beyond bol's own UBL and
plain EDIFACT** — always check root structure and distinctive fields
before assuming a schema; a root element literally named `<Invoice>` does
not mean it's UBL, or even that it's the same dialect as another
`<Invoice>`-rooted message from a different supplier:

1. **Generic Transus XML** — wrapped in `<Invoice>`/`<CreditNote>` tags,
   deep-searched by field name (`parseInvoicTransusXml`).
2. **TRANSUSXML** (`<Messages><Message>`, self-labelled
   `MessageStandard=TRANSUSXML`, `<Article>` lines) — seen from a real supplier.
   `ArticleNetPrice` is per `ArticleQuantityPerPriceUnit`, **not** per
   single unit (e.g. "1235.9 per 100 pcs") — divide before treating it as
   a unit price, or every qty×price check produces nonsense. Header
   `VATBaseAmount`/`VATAmount` reflect only **one** VAT-rate group; the
   full taxable base is the sum across every `<InvoiceVATTotals>` block.
3. **Exact Online raw export** (`<Invoice type="object">`,
   `<SalesInvoiceLines><SalesInvoiceLine>`, Exact-specific fields like
   `<SupplierTID>`) — seen from this source system. `NetPrice` is already per
   single unit here (no basis-quantity wrinkle). Must be detected and
   routed **before** the generic `<Invoice>`-wrapped Transus XML parser,
   or that parser matches the same root element, assumes the wrong field
   names, and silently extracts zero lines — which then looks exactly
   like "every one of bol's lines is missing from the supplier," a
   misleading symptom of a parsing gap, not a real mapping issue.

**`detectMsgType` bare-substring trap**: matching on a literal tag-name
substring without a tag-boundary anchor causes real misclassification —
`OrderLine` (no anchor) matched inside UBL's ordinary
`<cac:OrderLineReference>`, and `DespatchAdviceNumber` (no anchor) matched
inside an otherwise normal INVOIC field, both routing whole messages to
the wrong parser entirely. Any new detection regex needs a tag boundary
(`<Foo[\s>]`), not a bare `Foo`.

**Concatenated XML documents**: a real bol export contained two full XML
documents glued together with a stray text line between them (traced to a
Transus retry/regeneration artifact). Detected generically (more than one
`<?xml` declaration in one file, not the specific stray text), each
fragment is trimmed back to its own well-formed closing tag before
parsing (otherwise the *earlier* fragment also fails to parse, since the
stray text sits inside its own slice), and the last parseable document is
used — with a prominent, hard-to-miss banner (not quiet status text)
saying so, because the underlying delivery to Transus genuinely failed and
that needs a real fix upstream, not just a smoother read here.

## 5. Item-matching cascade (GTIN / article code / SSCC)

Built up over several real failures, in this priority order
(`buildKeyResolver`):

1. **Article code**, if it's actually present and shared on **both**
   sides across the whole message.
2. **GTIN** (normalized — see below), if shared on both sides.
3. **SSCC-pallet fallback** (DESADV only, last resort): if *neither*
   identifier system is reliable anywhere in the message, and a specific
   pallet holds exactly **one** item on each side, the SSCC itself already
   uniquely says which item is which — pair them positionally. This only
   fires when the global fallback has already failed everywhere (checked
   first when true, so a line that happens to still carry a real GTIN
   doesn't get matched by that GTIN alone while its actual counterpart —
   which lacks one — falls back to a different key and the two never
   meet). A pallet with **more than one** unidentified item on either side
   still can't be resolved this way — genuine ambiguity stays reported.
4. Whatever identifier the line itself has, even if not shared globally.
5. No match possible.

**GTIN normalization**: GTIN-8/12/13/14 are the same product at different
lengths — strip leading zeros before comparing (`normalizeGtin`), applied
everywhere a GTIN is used as a match key (line matching, pallet mapping,
pallet-EAN-repeated-as-item checks). Separately, an all-zeros GTIN
(`0000000000000`) gets normalized to an **empty string** at parse time,
not to a numeral — treat `''`/`null` as "no GTIN," not as a valid key of
its own, or every blanked line in a message collapses into one phantom
aggregate item.

**Charge/line matching**: match a line-level charge to its line by the
line's **GTIN**, not by the raw line-reference number — different
dialects number lines completely differently (e.g. a supplier's own
`"10000"`/`"20000"` vs. bol's UBL `"1"`/`"2"` `InvoiceLine` IDs), so the
exact same charge on the exact same line looks unrelated if matched on
line numbering alone.

## 6. Known EDIFACT/qualifier quirks (real production data)

- **MOA qualifiers for "payable"**: `9` (Amount due) is common; `77`
  (Invoice amount) is a real, valid alternative some suppliers use for the
  identical concept — recognized as a fallback (never overriding `9` if
  both appear).
- **MOA `25`** ("Charge/allowance basis" per the official EDIFACT 5025
  code list) is used by some suppliers as if it directly stated the
  ALC amount — recognized as a fallback amount source for a charge/
  allowance, since the alternative (silently treating it as "no amount
  sent," defaulting to 0) is worse.
- **An `ALC` segment with no following `MOA` at all** means "no amount was
  sent," which must render as `—`, never as `0.00` — a `0.00` display
  looks like a real, business-meaningful zero rather than "nothing was
  stated."
- **Line-level allowances (discounts) are deliberately dropped by bol's
  invoice process** — confirmed via a real Transus support ticket: bol's
  documented process (since 2015) only forwards article-level *charges*,
  never article-level *allowances*. A line-level allowance present only in
  the supplier message is therefore **expected**, not a mapping gap —
  shown in the Charges & Allowances table as "Not forwarded (expected)",
  not flagged as a Transformation difference. Line-level *charges* are
  still expected to be forwarded and are compared normally.
- **A `TAX` segment with a category but no rate** (e.g. `TAX+7+VAT++++E'`
  instead of `TAX+7+VAT+++:::0+E'`) is a real, confirmed cause of Transus
  rejecting a message outright ("Couldn't parse XML content" / validation
  failure tickets). Flagged as a Message check, grouped by (type,
  category) pair so a supplier tripping it on every line gets one note.
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
- **Credit notes**: EDIFACT's own BGM function code (381/384) is
  authoritative for detecting a credit note — bol's `InvoiceTypeCode`
  isn't reliable (looks constant regardless of document type). Bol's own
  negative-totals signal is only trusted as *confirmation* once the
  supplier's BGM has already said "credit note," never as the sole
  trigger — otherwise a normal invoice with one negative/return line would
  be misread as a credit note. Quantities/amounts are then compared by
  absolute value, since sign convention differs between supplier and bol.

## 7. UI/UX conventions

- Icons: **⚠** errors, **!** warnings, **ⓘ** info, **✓** ok. Never ✕ or a
  bare "i".
- Terminology: **"EAN"** in all visible text (internal variable/field
  names stay `gtin`); **"Packing reference"**, not "Despatch note".
- A clickable *value* jumps to the source text. A separate, small **↗**
  icon opens an external tool (Summa for EAN→product page, Purple for
  order→trace). Never combine the two actions into one click target.
- Large lists (pallets, lines) collapse/filter past roughly 20 items, with
  sensible defaults, but always with a way to still see everything.
- Status text is always specific ("No SSCC — can't match"), never vague
  ("Not applicable" used as a catch-all).
- The legend block stays in sync with whatever terms are actually in use
  elsewhere in the UI.
- On mobile-width layouts, keep responses/labels short — this is a tool
  people glance at, not read end to end.

## 8. Testing methodology — non-negotiable

1. **Never** conclude a fix works from theory. Test against the actual
   uploaded production message (or a synthetic file built to reproduce
   its exact structure) every time.
2. Keep a running regression suite and re-run **all** of it after every
   change, not just the scenario just touched. (This project's suite grew
   to 14 checks across ORDRSP/DESADV/INVOIC/ORDERS; recreate it early in
   any new working session — see the specific scenarios listed below.)
3. Use a headless browser (Playwright) to functionally test the actual
   tool — open the file, set both sides, click Compare / run Quick check,
   read the rendered result — not just code review.
4. `node --check` on the extracted `<script>` block after every edit,
   before functional testing.
5. When a test's *own* assertion fails, check whether the assertion is
   stale before assuming the application regressed — this happened
   several times in this project (a test asserting old wording, a
   deliberately-changed behaviour, a case-sensitivity mismatch against
   CSS-transformed text).

**Regression scenarios worth keeping a synthetic fixture for** (each one
caught a real, otherwise-invisible bug):
- ORDRSP: action-6-without-backorder findings grouped into one block, not
  repeated per line.
- DESADV: GTIN-12/13 leading-zero padding normalized across sides.
- DESADV: bol's GTIN blanked entirely, falls back to article code.
- DESADV: bol's GTIN blanked **and** no article code anywhere — resolved
  via single-item-per-pallet SSCC pairing, not left as "missing".
- DESADV: pallet-weight sum vs. shipment-total mismatch detected.
- DESADV: blank `LIN'` segments detected and excluded from the line count.
- INVOIC: multiple VAT-rate groups summed correctly for the taxable total
  (both the TRANSUSXML-style and bol's-own-UBL-style aggregation).
- INVOIC: TAX segment missing rate detected and grouped.
- INVOIC: qty×price vs. line-amount gap flagged only outside a rounding
  tolerance, and never sent to Transus.
- INVOIC: line-level allowance correctly shown as "not forwarded
  (expected)", not as a difference.
- INVOIC: a UBL line-amount gap that exactly matches a charge is treated
  as a match, not a difference.
- ORDERS: readable in Quick check; still declined in Compare.
- A ZIP with only one usable file switches to Quick check with a clear,
  readable (not instant/jarring) explanation, rather than failing.

## 9. Open questions / things future work should revisit

- The generic Transus `<Invoice>`/`<CreditNote>`-wrapped XML parser and
  the newer TRANSUSXML/Exact-Online parsers all coexist with their own
  detection heuristics, checked in a specific priority order in
  `parseInvoices`. Any *new* invoice dialect must be detected **before**
  the generic one, with a distinguishing signal specific enough that it
  can't accidentally match another dialect's root element.
- The "Line amount includes charges" UBL-vs-EDIFACT reconciliation
  currently only accounts for **charges** (not allowances) on the line
  being compared — if a future format bakes allowances into its own line
  amount the same way, that comparison will need the equivalent
  allowance-aware adjustment.
- No confirmed real example yet of a **credit note** in either the
  TRANSUSXML or Exact Online dialects — both currently fall back to
  "negative total ⇒ credit" with no independent type-flag confirmation,
  unlike EDIFACT's authoritative BGM code. Revisit if/when a real example
  surfaces.
