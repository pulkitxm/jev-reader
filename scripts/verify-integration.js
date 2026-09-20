import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const live = process.env.READER_LIVE_TEST === '1';
if (live && !process.env.TYPESAFE_API_KEY) throw new Error('Set TYPESAFE_API_KEY for live verification.');
const temporary = await mkdtemp(join(tmpdir(), 'reader-verification-'));
const extension = join(temporary, 'extension');
await cp('dist/extension', extension, { recursive: true });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('https://reader.test/*');
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
await mkdir('artifacts', { recursive: true });
const context = await chromium.launchPersistentContext(join(temporary, 'profile'), { channel: 'chromium', headless: true, colorScheme: 'dark', viewport: { width: 1280, height: 960 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
let requestCount = 0;
let failRequests = false;
let releaseRequest;
let requestGate = live ? null : new Promise(resolve => { releaseRequest = resolve; });
try {
  const fixture = await readFile('fixtures/article.html', 'utf8');
  await context.route('https://reader.test/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  if (!live) await context.route('https://api.typesafe.ai/**', async route => {
    requestCount++;
    if (requestGate) await requestGate;
    if (failRequests) return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    const body = route.request().postDataJSON();
    assert.equal(body.model, 'jev-1.13.0');
    const answers = Object.fromEntries(Object.keys(body.questions).map(key => [key, { choice: 'sense_0', confidence: 0.9 }]));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ answers, usage: { input_tokens: 1200, output_tokens: 120 } }) });
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto('https://reader.test/article');
  const popup = await context.newPage();
  await popup.addInitScript(() => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = options => options.active ? query({ url: 'https://reader.test/*' }) : query(options);
  });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#api-key').fill(live ? process.env.TYPESAFE_API_KEY : 'synthetic-test-key');
  await popup.locator('#settings-form .primary').click();
  await popup.getByText('Settings saved.', { exact: true }).waitFor();
  await popup.locator('#settings-toggle').click();
  await popup.locator('#analyze').click();
  if (!live) {
    await popup.waitForFunction(() => document.querySelector('#phase').textContent === 'Checking words with Jev' && document.querySelector('#progress').textContent.includes('candidate words'));
    assert.equal(await popup.locator('#analyze').isDisabled(), true);
    assert.equal(await popup.locator('#loading-preview').isVisible(), true);
    assert.equal(await popup.locator('#section-progress').getAttribute('value'), '0');
    await popup.waitForTimeout(1100);
    const elapsedBefore = parseFloat(await popup.locator('#elapsed').textContent());
    assert.ok(elapsedBefore >= 1);
    await popup.reload();
    await popup.waitForFunction(() => document.querySelector('#phase').textContent === 'Checking words with Jev');
    assert.ok(parseFloat(await popup.locator('#elapsed').textContent()) >= elapsedBefore);
    await popup.locator('body').screenshot({ path: 'artifacts/loading-dark.png' });
    await popup.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    assert.equal(await popup.locator('.skeleton').first().evaluate(element => getComputedStyle(element).animationName), 'none');
    await popup.locator('body').screenshot({ path: 'artifacts/loading-light.png' });
    await popup.emulateMedia({ colorScheme: 'dark' });
    releaseRequest();
    requestGate = null;
  }
  await popup.waitForFunction(() => document.querySelector('#progress').textContent.includes('Coverage:'), null, { timeout: 90000 });
  const progress = await popup.locator('#progress').textContent();
  assert.match(progress, /words explained/);
  assert.equal(await popup.locator('#loading-preview').isVisible(), false);
  assert.equal(await popup.locator('#section-progress').getAttribute('value'), '100');
  const duration = await popup.locator('#elapsed').textContent();
  await popup.waitForTimeout(450);
  assert.equal(await popup.locator('#elapsed').textContent(), duration);
  if (!live) {
    assert.match(await popup.locator('#cost-summary').textContent(), /Estimated cost: \$0.000050/);
    await popup.locator('#cost-summary').click();
    assert.match(await popup.locator('#input-cost').textContent(), /1,200/);
    assert.match(await popup.locator('#output-cost').textContent(), /120.*\$0.00/);
  }
  await popup.locator('body').screenshot({ path: 'artifacts/analysis-complete.png' });
  if (!live) assert.ok(requestCount > 0, 'The installed extension must make an analysis request');
  await page.bringToFront();
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
  await page.waitForTimeout(150);
  const cdp = await context.newCDPSession(page);
  async function tipState() {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    function find(node) {
      if (node.localName === 'section' && node.attributes?.includes('tip')) return node;
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
        const match = find(child);
        if (match) return match;
      }
    }
    const node = find(root);
    assert.ok(node, 'Injected tooltip exists in the isolated shadow root');
    const { object } = await cdp.send('DOM.resolveNode', { nodeId: node.nodeId });
    const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function() { return { visible: this.getClientRects().length > 0, text: this.textContent }; }', returnByValue: true });
    return result.value;
  }
  const tip = await tipState();
  assert.equal(tip.visible, true);
  assert.match(tip.text, /trying too hard/i);
  assert.match(tip.text, /His speech sounded pretentious/);
  await page.screenshot({ path: `artifacts/${live ? 'live' : 'integrated'}-reading.png` });
  await page.keyboard.press('Escape');
  assert.equal((await tipState()).visible, false);
  await popup.bringToFront();
  await popup.locator('#clear').click();
  await popup.waitForFunction(() => document.querySelector('#progress').textContent.includes('Underlines cleared'));
  assert.equal((await tipState()).visible, false);
  if (!live) {
    const requestsBeforeCache = requestCount;
    await popup.locator('#analyze').click();
    await popup.waitForFunction(() => document.querySelector('#phase').textContent === 'Analysis complete');
    assert.equal(requestCount, requestsBeforeCache, 'Cached analysis sends no extra requests');
    assert.equal(await popup.locator('#cache-count').textContent(), '6 cached');
    assert.equal(await popup.locator('#cost-summary').textContent(), 'Estimated cost: $0.00');
    await popup.locator('#settings-toggle').click();
    await popup.locator('#clear-cache').click();
    await popup.getByText('Word cache cleared.', { exact: true }).waitFor();
    await popup.locator('#settings-toggle').click();
    failRequests = true;
    await popup.locator('#analyze').click();
    await popup.waitForFunction(() => document.querySelector('#progress').textContent.includes('rejected the API key'));
    assert.equal((await tipState()).visible, false, 'A failed analysis must never show an empty card');
    assert.equal(await popup.locator('#loading-preview').isVisible(), false);
    assert.equal(await popup.locator('#phase').textContent(), 'Analysis failed');
    assert.equal(await popup.locator('#analyze').textContent(), 'Try again');
    failRequests = false;
    requestGate = new Promise(resolve => { releaseRequest = resolve; });
    await popup.locator('#analyze').click();
    await popup.waitForFunction(() => document.querySelector('#progress').textContent.includes('candidate words'));
    await popup.locator('#clear').click();
    await popup.waitForFunction(() => document.querySelector('#phase').textContent === 'Analysis stopped');
    assert.equal(await popup.locator('#loading-preview').isVisible(), false);
    const stoppedAt = await popup.locator('#elapsed').textContent();
    releaseRequest();
    requestGate = null;
    await popup.waitForTimeout(500);
    assert.equal(await popup.locator('#elapsed').textContent(), stoppedAt);
    assert.equal(await popup.locator('#phase').textContent(), 'Analysis stopped');
  }
  console.log(JSON.stringify({ installedExtension: true, liveJev: live, progress, hoverExplanation: true, clearHidesCard: true, authenticationErrorChecked: !live }));
} finally {
  await context.close();
  await rm(temporary, { recursive: true, force: true });
}
