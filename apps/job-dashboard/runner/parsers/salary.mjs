export function parseSalary(raw = '') {
  const text = String(raw || '').trim();
  if (!text || !/\d/.test(text)) {
    return { min: null, max: null, currency: '', period: '' };
  }

  const currency = parseCurrency(text);
  const period = parsePeriod(text);
  const values = [...text.matchAll(/(?:[$€]\s*)?(\d+(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)(\s*k)?/gi)]
    .map(match => normalizeAmount(match[1], match[2]))
    .filter(value => Number.isFinite(value) && value > 0);

  if (values.length === 0) return { min: null, max: null, currency, period };
  const min = values[0];
  const max = values[1] || values[0];
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    currency,
    period,
  };
}

function parseCurrency(text) {
  if (/\bEUR\b|€/i.test(text)) return 'EUR';
  if (/\bRON\b|\blei\b/i.test(text)) return 'RON';
  if (/\bUSD\b|\$/i.test(text)) return 'USD';
  return '';
}

function parsePeriod(text) {
  if (/\b(luna|month|monthly)\b/i.test(text)) return 'month';
  if (/\b(an|year|yearly)\b/i.test(text)) return 'year';
  if (/\b(ora|hour|hourly)\b/i.test(text)) return 'hour';
  if (/\b(zi|day|daily)\b/i.test(text)) return 'day';
  return '';
}

function normalizeAmount(raw, suffix = '') {
  let value = String(raw).replace(/\s/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(value)) {
    value = value.replace(/[.,]/g, '');
  } else {
    value = value.replace(',', '.');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * (/k/i.test(suffix) ? 1000 : 1));
}
