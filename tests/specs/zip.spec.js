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
  await expect(items.nth(0)).toContainText('Message_ID_100000001');
  // The opened package carries the level of its verdict card; the other
  // one has no mark yet, so "Check all" is offered.
  const cardLevel = (await page.locator('#verdict').getAttribute('class')).replace('verdict ', '');
  await expect(items.nth(0).locator('.zq-lv')).toHaveClass(new RegExp(cardLevel));
  await expect(items.nth(1).locator('.zq-lv')).toHaveCount(0);
  await expect(page.locator('#zipQueue .zq-check')).toBeVisible();
  // ...but its message type is already named, before it is opened.
  await expect(items.nth(1).locator('.zq-kind')).toHaveText('Despatch advice');

  await items.nth(1).click();
  await expect(items.nth(1)).toHaveClass(/active/);
  await expect(items.nth(0)).toHaveClass(/opened/);
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready');
});

// Packages that arrive one at a time (dropped separately, or sent one by
// one from the portal) build the list too: the second arrival starts it and
// the first is kept in it. The same package again does not.
test('ZIPs arriving one by one build the package list', async ({ page }) => {
  const dir = path.join(__dirname, '..', 'fixtures', 'zip');
  await openApp(page);
  await page.locator('#zipInput').setInputFiles(path.join(dir, 'Message_ID_100000001.zip'));
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready');
  await page.locator('#zipInput').setInputFiles(path.join(dir, 'Message_ID_100000001.zip'));
  await expect(page.locator('#zipQueue')).toBeHidden();
  await page.locator('#zipInput').setInputFiles(path.join(dir, 'utf16-pair.zip'));
  const items = page.locator('#zipQueue .zq-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Message_ID_100000001');
  await expect(items.nth(0)).toHaveClass(/opened/);
  await expect(items.nth(1)).toHaveClass(/active/);
  await expect(items.nth(1).locator('.zq-lv')).toHaveCount(1);
});

