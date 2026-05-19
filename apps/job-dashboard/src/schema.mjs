import 'dotenv/config';

import { fileURLToPath } from 'node:url';

import { createPool } from './db.mjs';

export const requiredTables = [
  'profile',
  'portal_credentials',
  'jobs',
  'application_packages',
  'events',
  'runner_state',
  'runner_commands',
];

export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  linkedin TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  target_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  application_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal TEXT NOT NULL UNIQUE,
  profile_url TEXT NOT NULL DEFAULT '',
  username_email TEXT NOT NULL DEFAULT '',
  field_hints JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO portal_credentials (portal, profile_url, username_email, field_hints, notes)
VALUES
  (
    'ejobs',
    '',
    '',
    '{"discovery":{"enabled":true,"keywords":["Technical Support","Application Support","MDM","Python FastAPI","Full Stack Developer","AI Automation Engineer"]},"fieldAliases":{}}'::jsonb,
    'Romanian job board discovery and assisted application hints.'
  ),
  (
    'bestjobs',
    '',
    '',
    '{"discovery":{"enabled":true,"keywords":["Technical Support","Application Support","MDM","Python FastAPI","Full Stack Developer","AI Automation Engineer"]},"fieldAliases":{}}'::jsonb,
    'BestJobs Romania discovery and assisted application hints.'
  ),
  (
    'hipo',
    '',
    '',
    '{"discovery":{"enabled":true,"keywords":["Technical Support","Application Support","MDM","Python FastAPI","Full Stack Developer","AI Automation Engineer"]},"fieldAliases":{}}'::jsonb,
    'HiPo Romania discovery and assisted application hints.'
  ),
  (
    'linkedin',
    'https://www.linkedin.com/in/ioanstefanvlaicu/',
    '',
    '{"discovery":{"enabled":true,"keywords":["Technical Support","Application Support","MDM","Python FastAPI","Full Stack Developer","AI Automation Engineer"]},"fieldAliases":{}}'::jsonb,
    'LinkedIn Romania discovery; login and final submit stay manual.'
  )
ON CONFLICT (portal) DO NOTHING;

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  portal TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'discovered',
  fit_score INTEGER NOT NULL DEFAULT 0,
  fit_category TEXT NOT NULL DEFAULT '',
  matched_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendation TEXT NOT NULL DEFAULT 'review',
  fit_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  cover_letter TEXT NOT NULL DEFAULT '',
  tailored_cv_md TEXT NOT NULL DEFAULT '',
  required_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_state TEXT NOT NULL DEFAULT 'draft',
  runner_status TEXT NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id UUID,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runner_state (
  id TEXT PRIMARY KEY DEFAULT 'local',
  status JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  desired_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_gateway JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runner_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runner TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  exit_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_commands_status_created_idx
  ON runner_commands (status, created_at);
`;

// SQLite dialect of the same schema, used when the dashboard runs locally with
// no DATABASE_URL. Kept structurally identical so the store layer is unchanged.
export const SQLITE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  active INTEGER NOT NULL DEFAULT 1,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  linkedin TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  target_roles TEXT NOT NULL DEFAULT '[]',
  skills TEXT NOT NULL DEFAULT '[]',
  application_defaults TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portal_credentials (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  portal TEXT NOT NULL UNIQUE,
  profile_url TEXT NOT NULL DEFAULT '',
  username_email TEXT NOT NULL DEFAULT '',
  field_hints TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO portal_credentials (portal, profile_url, username_email, field_hints, notes)
VALUES
  ('ejobs', '', '', '{"discovery":{"enabled":true,"keywords":["Technical Support","Application Support","MDM","Python FastAPI","Full Stack Developer","AI Automation Engineer"]},"fieldAliases":{}}', 'Romanian job board discovery and assisted application hints.'),
  ('bestjobs', '', '', '{"discovery":{"enabled":true,"keywords":["Technical Support","Application Support","MDM","Python FastAPI","Full Stack Developer","AI Automation Engineer"]},"fieldAliases":{}}', 'BestJobs Romania discovery and assisted application hints.'),
  ('hipo', '', '', '{"discovery":{"enabled":true,"keywords":["Technical Support","Application Support","MDM","Python FastAPI","Full Stack Developer","AI Automation Engineer"]},"fieldAliases":{}}', 'HiPo Romania discovery and assisted application hints.'),
  ('linkedin', 'https://www.linkedin.com/in/ioanstefanvlaicu/', '', '{"discovery":{"enabled":true,"keywords":["Technical Support","Application Support","MDM","Python FastAPI","Full Stack Developer","AI Automation Engineer"]},"fieldAliases":{}}', 'LinkedIn Romania discovery; login and final submit stay manual.')
ON CONFLICT (portal) DO NOTHING;

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  url TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  portal TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'discovered',
  fit_score INTEGER NOT NULL DEFAULT 0,
  fit_category TEXT NOT NULL DEFAULT '',
  matched_skills TEXT NOT NULL DEFAULT '[]',
  missing_skills TEXT NOT NULL DEFAULT '[]',
  risk_flags TEXT NOT NULL DEFAULT '[]',
  recommendation TEXT NOT NULL DEFAULT 'review',
  fit_reasons TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS application_packages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  cover_letter TEXT NOT NULL DEFAULT '',
  tailored_cv_md TEXT NOT NULL DEFAULT '',
  required_fields TEXT NOT NULL DEFAULT '{}',
  missing_fields TEXT NOT NULL DEFAULT '{}',
  approval_state TEXT NOT NULL DEFAULT 'draft',
  runner_status TEXT NOT NULL DEFAULT 'not_started',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runner_state (
  id TEXT PRIMARY KEY DEFAULT 'local',
  status TEXT NOT NULL DEFAULT '{}',
  config TEXT NOT NULL DEFAULT '{}',
  desired_config TEXT NOT NULL DEFAULT '{}',
  ai_models TEXT NOT NULL DEFAULT '[]',
  ai_gateway TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runner_commands (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  runner TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload TEXT NOT NULL DEFAULT '{}',
  logs TEXT NOT NULL DEFAULT '[]',
  exit_code INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS runner_commands_status_created_idx
  ON runner_commands (status, created_at);
`;

export async function migrate(pool = createPool()) {
  if (pool.dialect === 'sqlite') {
    pool.exec(SQLITE_SCHEMA_SQL);
    return;
  }
  await pool.query(SCHEMA_SQL);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  try {
    await migrate(pool);
    console.log('job-dashboard schema ready');
  } finally {
    await pool.end();
  }
}
