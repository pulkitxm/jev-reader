import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSettings, settingsUpdate } from '../src/settings.js';
test('public settings never include credentials', () => {
  assert.deepEqual(publicSettings({ apiKey: 'synthetic-secret' }), { hasKey: true, level: 'beginner', theme: 'auto' });
});
test('blank key preserves the stored key while preferences change', () => {
  assert.deepEqual(settingsUpdate({ apiKey: ' ', level: 'beginner', theme: 'dark' }), { level: 'beginner', theme: 'dark' });
  assert.throws(() => settingsUpdate({ apiKey: 'abc def', level: 'beginner', theme: 'dark' }));
});
