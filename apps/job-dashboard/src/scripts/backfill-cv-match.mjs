#!/usr/bin/env node
import 'dotenv/config';

import { createPool } from '../db.mjs';
import { migrate } from '../schema.mjs';
import { createPostgresStore } from '../routes.mjs';

const pool = createPool();
try {
  await migrate(pool);
  const store = createPostgresStore(pool);
  const result = await store.rescoreCvMatches();
  console.log(JSON.stringify(result));
} finally {
  await pool.end();
}
