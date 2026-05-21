import 'dotenv/config';

import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPool } from './db.mjs';
import { migrate } from './schema.mjs';
import { createPostgresStore, dispatchApi } from './routes.mjs';
import { resolveAiRuntimeConfig } from './ai-generator.mjs';
import { envFromLocalConfig, loadLocalConfig } from '../runner/local-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

export function createDashboardServer({
  store,
  publicRoot = publicDir,
  services = resolveDashboardServices(),
} = {}) {
  return createServer(async (req, res) => {
    if (requiresConfiguredToken(req)) {
      writeJson(res, 503, {
        error: 'dashboard_token_required',
        message: 'DASHBOARD_AUTH_REQUIRED is enabled, but DASHBOARD_TOKEN is not set.',
      });
      return;
    }

    if (requiresToken(req)) {
      writeJson(res, 401, { error: 'unauthorized' });
      return;
    }

    if (req.url?.startsWith('/api/')) {
      if (req.method === 'GET' && req.url.startsWith('/api/runner/events')) {
        await proxyRunnerEvents(res);
        return;
      }
      const body = await readJsonBody(req);
      const response = await dispatchApi({ method: req.method || 'GET', url: req.url, body }, store, services);
      writeJson(res, response.status, response.body);
      return;
    }

    serveStatic(req, res, publicRoot);
  });
}

async function proxyRunnerEvents(res) {
  let upstream;
  try {
    upstream = await fetch('http://127.0.0.1:48731/events');
  } catch {
    writeJson(res, 502, { error: 'runner_unreachable' });
    return;
  }
  if (!upstream.ok || !upstream.body) {
    writeJson(res, upstream.status || 502, { error: 'runner_events_unavailable' });
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch {
    // Client disconnected.
  } finally {
    reader.releaseLock();
    res.end();
  }
}

export function resolveDashboardServices({
  env = process.env,
  loadConfig = loadLocalConfig,
} = {}) {
  const envValues = nonEmptyEnv(env);
  const shouldReadLocalConfig = !envValues.DATABASE_URL || envValues.CAREER_OPS_LOCAL === '1';
  const aiEnv = shouldReadLocalConfig
    ? {
        ...envFromLocalConfig(loadConfig()),
        ...envValues,
      }
    : envValues;
  const runtime = resolveAiRuntimeConfig(aiEnv);

  if (!runtime.apiKey && !runtime.baseUrl) {
    return {};
  }

  return {
    aiProvider: runtime.provider,
    aiApiKey: runtime.apiKey,
    aiModel: runtime.model,
    aiBaseUrl: runtime.baseUrl,
  };
}

function nonEmptyEnv(env) {
  return Object.fromEntries(
    Object.entries(env || {}).filter(([, value]) => value !== undefined && value !== null && String(value) !== ''),
  );
}

function serveStatic(req, res, publicRoot) {
  const url = new URL(req.url || '/', 'http://dashboard.local');
  const safePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(publicRoot, `.${safePath}`);

  if (!filePath.startsWith(publicRoot) || !existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  res.writeHead(200, { 'content-type': contentTypeFor(filePath) });
  createReadStream(filePath).pipe(res);
}

async function readJsonBody(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

function requiresToken(req) {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token) return false;
  if (!req.url?.startsWith('/api/')) return false;
  if (req.url === '/api/health') return false;
  return req.headers.authorization !== `Bearer ${token}`;
}

function requiresConfiguredToken(req) {
  if (!['1', 'true', 'yes'].includes(String(process.env.DASHBOARD_AUTH_REQUIRED || '').toLowerCase())) {
    return false;
  }
  if (process.env.DASHBOARD_TOKEN) return false;
  if (!req.url?.startsWith('/api/')) return false;
  return req.url !== '/api/health';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  await migrate(pool);
  const server = createDashboardServer({ store: createPostgresStore(pool) });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`career-ops job dashboard listening on :${port}`);
  });
}
