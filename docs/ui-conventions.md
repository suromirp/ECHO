# UI/UX conventions

- Icons: **⚠** errors, **!** warnings, **ⓘ** info, **✓** ok. Never ✕ or a
  bare "i".
- Quick check shows its single-message checks as one **Findings** list for
  every message type, and the ECHO signal reacts to the worst level in it.
  INVOIC's list is split into Message checks / Good to know like Compare
  (`quickFindingsHtml`); it used to be loose notes with ⚠ on warnings and a
  signal that always said "all good".
- Terminology: **"EAN"** in all visible text (internal variable/field
  names stay `gtin`); **"Packing reference"**, not "Despatch note";
  **"Distinct items"**, not "Items" — a bare "Items" count reads as a
  quantity/pallet count at a glance (real user confusion, ORDRSP/DESADV
  Compare strip); it's actually the number of distinct EAN/article
  matches. Pair a distinct-count stat with a tooltip spelling out what it
  is *not* counting, not just what it is.
- A clickable *value* jumps to the source text. A separate, small **↗**
  icon opens an external tool (Summa for EAN→product page, Purple for
  order→trace). Never combine the two actions into one click target.
- Large lists (pallets, lines, tag lists in findings, order numbers in the
  strip and header table) collapse/filter past roughly 20 items, with
  sensible defaults, but always with a way to still see everything.
- One search box (Compare and Quick check each have their own) filters
  Amendment details, the line table, and the pallet/SSCC overview
  together, live, by EAN, order number, SSCC or article code — not a
  separate box per table. A search match always overrides the "only show
  differences"/"only show flagged" filter and any collapsed-list state
  (e.g. Amendment details' "Show all" button), never gets hidden by
  either — the whole point of searching is to find one specific thing
  regardless of its status. The box sits just above the tables it
  filters, not at the very top of the results, above summary content
  (verdict, stats, action overview) it has nothing to do with.
- Amendment details (backorder/amendment lines) collapses past 5 rows
  behind a "Show all N amendment lines" button, the same treatment as the
  pallet overview — it's meant as a quick highlight list, not a second
  copy of the full Lines/Line-comparison table.
- Status text is always specific ("No SSCC — can't match"), never vague
  ("Not applicable" used as a catch-all for anything unclear).
- The legend block stays in sync with whatever terms are actually in use
  elsewhere in the UI — if wording changes anywhere, check the legend.
- Desktop first (colleagues use it on a laptop/desktop); mobile is not a
  priority beyond no horizontal page scroll. Still keep labels short: this
  is a tool people glance at, not read end to end.

## Verdict

The verdict box at the top of Compare (ORDRSP/DESADV and INVOIC) has three
lines, built by one helper (`verdictModel`):

1. **Headline**, descriptive: "Bol's output differs from the supplier
   message" (any `cat:'diff'` finding at err/warn), "The mapping looks
   right; the supplier message has something worth a look" (only
   `cat:'message'` at err/warn; names bol's output or both messages when
   that's where the checks are), or "Bol's output matches the supplier
   message". INVOIC says "invoice" instead of "message"/"output".
2. **Playful line**, small and italic: "Something got lost in translation."
   (only with a `cat:'diff'` finding at err), "Almost in sync." (any other
   err/warn), "Loud and clear." (none). The rotating quip may follow it.
3. **Where to look**, one line, derived from the findings' `cat`: the
   section to read first with a count and a link that scrolls to it
   (Transformation differences → mapping question, "Copy for Transus";
   Message checks → which message, "Nothing here for Transus"; otherwise
   "Nothing to act on", naming the sections that only hold notes). A
   Worth-checking count is appended when there is one.

The icon and colour are the worst level among the err/warn findings of any
`cat`: an err Message check shows ⚠, never an orange "!". Only the
headline and playful line stay calm for Message checks (rule 7).

## Result layout

Desktop first. Compare (ORDRSP/DESADV): verdict → Findings (Message
checks, Transformation differences, Good to know, then a small **Worth
checking** group, Copy buttons) → stats strip → Header fields (collapsed)
→ action overview (ORDRSP) → search box → Amendment details → Line
comparison → Pallet / SSCC overview → original messages. INVOIC: verdict →
Findings → stats strip → Invoice details (collapsed) → Line comparison →
Charges & allowances → Totals → overviews → original messages. Quick check
follows the same idea (summary line, Findings, fields, search, tables).

Quick check opens with a one-line summary above its Findings ("Nothing
unusual found. ECHO ran its checks on this DESADV (12 lines)" or "3 things
to look at … — see Findings below"), so a clean result never reads as "not
checked". Its Order(s) field collapses past ~20 orders and its Lines /
Invoice lines tables show the first 20 rows behind "Show all N lines" (a
search match still shows). The status line under the input says the
overview is *below*. XML on one long line is indented for display only
(Quick check and Compare's original messages), so jump-to-source lands on
the line with the value; Copy keeps the original text. "Import file" is
styled as a button.

Worth checking items use the documented **!** icon (warn colour), not an
eye; they never count towards the verdict.

## Header fields table

In Compare (ORDRSP/DESADV), right under the stats: one row per header field,
supplier value and bol value, each with the field it came from in small
type. ✓ = same, ≠ = differs (row highlighted), · = only on one side. Only
on one side is not flagged, because formats differ in what they carry. The
table only shows values; findings come from their own checks. It is always
collapsed (findings come first); its summary line says how many fields
differ ("3 differ") or "all shared fields match". INVOIC's Invoice details
table is collapsed the same way.

## Short findings, details behind "More info"

A finding shows a short headline plus the affected values (tags, old → new),
so the panel reads as a quick overview. The why and what-to-do go inside
`moreInfo(...)`, a collapsed `<details class="f-more">` toggle. "Copy
report" includes that text (without the toggle label). "Copy for Transus"
leaves it out and sends only the headline. "Copy report" marks each line
by section, never by severity: `[DIFFERENCE]` (Transformation differences),
`[CHECK]` (Message checks), `[INFO]`, `[OK]`. Applied to every finding
whose visible text ran past ~150 characters (ORDRSP, DESADV and INVOIC).
New findings follow the same shape: if the visible part needs more than
one sentence, the rest belongs in `moreInfo`.

## One finding per cause

- A per-side Message check that bol's output carries unchanged (same text
  apart from the side label) is reported once, as "Supplier (passed on
  unchanged to bol) — …", jumping to both sides (`perSideOnce`, used for
  every per-side check in Compare: GS1 check digit, RFF+BM length, pallet
  structure, ORDRSP action rules, DTM duplicates, no price, blank LIN, TAX
  issues, illegal characters, lines without an identifier, …). Only when
  the two sides differ does each get its own.
