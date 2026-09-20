const excluded = 'script,style,noscript,textarea,input,select,button,nav,header,footer,code,pre,svg,canvas,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[hidden],[data-jev-reader]';
export function collectBlocks(doc = document) {
  const root = doc.querySelector('main,[role="main"]') || doc.querySelector('article') || doc.body;
  if (!root) return [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const blocks = [];
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest(excluded) || !/[a-zA-Z]{3}/.test(node.textContent)) continue;
    const style = getComputedStyle(parent);
    if (style.visibility !== 'visible' || !parent.getClientRects().length) continue;
    const text = node.textContent;
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 2400, text.length);
      if (end < text.length) {
        const space = text.lastIndexOf(' ', end);
        if (space > start) end = space;
      }
      const value = text.slice(start, end);
      if (/[a-zA-Z]{3}/.test(value)) blocks.push({ id: String(blocks.length), text: value, node, offset: start });
      start = end;
    }
  }
  return blocks;
}
export function batches(blocks, size = 7000) {
  const groups = [];
  let batch = [];
  let length = 0;
  for (const block of blocks) {
    if (batch.length && length + block.text.length > size) {
      groups.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(block);
    length += block.text.length;
  }
  if (batch.length) groups.push(batch);
  return groups;
}
export function validAnnotation(item, block) {
  return block && Number.isInteger(item.start) && Number.isInteger(item.end) && item.start >= 0 && item.end > item.start && item.end <= block.text.length && typeof item.word === 'string' && block.text.slice(item.start, item.end).toLowerCase() === item.word.toLowerCase() && ['meaning', 'example', 'explanation'].every(key => typeof item[key] === 'string' && item[key].length > 0 && item[key].length <= 1000);
}
