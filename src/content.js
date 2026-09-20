import { collectBlocks, batches, validAnnotation } from './page.js';
if (!globalThis.jevReaderInstalled) {
  globalThis.jevReaderInstalled = true;
  install();
}
function install() {
  let generation = 0;
  let annotations = [];
  let status = { running: false, count: 0, words: [], message: 'Ready to make this page easier to read.' };
  let frame;
  let current;
  let hideTimer;
  let pageUrl = location.href;
  const host = document.createElement('jev-reader-overlay');
  host.dataset.jevReader = '';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;display:block!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `:host{color-scheme:light}*{box-sizing:border-box}.line{position:fixed;height:2px;border-bottom:2px dotted #9b772c;pointer-events:none}.tip{all:initial;box-sizing:border-box;position:fixed;inset:auto;margin:0;padding:23px;width:326px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;border:1px solid #d9dfd1;border-radius:14px;background:#fffef7;color:#263e33;box-shadow:0 12px 44px #18251e26;font:14px/1.55 system-ui,sans-serif;pointer-events:auto;color-scheme:light}.tip:not(:popover-open){display:none}.tip:popover-open{display:block}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #83947740;padding-bottom:13px;margin-bottom:16px}.brand{font:600 9px system-ui;letter-spacing:1.6px;color:#829376}.close{border:0;background:none;color:inherit;font-size:20px;cursor:pointer;padding:4px 8px}.word{font:28px/1.2 Georgia,serif;display:block;margin-bottom:16px;overflow-wrap:anywhere}.label{display:block;font:600 9px system-ui;letter-spacing:1.5px;color:#657e5f;margin-top:15px;text-transform:uppercase}.value{display:block;margin:6px 0 0;font:14px/1.6 system-ui;overflow-wrap:anywhere}.example{font-style:italic}.foot{display:block;margin-top:20px;padding-top:12px;border-top:1px solid #83947740;font:10px system-ui;color:#74816e}@media(prefers-color-scheme:dark){.tip{background:#202a25;color:#eff3e8;border-color:#526256;color-scheme:dark}.label{color:#b2c9a4}.brand,.foot{color:#b0c1a7}}`;
  const lines = document.createElement('div');
  const tip = document.createElement('section');
  tip.className = 'tip';
  tip.setAttribute('popover', 'manual');
  tip.setAttribute('role', 'dialog');
  tip.setAttribute('aria-label', 'Word explanation');
  const top = document.createElement('div');
  top.className = 'top';
  const brand = document.createElement('span');
  brand.className = 'brand';
  brand.textContent = 'JEV READER';
  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close word explanation');
  top.append(brand, close);
  const word = document.createElement('strong');
  word.className = 'word';
  tip.append(top, word);
  const fields = {};
  for (const [key, label] of [['meaning', 'Meaning'], ['example', 'Example'], ['explanation', 'In simple words']]) {
    const caption = document.createElement('span');
    caption.className = 'label';
    caption.textContent = label;
    const value = document.createElement('p');
    value.className = `value ${key}`;
    fields[key] = value;
    tip.append(caption, value);
  }
  const foot = document.createElement('span');
  foot.className = 'foot';
  foot.textContent = 'A little clarity. Back to your story.';
  tip.append(foot);
  shadow.append(style, lines, tip);
  document.documentElement.append(host);
  function hide() {
    clearTimeout(hideTimer);
    hideTimer = null;
    if (tip.matches(':popover-open')) tip.hidePopover();
    current = null;
  }
  function isCurrent(item) {
    return item.block.node.isConnected && item.block.node.textContent.slice(item.block.offset, item.block.offset + item.block.text.length) === item.block.text;
  }
  function position(item) {
    const rect = [...item.range.getClientRects()].find(rect => rect.bottom > 0 && rect.top < innerHeight);
    if (!rect) return hide();
    const box = tip.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left - 12, innerWidth - box.width - 12));
    const below = rect.bottom + 10;
    const top = below + box.height <= innerHeight - 12 ? below : Math.max(12, rect.top - box.height - 10);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
  function show(item) {
    clearTimeout(hideTimer);
    hideTimer = null;
    if (current === item) return;
    current = item;
    word.textContent = item.word;
    for (const key of Object.keys(fields)) fields[key].textContent = item[key];
    if (!tip.matches(':popover-open')) tip.showPopover();
    position(item);
  }
  function redraw() {
    frame = null;
    lines.replaceChildren();
    annotations = annotations.filter(isCurrent);
    const fragment = document.createDocumentFragment();
    for (const item of annotations) {
      item.rects = [];
      for (const rect of item.range.getClientRects()) {
        if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
        item.rects.push(rect);
        const line = document.createElement('i');
        line.className = 'line';
        line.style.cssText = `left:${rect.left}px;top:${rect.bottom - 1}px;width:${rect.width}px`;
        fragment.append(line);
      }
    }
    lines.append(fragment);
    if (current) isCurrent(current) ? position(current) : hide();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(redraw); }
  function clear() {
    generation++;
    annotations = [];
    hide();
    lines.replaceChildren();
    status = { running: false, count: 0, words: [], message: 'Underlines cleared. Analyze whenever you are ready.' };
    return chrome.runtime.sendMessage({ type: 'CANCEL_ANALYSIS' }).catch(() => {});
  }
  function updateWords() {
    status.count = annotations.length;
    status.words = [...new Map(annotations.map(item => [item.word.toLowerCase() + item.meaning, { word: item.word, meaning: item.meaning, example: item.example, explanation: item.explanation }])).values()];
  }
  async function analyze() {
    const cancelled = clear();
    const run = generation;
    status.running = true;
    status.message = 'Reading this page…';
    await cancelled;
    if (run !== generation) return;
    pageUrl = location.href;
    const blocks = collectBlocks();
    const groups = batches(blocks);
    const total = blocks.reduce((sum, block) => sum + block.text.length, 0);
    if (!blocks.length) {
      status.running = false;
      status.message = 'No readable article text found. PDFs, images, and embedded frames are not supported.';
      return;
    }
    if (total > 250000) {
      status.running = false;
      status.message = 'This page is too large for one analysis (250,000 characters). Open a single article and try again.';
      return;
    }
    status.running = true;
    status.message = `Reading ${groups.length} sections…`;
    try {
      let candidates = 0;
      let vocabularySize = 0;
      for (const [index, group] of groups.entries()) {
        if (run !== generation || location.href !== pageUrl) return;
        status.message = `Analyzing section ${index + 1} of ${groups.length}… ${annotations.length} words explained.`;
        const result = await chrome.runtime.sendMessage({ type: 'ANALYZE_BLOCKS', blocks: group.map(({ id, text }) => ({ id, text })) });
        if (run !== generation || location.href !== pageUrl) return;
        if (!result?.ok) throw new Error(result?.error || 'Could not reach the extension. Reload this page and try again.');
        candidates += result.candidates || 0;
        vocabularySize = result.vocabularySize || vocabularySize;
        for (const item of result.annotations || []) {
          const block = group.find(block => block.id === item.blockId);
          if (!validAnnotation(item, block)) continue;
          const range = document.createRange();
          const entry = { ...item, block, range };
          if (!isCurrent(entry)) continue;
          range.setStart(block.node, block.offset + item.start);
          range.setEnd(block.node, block.offset + item.end);
          annotations.push(entry);
        }
        updateWords();
        schedule();
      }
      status.message = annotations.length ? `${annotations.length} words explained. Hover or click an underlined word. Reanalyze after loading more text.` : candidates ? 'Jev found no words needing help at this reading level.' : 'No supported vocabulary found on this page.';
      if (vocabularySize) status.message += ` Coverage is limited to ${vocabularySize} prepared meanings and their word forms.`;
    } catch (error) {
      if (run === generation) status.message = `${annotations.length ? 'Partial results kept. ' : ''}${error.message}`;
    } finally { if (run === generation) status.running = false; }
  }
  function atPoint(event) {
    const node = document.elementFromPoint(event.clientX, event.clientY);
    if (node === host) return null;
    return annotations.find(item => item.rects?.some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom + 3) && node?.contains(item.block.node));
  }
  document.addEventListener('pointermove', event => {
    if (event.composedPath().includes(host)) return;
    const item = atPoint(event);
    if (item) show(item);
    else if (current && !hideTimer) hideTimer = setTimeout(() => { hideTimer = null; hide(); }, 220);
  }, { passive: true });
  document.addEventListener('click', event => {
    if (event.composedPath().includes(host)) return;
    const item = atPoint(event);
    if (item) show(item);
    else hide();
  });
  tip.addEventListener('pointerenter', () => { clearTimeout(hideTimer); hideTimer = null; });
  tip.addEventListener('pointerleave', () => { hideTimer = setTimeout(() => { hideTimer = null; hide(); }, 220); });
  close.addEventListener('click', hide);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('scroll', () => { hide(); schedule(); }, { capture: true, passive: true });
  window.addEventListener('resize', () => { hide(); schedule(); });
  const observer = new MutationObserver(records => {
    if (!host.isConnected) document.documentElement.append(host);
    if (location.href !== pageUrl) {
      clear();
      pageUrl = location.href;
      status.message = 'Page changed. Click Analyze for this article.';
    } else if (records.some(record => !host.contains(record.target)) && annotations.length) {
      annotations = annotations.filter(isCurrent);
      updateWords();
      if (!status.running) status.message = 'Page content changed. Click Analyze to include newly loaded text.';
      schedule();
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message.type === 'START') { if (!status.running) analyze(); }
    if (message.type === 'CLEAR') clear();
    if (['START', 'CLEAR', 'STATUS'].includes(message.type)) respond(status);
    return false;
  });
}
