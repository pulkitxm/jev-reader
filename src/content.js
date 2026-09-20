if (!globalThis.jevReaderInstalled) {
  globalThis.jevReaderInstalled = true;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    respond({ running: false, count: 0, words: [], message: 'Page analysis is not available in this setup checkpoint.' });
  });
}
