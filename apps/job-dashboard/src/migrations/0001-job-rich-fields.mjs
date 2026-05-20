const columns = [
  ['salary_min', 'INTEGER'],
  ['salary_max', 'INTEGER'],
  ['salary_currency', "TEXT NOT NULL DEFAULT ''"],
  ['salary_period', "TEXT NOT NULL DEFAULT ''"],
  ['work_model', "TEXT NOT NULL DEFAULT 'unknown'"],
  ['employment_type', "TEXT NOT NULL DEFAULT 'unknown'"],
  ['posted_date', { postgres: 'TIMESTAMPTZ', sqlite: 'TEXT' }],
  ['requirements_text', "TEXT NOT NULL DEFAULT ''"],
  ['responsibilities_text', "TEXT NOT NULL DEFAULT ''"],
  ['cv_match_score', { postgres: 'NUMERIC NOT NULL DEFAULT 0', sqlite: 'REAL NOT NULL DEFAULT 0' }],
  ['cv_matched_skills', { postgres: "JSONB NOT NULL DEFAULT '[]'::jsonb", sqlite: "TEXT NOT NULL DEFAULT '[]'" }],
  ['cv_matched_projects', { postgres: "JSONB NOT NULL DEFAULT '[]'::jsonb", sqlite: "TEXT NOT NULL DEFAULT '[]'" }],
  ['cv_missing_skills', { postgres: "JSONB NOT NULL DEFAULT '[]'::jsonb", sqlite: "TEXT NOT NULL DEFAULT '[]'" }],
  ['cv_match_breakdown', { postgres: "JSONB NOT NULL DEFAULT '{}'::jsonb", sqlite: "TEXT NOT NULL DEFAULT '{}'" }],
];

export async function up(pool) {
  for (const [name, type] of columns) {
    const columnType = typeof type === 'string' ? type : type[pool.dialect === 'sqlite' ? 'sqlite' : 'postgres'];
    if (pool.dialect === 'sqlite') {
      try {
        await pool.query(`ALTER TABLE jobs ADD COLUMN ${name} ${columnType}`);
      } catch (error) {
        if (!/duplicate column name/i.test(error.message)) throw error;
      }
    } else {
      await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ${name} ${columnType}`);
    }
  }
}
