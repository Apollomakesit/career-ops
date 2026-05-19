import 'dotenv/config';

import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPool } from './db.mjs';
import { migrate } from './schema.mjs';
import { createPostgresStore, dispatchApi } from './routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

export function createDashboardServer({ store, publicRoot = publicDir } = {}) {
  return createServer(async (req, res) => {
    if (requiresToken(req)) {
      writeJson(res, 401, { error: 'unauthorized' });
      return;
    }

    if (req.url?.startsWith('/api/')) {
      const body = await readJsonBody(req);
      const response = await dispatchApi({ method: req.method || 'GET', url: req.url, body }, store);
      writeJson(res, response.status, response.body);
      return;
    }

    serveStatic(req, res, publicRoot);
  });
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
  if (!['POST', 'PUT', 'PATCH'].includes(req.method || '')) return undefined;
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  await migrate(pool);
  const server = createDashboardServer({ store: createPostgresStore(pool) });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`career-ops job dashboard listening on :${port}`);
  });
}
