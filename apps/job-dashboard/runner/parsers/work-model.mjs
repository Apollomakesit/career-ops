export function parseWorkModel(text = '') {
  const value = normalize(text);
  if (/\b(remote|remot|telemunca|de la distanta|de acasa|work from home|wfh)\b/.test(value)) return 'remote';
  if (/\b(hibrid|hybrid)\b/.test(value)) return 'hybrid';
  if (/\b(la birou|la sediu|onsite|on site|on-site|prezenta fizica)\b/.test(value)) return 'onsite';
  return 'unknown';
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
