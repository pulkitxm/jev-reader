const $ = id => document.getElementById(id);
let tab;
let statusTimer;
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
  $('progress').textContent = status.message;
  $('analyze').disabled = status.running;
  $('analyze').textContent = status.running ? 'Analyzing…' : 'Analyze';
  $('clear').hidden = !status.running && !status.count;
  $('clear').textContent = status.running ? 'Stop analysis' : 'Clear underlines';
}
async function refreshStatus() {
  if (!tab?.id) return;
  try { renderStatus(await pageMessage({ type: 'STATUS' })); } catch { clearInterval(statusTimer); }
}
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
  $('analyze').disabled = true;
  try {
    const settings = await send({ type: 'GET_SETTINGS' });
    if (!settings.hasKey) {
      showSettings(true);
      $('settings-status').textContent = 'Add your TypeSafe API key first.';
      $('api-key').focus();
      return;
    }
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Open a regular website to analyze it. Browser settings and built-in PDF pages are not supported.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await pageMessage({ type: 'START' });
    clearInterval(statusTimer);
    statusTimer = setInterval(refreshStatus, 700);
    await refreshStatus();
  } catch (error) {
    $('progress').textContent = error.message.includes('Cannot access') ? 'This page does not allow extensions. Open the article on its original website.' : error.message;
  } finally { $('analyze').disabled = false; }
});
$('clear').addEventListener('click', async () => {
  try { await pageMessage({ type: 'CLEAR' }); await refreshStatus(); } catch { $('progress').textContent = 'No underlines on this page.'; }
});
async function init() {
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const settings = await send({ type: 'GET_SETTINGS' });
    $('level').value = settings.level;
    $('key-state').textContent = settings.hasKey ? 'Key saved. Enter a new key to replace it.' : 'No key saved.';
    if (!settings.hasKey) showSettings(true);
    await refreshStatus();
    statusTimer = setInterval(refreshStatus, 700);
  } catch (error) { $('progress').textContent = error.message; }
}
init();
