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
  $('settings-toggle').setAttribute('aria-label', open ? 'Back to reader' : 'Open settings');
}
function renderStatus(status) {
  $('progress').textContent = status.message;
  $('analyze').disabled = status.running;
  $('word-count').textContent = status.count ? `${status.count} words explained` : '';
  $('words').replaceChildren();
  for (const item of status.words || []) {
    const card = document.createElement('div');
    card.className = 'word-card';
    const title = document.createElement('strong');
    title.textContent = item.word;
    card.append(title);
    for (const [label, value] of [['Meaning', item.meaning], ['Example', item.example], ['In simple words', item.explanation]]) {
      const caption = document.createElement('small');
      caption.textContent = label;
      const text = document.createElement('p');
      text.textContent = value;
      card.append(caption, text);
    }
    $('words').append(card);
  }
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
    const result = await send({ type: 'SAVE_SETTINGS', apiKey: $('api-key').value, level: $('level').value, theme: $('theme').value });
    $('api-key').value = '';
    $('api-key').type = 'password';
    $('show-key').textContent = 'Show';
    $('key-state').textContent = result.hasKey ? 'Key saved in this browser. Enter a new key to replace it.' : 'Add a key to analyze pages.';
    $('settings-status').textContent = 'Settings saved.';
    if (tab?.id) pageMessage({ type: 'THEME', theme: $('theme').value }).catch(() => {});
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
    await pageMessage({ type: 'START', theme: settings.theme });
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
    $('page-title').textContent = tab?.title || 'Open a website to begin';
    const settings = await send({ type: 'GET_SETTINGS' });
    $('level').value = settings.level;
    $('theme').value = settings.theme;
    $('key-state').textContent = settings.hasKey ? 'Key saved. Enter a new key to replace it.' : 'Stored only in this browser, never synced.';
    if (!settings.hasKey) showSettings(true);
    await refreshStatus();
    statusTimer = setInterval(refreshStatus, 700);
  } catch (error) { $('progress').textContent = error.message; }
}
init();
