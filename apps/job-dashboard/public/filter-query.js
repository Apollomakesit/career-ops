const JOB_FILTER_KEYS = ['workModel', 'status', 'portal', 'minSalary', 'maxSalary', 'currency', 'postedWithinDays', 'minMatch'];

export function sanitizeSearchQuery(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  if (/@/.test(value)) return '';
  if (isUrlLike(value)) return '';
  return value;
}

export function jobFilterQueryString(search = '') {
  const source = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const selected = new URLSearchParams();
  for (const key of JOB_FILTER_KEYS) {
    const value = source.get(key);
    if (value) selected.set(key, value);
  }
  const q = sanitizeSearchQuery(source.get('q') || '');
  if (q) selected.set('q', q);
  const text = selected.toString();
  return text ? `?${text}` : '';
}

function isUrlLike(value) {
  if (/^(?:https?:\/\/|file:\/\/|localhost(?::|\/|$)|127(?:\.\d{1,3}){3}(?::|\/|$)|\[?::1\]?)/i.test(value)) {
    return true;
  }
  try {
    const parsed = new URL(value);
    return ['http:', 'https:', 'file:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
