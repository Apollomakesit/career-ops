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
  assert.match(SCHEMA_SQL, /salary_min\s+INTEGER/i);
  assert.match(SCHEMA_SQL, /work_model\s+TEXT/i);
  assert.match(SCHEMA_SQL, /posted_date\s+TIMESTAMPTZ/i);
  assert.match(SCHEMA_SQL, /requirements_text\s+TEXT/i);
  assert.match(SCHEMA_SQL, /cv_match_score\s+NUMERIC/i);
  assert.match(SCHEMA_SQL, /cv_matched_projects\s+JSONB/i);
  assert.match(SCHEMA_SQL, /cv_match_breakdown\s+JSONB/i);
});

test('schema seeds the Romanian portals used by the discovery runner', () => {
  for (const portal of ['ejobs', 'bestjobs', 'hipo', 'linkedin']) {
    assert.match(SCHEMA_SQL, new RegExp(`'${portal}'`, 'i'));
  }
  assert.match(SCHEMA_SQL, /ON CONFLICT \(portal\) DO NOTHING/i);
  assert.doesNotMatch(SCHEMA_SQL, /Technical Support/i);
  assert.match(SCHEMA_SQL, /Full Stack Developer/i);
  assert.match(SCHEMA_SQL, /AI Engineer/i);
});

test('schema tracks applied migrations', () => {
  assert.match(SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS migrations_applied/i);
});
