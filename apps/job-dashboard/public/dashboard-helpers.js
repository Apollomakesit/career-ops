export const DEFAULT_JOB_PAGE_SIZE = 50;

export function buildRunnerPayload(runner, options = {}) {
  const payload = { runner: String(runner || '').trim() };
  const portal = String(options.portal || '').trim().toLowerCase();
  const mode = String(options.mode || '').trim().toLowerCase();
  if (portal) payload.portal = portal;
  if (mode) payload.mode = mode;
  return payload;
}

export function paginateItems(items = [], { page = 1, pageSize = DEFAULT_JOB_PAGE_SIZE } = {}) {
  const total = items.length;
  const size = Math.max(1, Number(pageSize) || DEFAULT_JOB_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const offset = (safePage - 1) * size;
  const pageItems = items.slice(offset, offset + size);
  return {
    items: pageItems,
    page: safePage,
    pageSize: size,
    total,
    totalPages,
    start: total === 0 ? 0 : offset + 1,
    end: offset + pageItems.length,
  };
}

export function nextBulkSelection(current = new Set(), visibleIds = [], action = 'toggle') {
  const selected = new Set(current);
  const ids = visibleIds.map(id => String(id || '')).filter(Boolean);
  if (action === 'select-visible') {
    for (const id of ids) selected.add(id);
    return selected;
  }
  if (action === 'clear-visible') {
    for (const id of ids) selected.delete(id);
    return selected;
  }
  if (action === 'clear-all') return new Set();
  for (const id of ids) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
  return selected;
}

export function filterEvents(events = [], filters = {}) {
  const q = String(filters.q || '').trim().toLowerCase();
  const type = String(filters.type || '').trim();
  const portal = String(filters.portal || '').trim().toLowerCase();
  const from = dateFloor(filters.from);
  const to = dateCeil(filters.to);

  return events.filter(event => {
    const payload = event.payload || {};
    const haystack = [
      event.eventType,
      event.message,
      event.entityType,
      event.entityId,
      payload.portal,
      payload.jobId,
      payload.url,
    ].map(value => String(value || '').toLowerCase()).join(' ');
    const created = event.createdAt ? new Date(event.createdAt) : null;
    if (q && !haystack.includes(q)) return false;
    if (type && event.eventType !== type) return false;
    if (portal && String(payload.portal || event.portal || '').toLowerCase() !== portal) return false;
    if (from && (!created || created < from)) return false;
    if (to && (!created || created > to)) return false;
    return true;
  });
}

export function validatePortalConfig({ profileUrl = '', usernameEmail = '', fieldHintsText = '' } = {}) {
  const errors = {};
  const cleanUrl = String(profileUrl || '').trim();
  const cleanEmail = String(usernameEmail || '').trim();
  let fieldHints = {};

  if (cleanUrl && !isValidHttpUrl(cleanUrl)) {
    errors.profileUrl = 'Enter a valid URL.';
  }
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    errors.usernameEmail = 'Enter a valid email address.';
  }
  try {
    const text = String(fieldHintsText || '').trim();
    fieldHints = text ? JSON.parse(text) : {};
    if (!fieldHints || typeof fieldHints !== 'object' || Array.isArray(fieldHints)) {
      errors.fieldHints = 'Field hints must be a valid JSON object.';
    }
  } catch {
    errors.fieldHints = 'Field hints must be valid JSON.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    fieldHints,
  };
}

export function jobsToCsv(jobs = []) {
  const columns = ['company', 'title', 'portal', 'status', 'url'];
  const lines = [
    columns.join(','),
    ...jobs.map(job => columns.map(column => csvCell(job[column])).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

export function parseJobImport(text = '') {
  const value = String(text || '').trim();
  if (!value) return [];
  if (value.startsWith('[')) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('Import JSON must be an array of jobs.');
    return parsed.map(normalizeImportJob).filter(Boolean);
  }
  return parseCsv(value).map(normalizeImportJob).filter(Boolean);
}

export function nextTheme(current = 'light') {
  return current === 'dark' ? 'light' : 'dark';
}

function parseCsv(text) {
  const rows = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const headers = rows.shift() || [];
  return rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function normalizeImportJob(job = {}) {
  const url = String(job.url || '').trim();
  const title = String(job.title || '').trim();
  const company = String(job.company || '').trim();
  if (!url && !title && !company) return null;
  return {
    url,
    company,
    title,
    portal: String(job.portal || '').trim().toLowerCase(),
    status: String(job.status || 'discovered').trim() || 'discovered',
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function dateFloor(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateCeil(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}
