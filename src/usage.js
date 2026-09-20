export const pricing = { model: 'jev-1.13.0', inputPerMillion: 0.042, outputPerMillion: 0, checkedOn: '2026-09-20', source: 'https://docs.typesafe.ai/models' };
export const emptyUsage = () => ({ inputTokens: 0, outputTokens: 0, requests: 0, unreportedRequests: 0, cached: 0 });
export function addUsage(left = emptyUsage(), right = emptyUsage()) {
  return Object.fromEntries(Object.keys(emptyUsage()).map(key => [key, (left[key] || 0) + (right[key] || 0)]));
}
export function reportedUsage(value) {
  const inputReported = Number.isSafeInteger(value?.input_tokens) && value.input_tokens >= 0;
  const outputReported = Number.isSafeInteger(value?.output_tokens) && value.output_tokens >= 0;
  return { ...emptyUsage(), requests: 1, unreportedRequests: inputReported && outputReported ? 0 : 1, inputTokens: inputReported ? value.input_tokens : 0, outputTokens: outputReported ? value.output_tokens : 0 };
}
export function costSummary(usage) {
  return { input: usage.inputTokens * pricing.inputPerMillion / 1000000, output: usage.outputTokens * pricing.outputPerMillion / 1000000, incomplete: usage.unreportedRequests > 0 };
}
export function formatCost(value) {
  return value === 0 ? '$0.00' : value < 0.000001 ? '<$0.000001' : `$${value.toFixed(6)}`;
}
