import test from 'node:test';
import assert from 'node:assert/strict';

import { SCHEMA_SQL, requiredTables } from '../src/schema.mjs';

test('schema declares every dashboard table idempotently', () => {
  for (const table of requiredTables) {
    assert.match(SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
  }
});

test('application packages store approval and runner state', () => {
  assert.match(SCHEMA_SQL, /approval_state\s+TEXT/i);
  assert.match(SCHEMA_SQL, /runner_status\s+TEXT/i);
  assert.match(SCHEMA_SQL, /missing_fields\s+JSONB/i);
});

test('jobs store structured fit scoring fields', () => {
  assert.match(SCHEMA_SQL, /fit_score\s+INTEGER/i);
  assert.match(SCHEMA_SQL, /matched_skills\s+JSONB/i);
  assert.match(SCHEMA_SQL, /missing_skills\s+JSONB/i);
  assert.match(SCHEMA_SQL, /recommendation\s+TEXT/i);
});