// "Check all" runs every unmarked package once, so the list shows which
// ones are worth opening. A single message gets its own neutral mark
// instead of a level, and does not pull the view over to Quick check
// during the run. An order pair is compared like any other.
test('Check all marks every package in the list', async ({ page }) => {
  const dir = path.join(__dirname, '..', 'fixtures', 'zip');
  await openApp(page);
  await page.locator('#zipInput').setInputFiles(['Message_ID_100000001.zip', 'order-pair.zip', 'single-file.zip', 'utf16-pair.zip'].map(f => path.join(dir, f)));
  const items = page.locator('#zipQueue .zq-item');
  await expect(items).toHaveCount(4);
  await page.locator('#zipQueue .zq-check').click();
  await expect(page.locator('#zipQueue .zq-lv')).toHaveCount(4);
  await expect(page.locator('#zipQueue .zq-check')).toHaveCount(0);
  // Each button also says what kind of message the package holds.
  await expect(page.locator('#zipQueue .zq-kind')).toHaveCount(4);
  await expect(items.nth(1).locator('.zq-kind')).toHaveText('Order');
  await expect(items.nth(0).locator('.zq-kind')).toHaveText(/Order response|Despatch advice|Invoice/);
  await expect(items.nth(1).locator('.zq-lv')).toHaveClass(/\b(ok|warn|err)\b/);
  await expect(items.nth(2).locator('.zq-lv')).toHaveClass(/single/);
  await expect(items.nth(0).locator('.zq-lv')).toHaveClass(/\b(ok|warn|err)\b/);
  await expect(page.locator('#viewCompare')).toHaveClass(/active/);
  await expect(page.locator('#zipQueue .zq-item.active')).toHaveCount(1);
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

  // The folder controls sit behind a collapsed Settings line.
  await expect(page.locator('#watchBtn')).toBeHidden();
  await page.locator('#zipMore > summary').click();
  await page.locator('#watchBtn').click();
  const items = page.locator('#zipQueue .zq-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0).locator('.zq-name')).toHaveText('newer');
  await expect(page.locator('#watchState')).toContainText('Downloads');
  await expect(page.locator('#watchState')).toContainText('2 packages');

  await page.evaluate(() => window.__dir.push(window.__late));
  await expect(items).toHaveCount(3, { timeout: 8000 });
  await expect(items.nth(0)).toContainText('arrived-later');
  await expect(items.nth(0)).toHaveClass(/active/);
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready', { timeout: 5000 });

  await page.locator('#watchStopBtn').click();
  await expect(page.locator('#watchBtn')).toBeVisible();
});

// A helper in the browser may hand over what the portal knows about a
// package together with the file. It is shown, a link is only kept when it
// points at the portal, and the order button only appears when a helper
// announced itself.
test('package details handed over with the file are shown; a foreign link is dropped', async ({ page }) => {
  const dir = path.join(__dirname, '..', 'fixtures', 'zip');
  await openApp(page);
  await expect(page.locator('#orderFetchBtn')).toBeHidden();
  await page.evaluate(() => {
    document.documentElement.dataset.pkgBridge = '1';
    document.getElementById('zipInput').dataset.pkgMeta = JSON.stringify({
      'Message_ID_100000001.zip': { supplier: 'Supplier Alfa', status: 'Delivery error', reason: 'Unit price is unknown; item EAN: <i>8700000000015</i>', url: 'https://online.transus.com/Messages/MessageDetails.aspx?mid=1' },
      'utf16-pair.zip': { supplier: 'Supplier <b>Bravo</b>', url: 'https://example.com/x' },
    });
  });
  await page.locator('#zipInput').setInputFiles([path.join(dir, 'Message_ID_100000001.zip'), path.join(dir, 'utf16-pair.zip')]);
  const items = page.locator('#zipQueue .zq-item');
  await expect(items.nth(0).locator('.zq-supplier')).toHaveText('Supplier Alfa');
  await expect(items.nth(1).locator('.zq-supplier')).toHaveText('Supplier <b>Bravo</b>');
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready');
  await expect(page.locator('#importSum .pkg-status')).toHaveText('Transus: Delivery error');
  await expect(page.locator('#importSum .pkg-reason')).toHaveText('Transus says: Unit price is unknown; item EAN: <i>8700000000015</i>');
  await expect(page.locator('#importSum .pkg-link')).toHaveAttribute('href', /^https:\/\/online\.transus\.com\//);
  const btn = page.locator('#orderFetchBtn');
  await expect(btn).toBeVisible();
  expect(await btn.getAttribute('data-order')).toMatch(/\d/);

  await items.nth(1).click();
  await expect(items.nth(1)).toHaveClass(/active/);
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready');
  await expect(page.locator('#importSum .pkg-link')).toHaveCount(0);
});

// Three ways to work through a longer list: step with the keyboard, search
// every package for a value, and (tucked away) put two messages from one
// supplier side by side to see what each is built from.
test('package list: keyboard steps, search across packages, build-up of two messages', async ({ page }) => {
  const dir = path.join(__dirname, '..', 'fixtures', 'zip');
  await openApp(page);
  await page.locator('#zipInput').setInputFiles([path.join(dir, 'Message_ID_100000001.zip'), path.join(dir, 'utf16-pair.zip'), path.join(dir, 'order-pair.zip')]);
  const items = page.locator('#zipQueue .zq-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toHaveClass(/active/);
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready');

  // Alt+Down opens the next package, Alt+Up goes back.
  await page.keyboard.press('Alt+ArrowDown');
  await expect(items.nth(1)).toHaveClass(/active/);
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready');
  await page.keyboard.press('Alt+ArrowUp');
  await expect(items.nth(0)).toHaveClass(/active/);
  // With a row selected, the plain arrows do the same.
  await items.nth(0).click();
  await expect(page.locator('#compareStatus')).toContainText('Comparison ready');
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toHaveClass(/active/);

  // Search: a value from the first package leaves only that package, and
  // the field keeps the cursor while the list is redrawn.
  const sscc = await page.evaluate(() => (/\d{18}/.exec(zipQ[0].hay) || [''])[0]);
  expect(sscc).toHaveLength(18);
  const find = page.locator('#zqFind');
  await find.click();
  await page.keyboard.type(sscc.slice(0, 12));
  await expect(find).toBeFocused();
  await expect(find).toHaveValue(sscc.slice(0, 12));
  await expect(items).toHaveCount(await page.evaluate(v => zipQ.filter(q => q.hay.includes(v)).length, sscc.slice(0, 12)));
  await expect(items.first()).toContainText('Message_ID_100000001');
  await find.fill('zzzz-not-there');
  await expect(items).toHaveCount(0);
  await expect(page.locator('#zipQueue .zq-none')).toContainText('No package contains');
  await find.fill('');
  await expect(items).toHaveCount(3);

  // Build-up: different formats are said so, not diffed.
  // It lives behind Settings, so it is not on screen until asked for.
  const pair = page.locator('#zqPair');
  await expect(pair).toBeHidden();
  await page.locator('#zipMore > summary').click();
  await expect(pair).toBeVisible();
  await expect(page.locator('#zqPairBtn')).toBeHidden();
  await pair.locator('summary').click();
  await page.locator('#zqPairBtn').click();
  const kinds = await page.evaluate(() => [msgShape(zipQ[0].supText).kind, msgShape(zipQ[1].supText).kind]);
  await expect(page.locator('#zqPairOut')).toContainText(kinds[0] === kinds[1] ? 'Values are not compared' : 'different formats');

  // The comparison itself: presence of segment + qualifier, never values.
  const d = await page.evaluate(() => {
    const a = "UNH+1+DESADV:D:96A:UN'BGM+351+A1+9'DTM+137:20260101:102'DTM+132:20260105:102'RFF+ON:111'CPS+1'LIN+1++1111111111116:SRV'QTY+12:5'UNT+8+1'";
    const b = "UNH+1+DESADV:D:96A:UN'BGM+351+B2+9'DTM+137:20260201:102'RFF+ON:222'CPS+1'PAC+1'LIN+1++2222222222222:SRV'QTY+12:9'LIN+2++3333333333338:SRV'QTY+12:1'UNT+10+1'";
    return msgShapeDiff(msgShape(a), msgShape(b));
  });
  expect(d.onlyA).toEqual(['DTM+132']);
  expect(d.onlyB).toEqual(['PAC']);
  expect(d.both).toBe(6);
});

test('install note for the Transus helper shows only without the helper', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#zipMore')).toBeVisible();
  await page.locator('#zipMore > summary').click();
  await expect(page.locator('#pkgHelp')).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.pkgBridge = '1'; });
  await expect(page.locator('#pkgHelp')).toBeHidden();
});

