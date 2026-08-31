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

## Adding a new regression fixture

Per `docs/testing.md`: when a new bug is found and fixed, add its scenario
to that file's list **and** to this suite in the same commit as the fix —
a new fixture pair under `fixtures/`, and a test asserting the correct
behaviour.
