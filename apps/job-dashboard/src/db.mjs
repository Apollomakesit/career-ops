import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Pool } = pg;
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSqlitePath = path.join(appDir, '.data', 'career-ops.db');

/**
 * Returns a database pool. When DATABASE_URL is set, a
 * real pg pool is used; otherwise a local SQLite file-backed pool is created so
 * the dashboard runs fully offline with no external database.
 */
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (connectionString) {
    return createPgPool(connectionString);
  }
  return createSqlitePool(process.env.SQLITE_PATH || defaultSqlitePath);
}

export function ensureSqliteAvailable({
  env = process.env,
  loadSqlite = loadBetterSqlite3,
} = {}) {
  if (env.DATABASE_URL) return;
  try {
    loadSqlite();
  } catch (error) {
    throw sqliteUnavailableError(error);
  }
}

export async function waitForDatabase(pool, {
  attempts = 5,
  baseDelayMs = 1000,
  sleep = delay,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await pool.query('SELECT 1');
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await sleep(baseDelayMs * (2 ** attempt));
    }
  }
  throw lastError;
}

function createPgPool(connectionString) {
  const pool = new Pool({
    connectionString,
    ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : false,
  });
  pool.dialect = 'postgres';
  pool.health = async () => {
    const result = await pool.query('SELECT 1 AS ok');
    return { ok: true, dialect: 'postgres', rows: result.rows };
  };
  return pool;
}

export async function withClient(pool, fn) {
  if (pool.dialect === 'sqlite') {
    return fn({ query: pool.query, release() {} });
  }
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

function needsSsl(connectionString) {
  return /railway|proxy\.rlwy|amazonaws|render|supabase/i.test(connectionString);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadBetterSqlite3() {
  const require = createRequire(import.meta.url);
  return require('better-sqlite3');
}

function sqliteUnavailableError(error) {
  return new Error(
    'better-sqlite3 unavailable. Install build tools or set DATABASE_URL. '
    + 'For local SQLite mode, run "npm install" in apps/job-dashboard after installing native build tools. '
    + `(${error.message})`,
  );
}

// ---------------------------------------------------------------------------
// SQLite pool — a minimal adapter exposing the same surface routes.mjs expects
// from a pg pool: an async query(text, params) returning { rows }.
// ---------------------------------------------------------------------------

function createSqlitePool(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });

  // Lazy require so environments using Postgres never need the native module.
  // better-sqlite3 is an optionalDependency: present locally, skipped on hosts
  // (e.g. Railway) that run against Postgres instead.
  let Database;
  try {
    Database = loadBetterSqlite3();
  } catch (error) {
    throw sqliteUnavailableError(error);
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${Math.max(0, Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 5000))}`);

  async function query(text, params = []) {
    const { sql, values } = translateQuery(text, params);
    const stmt = db.prepare(sql);
    if (stmt.reader) {
      const rows = stmt.all(...values).map(parseJsonColumns);
      return { rows, rowCount: rows.length };
    }
    const info = stmt.run(...values);
    return { rows: [], rowCount: info.changes };
  }

  return {
    dialect: 'sqlite',
    query,
    exec(sql) {
      db.exec(sql);
    },
    async connect() {
      return { query, release() {} };
    },
    async end() {
      db.close();
    },
    async health() {
      return { ok: true, dialect: 'sqlite', rows: db.prepare('SELECT 1 AS ok').all() };
    },
    raw: db,
  };
}

// Translate a Postgres-style statement into a SQLite-compatible one and expand
// positional `$n` parameters (which may repeat) into ordered `?` placeholders.
function translateQuery(text, params = []) {
  const sql = String(text)
    .replace(/::jsonb/gi, '')
    .replace(/\bnow\(\)/gi, "datetime('now')");

  const values = [];
  const finalSql = sql.replace(/\$(\d+)/g, (_, index) => {
    const value = params[Number(index) - 1];
    values.push(value === undefined ? null : value);
    return '?';
  });
  return { sql: finalSql, values };
}

// pg auto-parses JSONB columns into JS values; SQLite returns them as text.
// Recover objects/arrays so the store layer sees identical shapes either way.
function parseJsonColumns(row) {
  const parsed = {};
  for (const [key, value] of Object.entries(row)) {
    parsed[key] = maybeJson(value);
  }
  return parsed;
}

function maybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    const result = JSON.parse(trimmed);
    return result !== null && typeof result === 'object' ? result : value;
  } catch {
    return value;
  }
}
