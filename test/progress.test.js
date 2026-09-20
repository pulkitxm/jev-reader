import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, progressView } from '../src/progress.js';
test('elapsed time follows the run timestamp and stays fixed after completion', () => {
  const status = { phase: 'analyzing', startedAt: 1000, totalSections: 4, completedSections: 1, checked: 24, count: 8 };
  const view = progressView(status, 4500);
  assert.equal(view.elapsed, '3.5s');
  assert.equal(view.percent, 25);
  assert.equal(view.sections, '1 / 4 sections');
  assert.equal(view.checked, '24 words checked');
  assert.equal(view.explained, '8 underlined');
  assert.equal(progressView({ ...status, finishedAt: 4500 }, 10000).elapsed, '3.5s');
  assert.equal(formatDuration(62000), '1m 02s');
});
test('failed partial analysis does not show complete progress', () => {
  const view = progressView({ phase: 'error', startedAt: 1000, finishedAt: 2000, totalSections: 4, completedSections: 1, count: 3 });
  assert.equal(view.title, 'Analysis incomplete');
  assert.equal(view.percent, 25);
  assert.equal(view.elapsed, '1.0s');
});
