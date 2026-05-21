#!/usr/bin/env node
import 'dotenv/config';

import { createPool } from '../db.mjs';
import { migrate } from '../schema.mjs';
import { deriveJobFields } from '../job-derivers.mjs';

const pool = createPool();
try {
  await migrate(pool);
  const result = await pool.query(`
    SELECT id, work_model, posted_date, location, title, description,
           requirements_text, responsibilities_text
    FROM jobs
  `);

  let updated = 0;
  let workModelFilled = 0;
  let postedDateFilled = 0;

  for (const job of result.rows) {
    const before = {
      work_model: String(job.work_model || '').toLowerCase(),
      posted_date: job.posted_date || null,
    };
    const after = deriveJobFields(job);

    const workChanged = after.work_model !== before.work_model;
    const postedChanged = String(after.posted_date || '') !== String(before.posted_date || '');
    if (!workChanged && !postedChanged) continue;

    await pool.query(
      `UPDATE jobs SET work_model = $2, posted_date = $3, updated_at = now() WHERE id = $1`,
      [job.id, after.work_model, after.posted_date],
    );
    updated += 1;
    if (workChanged && before.work_model !== 'remote' && before.work_model !== 'hybrid' && before.work_model !== 'onsite') {
      workModelFilled += 1;
    }
    if (postedChanged && !before.posted_date) {
      postedDateFilled += 1;
    }
  }

  console.log(JSON.stringify({
    scanned: result.rows.length,
    updated,
    work_model_filled: workModelFilled,
    posted_date_filled: postedDateFilled,
  }, null, 2));
} finally {
  await pool.end();
}
