export function publicSettings(settings) {
  return { hasKey: Boolean(settings.apiKey), level: settings.level === 'intermediate' ? 'intermediate' : 'beginner', theme: ['light', 'dark'].includes(settings.theme) ? settings.theme : 'auto' };
}
export function settingsUpdate(message) {
  if (!['beginner', 'intermediate'].includes(message.level) || !['auto', 'light', 'dark'].includes(message.theme)) throw new Error('Choose a valid reading level and theme.');
  const update = { level: message.level, theme: message.theme };
  const key = String(message.apiKey || '').trim();
  if (key) {
    if (key.length > 512 || /\s/.test(key)) throw new Error('The API key must not contain spaces.');
    update.apiKey = key;
  }
  return update;
}
