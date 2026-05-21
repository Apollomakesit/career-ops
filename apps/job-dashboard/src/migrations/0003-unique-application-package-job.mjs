export async function up(pool) {
  if (pool.dialect === 'sqlite') {
    await pool.query(`
      DELETE FROM application_packages
      WHERE job_id IS NOT NULL
        AND id NOT IN (
          SELECT id
          FROM (
            SELECT id, job_id, updated_at
            FROM application_packages
            WHERE job_id IS NOT NULL
            ORDER BY updated_at DESC, id DESC
          )
          GROUP BY job_id
        )
    `);
  } else {
    await pool.query(`
      DELETE FROM application_packages p
      USING application_packages newer
      WHERE p.job_id IS NOT NULL
        AND newer.job_id = p.job_id
        AND (
          newer.updated_at > p.updated_at
          OR (newer.updated_at = p.updated_at AND newer.id > p.id)
        )
    `);
  }

  if (pool.dialect === 'sqlite') {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS application_packages_job_id_unique
      ON application_packages (job_id)
    `);
  } else {
    await pool.query('DROP INDEX IF EXISTS application_packages_job_id_unique');
    await pool.query(`
      CREATE UNIQUE INDEX application_packages_job_id_unique
      ON application_packages (job_id)
    `);
  }
}
