const dayMs = 24 * 60 * 60 * 1000;

export function parsePostedDate(raw = '', now = new Date()) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  if (/\b(astazi|azi|today)\b/.test(normalized)) return new Date(now).toISOString();
  if (/\b(ieri|yesterday)\b/.test(normalized)) return new Date(now.getTime() - dayMs).toISOString();

  const relative = normalized.match(/(?:acum\s+)?(\d+)\s+(zile|zi|days?|weeks?|saptamani|luni|months?|ore|hours?)/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const days = /ore|hours?/.test(unit) ? amount / 24
      : /weeks?|saptamani/.test(unit) ? amount * 7
        : /luni|months?/.test(unit) ? amount * 30
          : amount;
    return new Date(now.getTime() - days * dayMs).toISOString();
  }

  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return new Date(`${iso[1]}T00:00:00.000Z`).toISOString();

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString();
}
