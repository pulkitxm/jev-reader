export function publicSettings(settings) {
  return { hasKey: Boolean(settings.apiKey), level: settings.level === 'intermediate' ? 'intermediate' : 'beginner' };
}
export function settingsUpdate(message) {
  if (!['beginner', 'intermediate'].includes(message.level)) throw new Error('Choose a valid reading level.');
  const update = { level: message.level };
  const key = String(message.apiKey || '').trim();
  if (key) {
    if (key.length > 512 || /\s/.test(key)) throw new Error('The API key must not contain spaces.');
    update.apiKey = key;
  }
  return update;
}
