import { publicSettings, settingsUpdate } from './settings.js';
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  handle(message, sender).then(result => respond({ ok: true, ...result }), error => respond({ ok: false, error: error.message }));
  return true;
});
async function handle(message, sender) {
  await storageReady;
  const trusted = sender.url?.startsWith(chrome.runtime.getURL(''));
  if (['GET_SETTINGS', 'SAVE_SETTINGS', 'REMOVE_KEY'].includes(message.type)) {
    if (!trusted) throw new Error('Open extension settings to manage your key.');
    if (message.type === 'SAVE_SETTINGS') await chrome.storage.local.set(settingsUpdate(message));
    if (message.type === 'REMOVE_KEY') await chrome.storage.local.remove('apiKey');
    return publicSettings(await chrome.storage.local.get(['apiKey', 'level']));
  }
  throw new Error('Page analysis is not available in this setup checkpoint.');
}
