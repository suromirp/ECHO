# ECHO — EDI Message Inspector

Standing reference. Read this before making changes. For deep detail, see
the linked files in `docs/` — they're not auto-loaded, open them when the
task actually touches that area.

## What ECHO is

A single, self-contained HTML file (`index.html`) — no server, no build
step, no dependencies beyond what's inlined — for bol.com's non-EDI-expert
OSM/EDI colleagues. It parses and compares EDIFACT and Transus/UBL XML
messages (ORDRSP, DESADV, INVOIC) entirely in the browser; no data leaves
the machine.

Two modes: **Compare** (supplier ↔ bol, did the transformation preserve
the data?) and **Quick check** (one message, what does it say / is
anything worth a second look?).

**Parity rule**: any check that's really about *one side's own message*
(missing SSCC, missing order number, a blank segment, internal arithmetic
not reconciling) must exist in **both** modes. Only checks that inherently
need two messages to compare are Compare-only. Every time this project
shipped a check in only one mode, it was an oversight, not a choice — when
adding a check, explicitly ask which category it's in.

Distribution: public repo `suromirp/ECHO`, GitHub Pages.

## Seven rules — do not deviate

1. **Understand → normalize → compare.** Never a raw structural diff,
   never strict spec enforcement.
2. **Never claim a message is valid/invalid.** Report what's observed, in
   neutral language — even for checks that feel like they're catching a
   "mistake" (see `docs/formats-and-quirks.md` for why this is harder than
   it sounds once checks get smarter).
3. **Technical/structural difference (expected, not worth a mention) vs.
   business difference (worth flagging)** — the single biggest source of
   false "bugs" in this project's history. When in doubt, it's usually
   structural.
4. **Zero hardcoded EANs/SSCCs/order numbers/quantities in the logic.**
5. **Read the raw source data before concluding anything looks like a
   bug.** Every real fix here started with the actual EDIFACT segments or
   XML, not ECHO's rendered output.
6. **Verify claims about external systems (bol's mapping, Transus,
   another tool's analysis) against the raw data yourself** before
   agreeing with them.
7. **A finding that could read as "you did something wrong" needs a
   generous tolerance and neutral framing, or it shouldn't exist.**

## Finding taxonomy

Every finding has a `level` (icon) and a `cat` (section + Transus
eligibility) — orthogonal, don't conflate them.

- **Message checks** (`cat:'message'`) — about one side's own message.
  Never reaches "Copy for Transus."
- **Transformation differences** (`cat:'diff'`) — a real mapping question.
  This is what "Copy for Transus" pulls from.
- **Good to know** (`cat:'info'`) — expected, non-problematic.

Repeated findings of the same pattern group into one block with affected
items as tags — never a wall of near-identical paragraphs. See
`docs/ui-conventions.md`.

## Map of the detail docs

- `docs/formats-and-quirks.md` — the four XML dialects in the wild, their
  specific traps, and every confirmed EDIFACT/qualifier-code quirk found
  in real production data. **Read before touching any parser.**
- `docs/matching.md` — the GTIN/article-code/SSCC identifier-matching
  cascade. **Read before touching anything that matches lines/items
  across sides.**
- `docs/ui-conventions.md` — icons, terminology, clickable-value
  conventions, list-collapsing rules.
- `docs/testing.md` — mandatory methodology + the regression fixture list.
  **Read before shipping any change**, and run the suite after every one.

## Open questions

- New invoice dialects must be detected **before** the generic
  `<Invoice>`/`<CreditNote>`-wrapped Transus XML parser, with a signal
  specific enough it can't match another dialect's root element by
  accident.
- The UBL-line-amount-includes-charges reconciliation only accounts for
  charges, not allowances, on the compared line — extend if a future
  format bakes allowances in the same way.
- No confirmed real credit-note example yet in the TRANSUSXML or Exact
  Online dialects — both fall back to sign-of-total with no independent
  type-flag confirmation, unlike EDIFACT's BGM code. Revisit when one
  surfaces.

**This file is a living document.** When a new real bug/pattern is found,
add it to the relevant `docs/*.md` file in the same commit as the fix —
not as an afterthought.
