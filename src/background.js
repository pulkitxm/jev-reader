import { createDecisionCache } from './cache.js';
import { analyzeBlocks } from './analysis.js';
import { publicSettings, settingsUpdate } from './settings.js';
import { createCredentialBridge } from './credentials.js';
const requests = new Map();
const cache = createDecisionCache(chrome.storage.local);
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const credentials = createCredentialBridge({ runtime: chrome.runtime, storage: chrome.storage.local });
credentials.listen();
void storageReady.then(() => credentials.sync());
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  handle(message, sender).then(result => respond({ ok: true, ...result }), error => respond({ ok: false, error: error.message }));
  return true;
});
async function handle(message, sender) {
  await storageReady;
  const trusted = sender.url?.startsWith(chrome.runtime.getURL(''));
  if (['GET_SETTINGS', 'SAVE_SETTINGS', 'REMOVE_KEY', 'CLEAR_CACHE'].includes(message.type)) {
    if (!trusted) throw new Error('Open extension settings to manage your key.');
    if (message.type === 'SAVE_SETTINGS') {
      const update = settingsUpdate(message);
      await chrome.storage.local.set(update);
      if (update.apiKey) await credentials.save(update.apiKey);
    }
    if (message.type === 'REMOVE_KEY') await credentials.remove();
    if (message.type === 'CLEAR_CACHE') await cache.clear();
    return { ...publicSettings(await chrome.storage.local.get(['apiKey', 'level'])), cachedDecisions: await cache.size() };
  }
  if (!sender.tab?.id || sender.frameId !== 0 || !/^https?:/.test(sender.url || '')) throw new Error('Open a regular article page to analyze it.');
  const tabId = sender.tab.id;
  if (message.type === 'CANCEL_ANALYSIS') {
    requests.get(tabId)?.abort();
    requests.delete(tabId);
    return {};
  }
  if (message.type === 'ANALYZE_BLOCKS') {
    if (requests.has(tabId)) throw new Error('This page is already being analyzed.');
    const controller = new AbortController();
    requests.set(tabId, controller);
    try {
      const settings = await chrome.storage.local.get(['apiKey', 'level']);
      return await analyzeBlocks(message.blocks, { ...settings, cache, signal: controller.signal, onProgress: progress => chrome.tabs.sendMessage(tabId, { type: 'ANALYSIS_PROGRESS', runId: message.runId, section: message.section, progress }, { documentId: sender.documentId }).catch(() => {}) });
    } finally {
      if (requests.get(tabId) === controller) requests.delete(tabId);
    }
  }
  throw new Error('Unknown reader action.');
}

chrome.tabs.onRemoved.addListener(tabId => { requests.get(tabId)?.abort(); requests.delete(tabId); });
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') { requests.get(tabId)?.abort(); requests.delete(tabId); }
});
