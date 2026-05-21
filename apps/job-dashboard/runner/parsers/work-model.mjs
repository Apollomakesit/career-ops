export function parseWorkModel(text = '') {
  const value = normalize(text);
  // Hybrid is checked first so jobs that mention both "remote" and "hybrid"
  // (e.g. "Remote work: Hybrid", "Bucharest, Romania (Hybrid)") classify as
  // hybrid rather than getting tagged remote by a stray "remote jobs" link.
  if (/\b(hibrid|hybrid)\b/.test(value)) return 'hybrid';
  if (/\b(remote|remot|telemunca|de la distanta|de acasa|work from home|wfh|fully remote|100\s*%?\s*remote)\b/.test(value)) return 'remote';
  if (/\b(la birou|la sediu|onsite|on site|on-site|prezenta fizica|office[- ]based|in[- ]office|fully onsite|on[- ]premises|office work)\b/.test(value)) return 'onsite';
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
