import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const fixture = await readFile('fixtures/article.html', 'utf8');
await mkdir('artifacts', { recursive: true });
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, colorScheme: 'light', viewport: { width: 1280, height: 960 }, args: [`--disable-extensions-except=${resolve('dist/extension')}`, `--load-extension=${resolve('dist/extension')}`] });
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#api-key').fill('synthetic-test-key');
  await popup.locator('#settings-form .primary').click();
  await popup.getByText('Settings saved.', { exact: true }).waitFor();
  assert.equal(await popup.locator('#api-key').inputValue(), '');
  const storage = await worker.evaluate(() => chrome.storage.local.get('apiKey'));
  assert.equal(storage.apiKey, 'synthetic-test-key');
  await popup.locator('#settings-toggle').click();
  assert.equal(await popup.locator('#theme').count(), 0);
  assert.equal(await popup.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(247, 245, 238)');
  await popup.screenshot({ path: 'artifacts/popup.png' });
  await popup.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await popup.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(24, 36, 30)');
  await popup.screenshot({ path: 'artifacts/popup-dark.png' });
  await popup.locator('#settings-toggle').click();
  await popup.locator('#remove-key').click();
  await popup.getByText('API key removed.', { exact: true }).waitFor();
  assert.deepEqual(await worker.evaluate(() => chrome.storage.local.get('apiKey')), {});
  const page = await context.newPage();
  await page.route('https://reader.test/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.goto('https://reader.test/article');
  await page.evaluate(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = attach.call(this, options);
      if (this.localName === 'jev-reader-overlay') window.readerShadow = root;
      return root;
    };
    window.handlers = [];
    window.chrome = { runtime: { id: 'fixture', onMessage: { addListener: callback => window.handlers.push(callback) }, sendMessage: async message => {
      window.sentBlocks = message.blocks;
      const entries = {
        frustration: { meaning: 'Feeling upset because something is not working.', example: 'She felt frustration when the door would not open.', explanation: 'She was upset because she could not open the door.' },
        pretentious: { meaning: 'Trying too hard to seem important or clever.', example: 'His speech sounded pretentious.', explanation: 'He spoke in a way that tried too hard to impress people.' }
      };
      return { ok: true, candidates: 2, annotations: message.blocks.flatMap(block => [...block.text.matchAll(/frustration|pretentious/g)].map(match => ({ blockId: block.id, start: match.index, end: match.index + match[0].length, word: match[0], ...entries[match[0]] }))) };
    } } };
    window.message = message => new Promise(resolve => window.handlers[0](message, { id: 'fixture' }, resolve));
  });
  await page.addScriptTag({ path: 'dist/extension/content.js' });
  await page.evaluate(() => window.message({ type: 'START' }));
  await page.waitForFunction(async () => !(await window.message({ type: 'STATUS' })).running);
  const status = await page.evaluate(() => window.message({ type: 'STATUS' }));
  assert.equal(status.count, 2);
  assert.ok(!JSON.stringify(await page.evaluate(() => window.sentBlocks)).includes('must be ignored'));
  assert.equal(await page.locator('#target').innerHTML(), 'I used to think that good writing had to sound pretentious. Every sentence needed to prove something. The result was an overwhelming collection of ideas that nobody wanted to read.');
  const point = await page.locator('#target').evaluate(element => {
    const node = element.firstChild;
    const start = node.textContent.indexOf('pretentious');
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 11);
    const rect = range.getBoundingClientRect();
    return { x: rect.x + 15, y: rect.y + 8 };
  });
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'artifacts/reading-light.png' });
  const tipColor = () => page.evaluate(() => getComputedStyle(window.readerShadow.querySelector('.tip')).backgroundColor);
  assert.equal(await tipColor(), 'rgb(255, 254, 247)');
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await tipColor(), 'rgb(32, 42, 37)');
  await page.evaluate(() => document.body.classList.add('dark', 'hostile'));
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await tipColor(), 'rgb(255, 254, 247)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'artifacts/reading-dark.png' });
  await page.evaluate(() => { document.querySelector('#target').textContent = 'This paragraph has been replaced.'; });
  await page.waitForFunction(async () => (await window.message({ type: 'STATUS' })).count === 1);
  await page.evaluate(() => window.message({ type: 'CLEAR' }));
  assert.equal((await page.evaluate(() => window.message({ type: 'STATUS' }))).count, 0);
  console.log('Verified extension settings, key removal, extraction, article preservation, themes, mutation cleanup, and clearing with synthetic data.');
} finally { await context.close(); }