// Packages can be saved back out of the list and taken off it, one at a
// time or all at once. Removing never touches a file on disk.
test('packages can be downloaded and removed, one or all', async ({ page }) => {
  const dir = path.join(__dirname, '..', 'fixtures', 'zip');
  await openApp(page);
  await page.locator('#zipInput').setInputFiles(['Message_ID_100000001.zip', 'order-pair.zip', 'utf16-pair.zip'].map(f => path.join(dir, f)));
  const items = page.locator('#zipQueue .zq-item');
  await expect(items).toHaveCount(3);
  const [one] = await Promise.all([page.waitForEvent('download'), page.locator('#zipQueue .zq-dl').nth(1).click()]);
  expect(one.suggestedFilename()).toBe('order-pair.zip');
  const [all] = await Promise.all([page.waitForEvent('download'), page.locator('#zipQueue .zq-dl-all').click()]);
  expect(all.suggestedFilename()).toBe('echo-packages.zip');
  // Removing the open package clears its result.
  await expect(page.locator('#zipQueue .zq-item.active')).toHaveCount(1);
  await page.locator('#zipQueue .zq-row:has(.zq-item.active) .zq-rm').click();
  await expect(items).toHaveCount(2);
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('#zipQueue .zq-rm-all').click();
  await expect(page.locator('#zipQueue')).toBeHidden();
});
