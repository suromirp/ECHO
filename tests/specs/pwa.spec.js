const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp } = require('../helpers');

const ROOT = path.join(__dirname, '..', '..');
const ZIP = path.join(__dirname, '..', 'fixtures', 'zip', 'Message_ID_100000001.zip');
// Synthetic, minimal.
const EDI = "UNA:+.? 'UNB+UNOC:3+8700000000001:14+8711382000000:14+260101:1200+1'UNH+1+DESADV:D:96A:UN:EAN005'BGM+351+DESADV0001+9'DTM+137:20260101:102'UNT+4+1'UNZ+1+1'";

// The installable app (docs/ui-conventions.md "Installed app"): the
// manifest and service worker point only at files that exist, and files
// opened with ECHO land where they would if dropped.
test('manifest and service worker point at files that exist', async () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  expect(m.start_url).toBe('./');
  m.icons.forEach(i => expect(fs.existsSync(path.join(ROOT, i.src)), i.src).toBe(true));
  const exts = Object.values(m.file_handlers[0].accept).flat();
  ['.zip', '.xml', '.edi'].forEach(x => expect(exts).toContain(x));
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  files.filter(f => f !== './').forEach(f => expect(fs.existsSync(path.join(ROOT, f)), f).toBe(true));
});

test('files opened with ECHO: a message goes to Quick check, a package to the list, two loose files are not guessed', async ({ page }) => {
  await openApp(page);
  await page.evaluate(edi => openLaunchedFiles([new File([edi], 'one.edi')]), EDI);
  await expect(page.locator('#viewQuick')).toHaveClass(/active/);
  await expect(page.locator('#quickInput')).toHaveValue(/^UNA/);

  await page.evaluate(edi => openLaunchedFiles([new File([edi], 'a.edi'), new File([edi], 'b.edi')]), EDI);
  await expect(page.locator('#quickStatus')).toContainText('To compare two files');

  const zip = fs.readFileSync(ZIP).toString('base64');
  await page.evaluate(b64 => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    openLaunchedFiles([new File([bin], 'pkg.zip', { type: 'application/zip' })]);
  }, zip);
  await expect(page.locator('#viewCompare')).toHaveClass(/active/);
  await expect(page.locator('#results')).toBeVisible({ timeout: 8000 });
});
