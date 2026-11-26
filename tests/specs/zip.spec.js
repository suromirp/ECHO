const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp } = require('../helpers');

const ZIP_FIXTURE = path.join(__dirname, '..', 'fixtures', 'zip', 'single-file.zip');

// docs/testing.md: "A ZIP with only one usable file switches to Quick check
// with a clear, readable (not instant/jarring) explanation, rather than
// failing."
test('a ZIP with only one usable file switches to Quick check with a clear explanation', async ({ page }) => {
  await openApp(page);
  await page.locator('#zipInput').setInputFiles(ZIP_FIXTURE);

  // The switch is intentionally not instant (see index.html's handleZip) —
  // give it time to show the status line, pause, then actually switch tabs.
  await expect(page.locator('#compareStatus')).toContainText('only contains one message', { timeout: 5000 });
  await expect(page.locator('#viewQuick')).toHaveClass(/active/, { timeout: 5000 });
  await expect(page.locator('#tabQuickBtn')).toHaveClass(/active/);

  // The message itself is shown (not just an empty tab switch)...
  await expect(page.locator('#quickInput')).toHaveValue(/DESADV9999/);
  // ...alongside a prominent, hard-to-miss banner explaining what happened.
  const banner = page.locator('#quickOverview .note-inline', { hasText: 'Switched here automatically' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('lonely-message.edi');
});

// JSZip's 'string' output always assumes UTF-8 and ignores a BOM, so a
// UTF-16 XML inside a ZIP was read as garbage (and even routed to the
// EDIFACT parser). Entries are now decoded from their bytes.
test('a UTF-16 XML file inside a ZIP is decoded and compared normally', async ({ page }) => {
  await openApp(page);
  await page.locator('#zipInput').setInputFiles(path.join(__dirname, '..', 'fixtures', 'zip', 'utf16-pair.zip'));
  await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
  const resultsText = await page.locator('#results').innerText();
  expect(resultsText).toContain('Transus XML');
  expect(resultsText).toContain('2/2');
  expect(resultsText).not.toMatch(/missing from the supplier message/);
});

// Several packages at once: they land in a list, the first one opens, and
// clicking another one opens that. One ZIP on its own keeps the old
// behaviour (no list).
test('several ZIPs at once give a clickable package list', async ({ page }) => {
  const dir = path.join(__dirname, '..', 'fixtures', 'zip');
  await openApp(page);
  await page.locator('#zipInput').setInputFiles(path.join(dir, 'Message_ID_100000001.zip'));
  await expect(page.locator('#zipQueue')).toBeHidden();

  await page.locator('#zipInput').setInputFiles([path.join(dir, 'Message_ID_100000001.zip'), path.join(dir, 'utf16-pair.zip')]);
  const items = page.locator('#zipQueue .zq-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveClass(/active/);
  await expect(items.nth(0)).toHaveText('Message_ID_100000001');

  await items.nth(1).click();
  await expect(items.nth(1)).toHaveClass(/active/);
  await expect(items.nth(0)).toHaveClass(/opened/);
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready');
});

// The folder picker itself can't be driven headless, so the directory
// handle is stubbed: the packages in the folder are listed newest first,
// and one that appears later is picked up and opened.
test('a watched download folder lists its packages and picks up a new one', async ({ page }) => {
  const fs = require('fs');
  const dir = path.join(__dirname, '..', 'fixtures', 'zip');
  const b64 = n => fs.readFileSync(path.join(dir, n)).toString('base64');
  await page.addInitScript(({ a, b }) => {
    const mk = (name, data, t) => ({ kind: 'file', name, getFile: async () => new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], name, { lastModified: t }) });
    window.__dir = [mk('older.zip', a, 1000), mk('newer.zip', b, 2000), { kind: 'file', name: 'notes.txt', getFile: async () => new File(['x'], 'notes.txt') }];
    window.__late = mk('arrived-later.zip', a, 3000);
    window.showDirectoryPicker = async () => ({ kind: 'directory', name: 'Downloads', values: async function* () { yield* window.__dir; } });
  }, { a: b64('Message_ID_100000001.zip'), b: b64('utf16-pair.zip') });
  await openApp(page);

  await page.locator('#watchBtn').click();
  const items = page.locator('#zipQueue .zq-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText('newer');
  await expect(page.locator('#watchState')).toContainText('Downloads');
  await expect(page.locator('#watchState')).toContainText('2 packages');

  await page.evaluate(() => window.__dir.push(window.__late));
  await expect(items).toHaveCount(3, { timeout: 8000 });
  await expect(items.nth(0)).toHaveText('arrived-later');
  await expect(items.nth(0)).toHaveClass(/active/);
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready', { timeout: 5000 });

  await page.locator('#watchStopBtn').click();
  await expect(page.locator('#watchBtn')).toBeVisible();
});
