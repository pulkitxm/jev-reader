import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBlocks, findCandidates, makeRequest, readAnswers } from '../src/analysis.js';
import { vocabulary } from '../src/vocabulary.js';
const blocks = [{ id: '0', text: 'Frustration grew. His pretentious speech described a novel approach and a novel to read.' }];
function answer(request, choice = 'sense_0') {
  return { answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, { choice, confidence: 0.9 }])) };
}
test('finds whole words with original offsets and multiple contextual senses', () => {
  const candidates = findCandidates(blocks);
  assert.deepEqual(candidates.map(candidate => candidate.word), ['Frustration', 'pretentious', 'novel', 'novel']);
  for (const item of candidates) assert.equal(blocks[0].text.slice(item.start, item.end), item.word);
  assert.equal(candidates[2].senses.length, 2);
  assert.equal(findCandidates([{ id: '0', text: 'novelty and biographies' }]).length, 0);
});
test('rejects oversized, duplicate, or malformed page input before requests', () => {
  for (const input of [null, [], [{ id: '0', text: 'x'.repeat(7001) }], [{ id: '0', text: 'novel' }, { id: '0', text: 'novel' }]]) assert.throws(() => findCandidates(input));
});
test('every prepared sense has a meaning, example, and simple explanation', () => {
  for (const [word, senses] of vocabulary) for (const sense of senses) {
    assert.ok(word && senses.length);
    for (const key of ['meaning', 'example', 'explanation']) assert.ok(typeof sense[key] === 'string' && sense[key].length > 5, `${word}: ${key}`);
  }
});
test('Jev chooses the explanation without returning arbitrary page markup', async () => {
  const result = await analyzeBlocks(blocks, { apiKey: 'synthetic-key', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-key');
    const request = JSON.parse(options.body);
    assert.equal(request.model, 'jev-1.13.0');
    assert.equal(request.state.readingLevel, 'beginner');
    const response = answer(request);
    response.answers.word_3.choice = 'sense_1';
    return { ok: true, json: async () => response };
  } });
  assert.equal(result.annotations.length, 4);
  assert.match(result.annotations[2].meaning, /new and different/i);
  assert.match(result.annotations[3].meaning, /long written story/i);
});
test('validates responses and permits skipping unsupported or easy senses', () => {
  const candidates = findCandidates(blocks);
  assert.deepEqual(readAnswers(answer(makeRequest(candidates, 'beginner'), 'skip'), candidates), []);
  assert.throws(() => readAnswers({}, candidates));
  assert.throws(() => readAnswers(answer(makeRequest(candidates, 'beginner'), 'sense_99'), candidates));
  const response = answer(makeRequest(candidates, 'beginner'));
  response.answers.word_0.confidence = 0.1;
  assert.equal(readAnswers(response, candidates).length, 3);
});
test('no matching vocabulary makes no paid requests', async () => {
  const result = await analyzeBlocks([{ id: '0', text: 'The cat sat on the mat.' }], { apiKey: 'synthetic-key', fetchImpl: () => { throw new Error('Unexpected network request'); } });
  assert.equal(result.annotations.length, 0);
});
test('batches long vocabulary lists without dropping occurrences', async () => {
  let calls = 0;
  const result = await analyzeBlocks([{ id: '0', text: 'frustration '.repeat(55) }], { apiKey: 'synthetic-key', fetchImpl: async (url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    assert.ok(Object.keys(request.questions).length <= 24);
    return { ok: true, json: async () => answer(request) };
  } });
  assert.equal(calls, 3);
  assert.equal(result.annotations.length, 55);
});
test('reports authentication, throttling, network, and incomplete replies safely', async () => {
  for (const [status, pattern] of [[401, /API key/], [403, /API key/], [429, /rate limit/], [500, /HTTP 500/]]) {
    await assert.rejects(analyzeBlocks(blocks, { apiKey: 'synthetic-key', fetchImpl: async () => ({ ok: false, status }) }), pattern);
  }
  await assert.rejects(analyzeBlocks(blocks, { apiKey: 'synthetic-key', fetchImpl: async () => { throw new Error('sensitive data'); } }), /internet connection/);
  await assert.rejects(analyzeBlocks(blocks, {}), /save your TypeSafe API key/);
  await assert.rejects(analyzeBlocks(blocks, { apiKey: 'synthetic-key', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /incomplete answer/);
});
test('cancellation stops before the next request', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(analyzeBlocks(blocks, { apiKey: 'synthetic-key', signal: controller.signal, fetchImpl: () => { throw new Error('Should not run'); } }), { name: 'AbortError' });
});
test('progress counts only answered batches and never predicts results', async () => {
  const events = [];
  await analyzeBlocks([{ id: '0', text: 'frustration '.repeat(25) }], { apiKey: 'synthetic-key', onProgress: value => events.push(value), fetchImpl: async (url, options) => ({ ok: true, json: async () => answer(JSON.parse(options.body)) }) });
  assert.deepEqual(events, [{ total: 25, completed: 0 }, { total: 25, completed: 24 }, { total: 25, completed: 25 }]);
});
