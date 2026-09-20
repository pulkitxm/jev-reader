import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionCache, cacheKeys } from '../src/cache.js';
import { analyzeBlocks, findCandidates } from '../src/analysis.js';
import { addUsage, emptyUsage, reportedUsage, costSummary } from '../src/usage.js';
function storage() {
  let data = {};
  return { get: async () => structuredClone(data), set: async value => { data = structuredClone(value); } };
}
function responder(counter) {
  return async (url, options) => {
    counter.calls++;
    const request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, { choice: 'sense_0', confidence: .9 }])), usage: { input_tokens: 1200, output_tokens: 120 } }) };
  };
}
test('single-sense decisions persist across blogs without another request', async () => {
  const disk = storage();
  const counter = { calls: 0 };
  const options = { apiKey: 'synthetic-key', fetchImpl: responder(counter), cache: createDecisionCache(disk) };
  const first = await analyzeBlocks([{ id: '0', text: 'The frustrating delay caused frustration.' }], options);
  assert.equal(first.usage.requests, 1);
  const next = await analyzeBlocks([{ id: '0', text: 'She sighed with frustration at the broken door.' }], { ...options, cache: createDecisionCache(disk) });
  assert.equal(counter.calls, 1);
  assert.equal(next.usage.cached, 1);
  assert.equal(next.usage.requests, 0);
  assert.equal(next.annotations[0].word, 'frustration');
  assert.ok(!JSON.stringify(await disk.get()).includes('broken door'));
});
test('ambiguous words, reading levels, and changed meanings have separate keys', async () => {
  const [one] = findCandidates([{ id: '0', text: 'She read a novel.' }]);
  const [two] = findCandidates([{ id: '0', text: 'He had a novel idea.' }]);
  const first = await cacheKeys(one, 'beginner');
  const second = await cacheKeys(two, 'beginner');
  assert.equal(first.word, null);
  assert.notEqual(first.exact, second.exact);
  assert.notEqual(first.exact, (await cacheKeys(one, 'intermediate')).exact);
  assert.notEqual(first.exact, (await cacheKeys({ ...one, senses: [{ meaning: 'Updated meaning' }] }, 'beginner')).exact);
});
test('expired decisions and manually cleared decisions are not reused', async () => {
  let now = 100000;
  const disk = storage();
  const cache = createDecisionCache(disk, () => now);
  const key = 'a'.repeat(64);
  await cache.setMany([[key, { choice: 'sense_0', confidence: .9 }]]);
  assert.ok(await cache.get(key));
  now += 31 * 24 * 60 * 60 * 1000;
  assert.equal(await cache.get(key), undefined);
  await cache.setMany([[key, { choice: 'sense_0', confidence: .9 }]]);
  await cache.clear();
  assert.equal(await cache.size(), 0);
  assert.equal(await createDecisionCache(disk, () => now).get(key), undefined);
});
test('cache is bounded and excludes uncertain decisions', async () => {
  const cache = createDecisionCache(storage());
  await cache.setMany(Array.from({ length: 2010 }, (_, i) => [i.toString(16).padStart(64, '0'), { choice: 'sense_0', confidence: .9 }]));
  assert.equal(await cache.size(), 2000);
  await cache.setMany([['f'.repeat(64), { choice: 'sense_0', confidence: .3 }]]);
  assert.equal(await cache.get('f'.repeat(64)), undefined);
});
test('skipped senses are not reused across different contexts', async () => {
  const disk = storage();
  const cache = createDecisionCache(disk);
  let calls = 0;
  const options = { apiKey: 'synthetic-key', cache, fetchImpl: async () => {
    calls++;
    return { ok: true, json: async () => ({ answers: { word_0: { choice: 'skip', confidence: .9 } } }) };
  } };
  await analyzeBlocks([{ id: '0', text: 'The label is frustration.' }], options);
  await analyzeBlocks([{ id: '0', text: 'I felt frustration.' }], options);
  assert.equal(calls, 2);
});
test('costs use reported usage and never treat missing usage as final zero', () => {
  const usage = reportedUsage({ input_tokens: 1000000, output_tokens: 500000 });
  assert.deepEqual(costSummary(usage), { input: .042, output: 0, incomplete: false });
  assert.equal(costSummary(addUsage(usage, reportedUsage(null))).incomplete, true);
  assert.equal(costSummary(emptyUsage()).input, 0);
  assert.deepEqual(costSummary(reportedUsage({ input_tokens: 1000000 })), { input: .042, output: 0, incomplete: true });
});
