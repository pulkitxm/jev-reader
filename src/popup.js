import { progressView } from './progress.js';
const $ = id => document.getElementById(id);
let tab;
let statusTimer;
let starting = false;
let currentStatus = { running: false, count: 0, message: '' };
let revision = 0;
const send = message => chrome.runtime.sendMessage(message).then(result => {
  if (!result?.ok) throw new Error(result?.error || 'The extension could not finish that action.');
  return result;
});
const pageMessage = message => chrome.tabs.sendMessage(tab.id, message);
function showSettings(open) {
  $('settings').hidden = !open;
  $('reader').hidden = open;
  $('settings-toggle').setAttribute('aria-expanded', String(open));
  $('settings-toggle').textContent = open ? 'Back' : 'API key';
  $('settings-toggle').setAttribute('aria-label', open ? 'Back to reader' : 'API key settings');
}
function renderStatus(status) {
  currentStatus = status;
  const view = progressView(status);
  $('activity').hidden = !status.running && !status.message && !view.title;
  $('phase').textContent = view.title || 'Status';
  $('elapsed').textContent = view.elapsed;
  $('elapsed').hidden = !view.elapsed;
  $('progress').textContent = status.message;
  $('section-progress').hidden = !status.running && status.phase !== 'complete';
  if (status.totalSections) $('section-progress').value = view.percent;
  else $('section-progress').removeAttribute('value');
  $('section-count').textContent = view.sections;
  $('checked-count').textContent = view.checked;
  $('explained-count').textContent = view.explained;
  $('metrics').hidden = !status.totalSections;
  $('loading-preview').hidden = !status.running;
  $('analyze').disabled = status.running;
  $('analyze').textContent = status.running ? 'Analyzing…' : status.phase === 'error' ? 'Try again' : 'Analyze';
  $('clear').hidden = !status.running && !status.count;
  $('clear').disabled = status.phase === 'starting';
  $('clear').textContent = status.running ? 'Stop analysis' : 'Clear underlines';
}
function showError(message) {
  renderStatus({ ...currentStatus, running: false, phase: 'error', finishedAt: Date.now(), message });
}
async function refreshStatus() {
  if (!tab?.id || starting) return;
  const requestedRevision = revision;
  try {
    const status = await pageMessage({ type: 'STATUS' });
    if (revision === requestedRevision && !starting) renderStatus(status);
  } catch {
    if (revision !== requestedRevision || starting) return;
    clearInterval(statusTimer);
    if (currentStatus.running) showError('Lost connection to the page. Refresh the article and try again.');
  }
}
setInterval(() => {
  if (currentStatus.running) $('elapsed').textContent = progressView(currentStatus).elapsed;
}, 100);
$('settings-toggle').addEventListener('click', () => showSettings($('settings').hidden));
$('show-key').addEventListener('click', () => {
  const visible = $('api-key').type === 'password';
  $('api-key').type = visible ? 'text' : 'password';
  $('show-key').textContent = visible ? 'Hide' : 'Show';
  $('show-key').setAttribute('aria-label', visible ? 'Hide API key' : 'Show API key');
});
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const result = await send({ type: 'SAVE_SETTINGS', apiKey: $('api-key').value, level: $('level').value });
    $('api-key').value = '';
    $('api-key').type = 'password';
    $('show-key').textContent = 'Show';
    $('show-key').setAttribute('aria-label', 'Show API key');
    $('key-state').textContent = result.hasKey ? 'Key saved. Paste a new key to replace it.' : 'Add a key to analyze pages.';
    $('settings-status').textContent = 'Settings saved.';
  } catch (error) { $('settings-status').textContent = error.message; }
});
$('remove-key').addEventListener('click', async () => {
  try {
    await send({ type: 'REMOVE_KEY' });
    $('api-key').value = '';
    $('key-state').textContent = 'No key saved.';
    $('settings-status').textContent = 'API key removed.';
    if (tab?.id) await pageMessage({ type: 'CLEAR' }).catch(() => {});
  } catch (error) { $('settings-status').textContent = error.message; }
});
$('analyze').addEventListener('click', async () => {
  if (starting || currentStatus.running) return;
  starting = true;
  revision++;
  const startedAt = Date.now();
  renderStatus({ running: true, phase: 'starting', count: 0, startedAt, message: 'Checking settings and connecting to this tab…' });
  try {
    const settings = await send({ type: 'GET_SETTINGS' });
    if (!settings.hasKey) {
      renderStatus({ running: false, count: 0, message: '' });
      showSettings(true);
      $('settings-status').textContent = 'Add your TypeSafe API key first.';
      $('api-key').focus();
      return;
    }
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Open a regular website to analyze it. Browser settings and built-in PDF pages are not supported.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    renderStatus(await pageMessage({ type: 'START', startedAt }));
    clearInterval(statusTimer);
    statusTimer = setInterval(refreshStatus, 350);
  } catch (error) {
    showError(error.message.includes('Cannot access') ? 'This page does not allow extensions. Open the article on its original website.' : error.message);
  } finally { starting = false; }
});
$('clear').addEventListener('click', async () => {
  revision++;
  try { renderStatus(await pageMessage({ type: 'CLEAR' })); } catch { showError('Could not reach the page. Refresh the article to clear old underlines.'); }
});
async function init() {
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const settings = await send({ type: 'GET_SETTINGS' });
    $('level').value = settings.level;
    $('key-state').textContent = settings.hasKey ? 'Key saved. Enter a new key to replace it.' : 'No key saved.';
    if (!settings.hasKey) showSettings(true);
    await refreshStatus();
    statusTimer = setInterval(refreshStatus, 350);
  } catch (error) { showError(error.message); }
}
init();
