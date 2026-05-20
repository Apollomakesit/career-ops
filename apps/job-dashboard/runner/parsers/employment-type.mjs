export function parseEmploymentType(text = '') {
  const value = String(text || '').toLowerCase();
  if (/\b(full[-\s]?time|norma intreaga|timp complet)\b/.test(value)) return 'full-time';
  if (/\b(part[-\s]?time|jumatate de norma)\b/.test(value)) return 'part-time';
  if (/\b(internship|intern|stagiu)\b/.test(value)) return 'internship';
  if (/\b(contract|contractor|b2b|freelance|colaborare)\b/.test(value)) return 'contract';
  return 'unknown';
}
