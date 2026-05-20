const oldKeywords = ['Technical Support', 'Application Support', 'MDM', 'Python FastAPI', 'Full Stack Developer', 'AI Automation Engineer'];
const newKeywords = ['Full Stack Developer', 'AI Engineer', 'Backend Engineer', 'Python Developer'];

export async function up(pool) {
  const result = await pool.query('SELECT portal, field_hints AS "fieldHints" FROM portal_credentials');
  for (const row of result.rows) {
    const hints = normalizeHints(row.fieldHints);
    const current = hints.discovery?.keywords || [];
    if (!sameKeywords(current, oldKeywords)) continue;
    hints.discovery = {
      ...(hints.discovery || {}),
      keywords: newKeywords,
    };
    await pool.query(
      'UPDATE portal_credentials SET field_hints = $2::jsonb, updated_at = now() WHERE portal = $1',
      [row.portal, JSON.stringify(hints)],
    );
  }
}

function normalizeHints(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function sameKeywords(a = [], b = []) {
  return JSON.stringify(a) === JSON.stringify(b);
}
