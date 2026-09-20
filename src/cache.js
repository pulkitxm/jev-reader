const lifetime = 30 * 24 * 60 * 60 * 1000;
const limit = 2000;
export async function cacheKeys(candidate, level) {
  const base = { model: 'jev-1.13.0', revision: 1, level, word: candidate.word.toLowerCase(), senses: candidate.senses };
  const hash = async value => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const context = candidate.context.toLowerCase().replace(/\s+/g, ' ').trim();
  return { exact: await hash({ ...base, context }), word: candidate.senses.length === 1 ? await hash(base) : null };
}
export function createDecisionCache(storage, now = Date.now) {
  let entries;
  let loading;
  let writes = Promise.resolve();
  const valid = entry => entry && Number.isFinite(entry.createdAt) && now() - entry.createdAt < lifetime && entry.createdAt <= now() && typeof entry.choice === 'string' && Number.isFinite(entry.confidence) && entry.confidence >= 0.6 && entry.confidence <= 1;
  async function load() {
    if (!loading) loading = storage.get('readerCache').then(data => {
      entries = Object.fromEntries(Object.entries(data.readerCache || {}).filter(([key, entry]) => /^[a-f0-9]{64}$/.test(key) && valid(entry)).slice(-limit));
    });
    await loading;
  }
  function persist() {
    const snapshot = structuredClone(entries);
    writes = writes.catch(() => {}).then(() => storage.set({ readerCache: snapshot }));
    return writes;
  }
  return {
    async get(key) { await load(); return key && valid(entries[key]) ? entries[key] : undefined; },
    async setMany(values) {
      await load();
      for (const [key, answer] of values) if (key && answer.confidence >= 0.6) entries[key] = { choice: answer.choice, confidence: answer.confidence, createdAt: now() };
      entries = Object.fromEntries(Object.entries(entries).filter(([, entry]) => valid(entry)).sort((a, b) => a[1].createdAt - b[1].createdAt).slice(-limit));
      await persist();
    },
    async clear() { await load(); entries = {}; await persist(); },
    async size() { await load(); return Object.values(entries).filter(valid).length; }
  };
}