- Effects of one cause are sub-lines of its finding (`↳`, `.f-effects`),
  not findings of their own: an SSCC in a CPS without PAC lists "None of
  these SSCCs is in bol's output" and the SSCC-length note on the same
  values as lines of the PAC finding.
- One pattern is explained in one place: ORDRSP's date-only action 6 that
  bol carries as action 5 is the Good-to-know note only (not also a Message
  check, Amendment details rows and a badge suffix).
- INVOIC header rows and totals that are only on one side live in their
  table (Invoice details, Totals); a finding only exists when it adds an
  explanation (the RFF+CO order note). Rounding gaps on two or more lines
  are one grouped finding with a tag per EAN.

## Tables never contradict findings

- A line whose EAN bol's output replaced by zeros shows `supplier EAN →
  0000000000000` in the line table (Compare and INVOIC) with status
  Difference; the row used to say Match because the lines were still
  paired.
- The pallet / SSCC overview never shows a plain Match/OK pill for an SSCC
  a finding is about (`ssccFindingFlags`): a "Pallet mapping differs" or a
  zeroed-EAN SSCC is a Difference on both sides with the reason in small
  type; a Message check on the SSCC itself (check digit doesn't match, no
  PAC, not 18 characters, a zeroed EAN in Quick check) gives a "!" pill
  naming it. An SSCC in a PAC-less CPS reads "Not in bol's output (no
  PAC)", and the panel's summary points at the PAC finding instead of
  listing the same SSCCs again.
- The Quantities tile is labelled "Quantities (per EAN)" with a tooltip:
  it compares totals per EAN, nothing about dates, pallets, order numbers
  or zeroed EANs.

## Grouping repeated findings

Repeated findings of the same underlying pattern are grouped into one
block with the affected items listed as clickable tags
(`groupActionFindings`, `taxIssueFindings`) — never repeated once per
line. A supplier that trips one rule on every line should produce one
explanation with N tags, not a wall of near-identical paragraphs.

Where grouping isn't natural (e.g. a list of genuinely distinct charge
differences), cap-and-summarize instead: show the first handful in full,
then `"N more — see [table] below for the full list."` INVOIC's per-EAN
findings (missing on one side, and each "<field> differs" kind) use the same
`addCapped` pattern as ORDRSP/DESADV; they used to print one finding per EAN
uncapped. Ambiguous references are grouped per side and field, EANs as tags.

## Pill / status vocabulary

Keep these six meanings distinct and don't blur them:

- **Match** — compared values are the same.
- **Difference** — compared values differ, worth checking.
- **Check** — a minor difference; the important values still match.
- **Not applicable** — the field isn't sent on either side, so it can't be
  compared at all.
- **Info** — an expected, soft difference, not counted as a mismatch.
- **OK** — no structural issue found (used for single-message checks with
  nothing to compare against).

A field absent on both sides is **Not applicable**, never **Match** (INVOIC's
Invoice details table used to show "Match" for, e.g., a packing reference
neither side sent). Info-level findings pass `cat:'info'` explicitly:
`compareInvoice`'s `add()` defaults to `'diff'`, and an info note left there
ended up in "Copy for Transus" (credit-note note, soft header rows, "not
compared", a total sent on one side only).

## Emotional register

The tool has a light, dry sense of humor in its rotating micro-copy (empty
states, easter eggs, loading messages) — this is intentional and adds
warmth to an otherwise dry inspection tool. Keep it dry and self-aware,
never mean, never at the expense of clarity. Findings themselves (the
actual analysis) stay strictly neutral — the personality lives in the
chrome around the findings, not in the findings' own wording.
