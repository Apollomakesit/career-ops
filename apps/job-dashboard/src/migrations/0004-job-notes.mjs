export async function up(pool) {
  if (pool.dialect === 'sqlite') {
    const columns = await pool.query('PRAGMA table_info(jobs)');
    const hasNotes = columns.rows.some(column => column.name === 'notes');
    if (!hasNotes) {
      await pool.query("ALTER TABLE jobs ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
    }
    return;
  }

  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''");
}
