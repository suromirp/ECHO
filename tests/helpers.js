const path = require('path');

// The file under test is the repo's own shipped index.html — this harness
// never touches or forks it, only reads it via file://.
const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const INDEX_URL = 'file://' + INDEX_PATH;

async function openApp(page) {
  await page.goto(INDEX_URL);
}

/** Load supplier + bol fixtures into the Compare tab and run the comparison. */
async function runCompareFixtures(page, supPath, bolPath) {
  await page.locator('#inputSup').setInputFiles(supPath);
  await page.locator('#inputBol').setInputFiles(bolPath);
  await page.locator('#compareBtn').click();
}

/** Load a single fixture into Quick check and run it. */
async function runQuickFixture(page, filePath) {
  await page.locator('#tabQuickBtn').click();
  await page.locator('#quickFileInput').setInputFiles(filePath);
}

/** Text of every rendered finding <li> inside a given findings <ul>, in DOM order. */
async function findingTexts(page, ulSelector) {
  return page.locator(`${ulSelector} li`).allInnerTexts();
}

module.exports = { INDEX_PATH, INDEX_URL, openApp, runCompareFixtures, runQuickFixture, findingTexts };
