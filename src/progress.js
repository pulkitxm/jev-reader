export function formatDuration(milliseconds) {
  const seconds = Math.max(0, milliseconds || 0) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${String(Math.floor(seconds % 60)).padStart(2, '0')}s`;
}
export function progressView(status, now = Date.now()) {
  const headings = { starting: 'Opening page', reading: 'Reading page', analyzing: 'Checking words with Jev', applying: 'Adding underlines', complete: 'Analysis complete', error: status.count ? 'Analysis incomplete' : 'Analysis failed', stopped: 'Analysis stopped' };
  const total = status.totalSections || 0;
  const completed = Math.min(status.completedSections || 0, total);
  return {
    title: headings[status.phase] || '',
    elapsed: status.startedAt ? formatDuration((status.finishedAt || now) - status.startedAt) : '',
    sections: total ? `${completed} / ${total} sections` : 'Scanning article',
    checked: `${status.checked || 0} words checked`,
    explained: `${status.count || 0} underlined`,
    percent: total ? Math.round(completed / total * 100) : 0
  };
}
