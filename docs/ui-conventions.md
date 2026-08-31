# UI/UX conventions

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
  ("Not applicable" used as a catch-all for anything unclear).
- The legend block stays in sync with whatever terms are actually in use
  elsewhere in the UI — if wording changes anywhere, check the legend.
- Screen is assumed to be a phone: keep responses/labels short, this is a
  tool people glance at, not read end to end.

## Grouping repeated findings

Repeated findings of the same underlying pattern are grouped into one
block with the affected items listed as clickable tags
(`groupActionFindings`, `taxIssueFindings`) — never repeated once per
line. A supplier that trips one rule on every line should produce one
explanation with N tags, not a wall of near-identical paragraphs.

Where grouping isn't natural (e.g. a list of genuinely distinct charge
differences), cap-and-summarize instead: show the first handful in full,
then `"N more — see [table] below for the full list."`

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

## Emotional register

The tool has a light, dry sense of humor in its rotating micro-copy (empty
states, easter eggs, loading messages) — this is intentional and adds
warmth to an otherwise dry inspection tool. Keep it dry and self-aware,
never mean, never at the expense of clarity. Findings themselves (the
actual analysis) stay strictly neutral — the personality lives in the
chrome around the findings, not in the findings' own wording.
