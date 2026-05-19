#!/usr/bin/env node
import 'dotenv/config';

import { createServer } from 'node:http';

import { createRunnerManager } from './run-manager.mjs';
import {
  envFromLocalConfig,
  loadLocalConfig,
  redactLocalConfig,
  saveLocalConfig,
} from './local-config.mjs';

const host = process.env.LOCAL_RUNNER_HOST || '127.0.0.1';
const port = Number(process.env.LOCAL_RUNNER_PORT || 48731);
const manager = createRunnerManager({
  envProvider: () => envFromLocalConfig(loadLocalConfig()),
});

const server = createServer(async (req, res) => {
  writeCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${host}:${port}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      writeJson(res, 200, { ok: true, service: 'career-ops-local-runner' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/config') {
      writeJson(res, 200, redactLocalConfig(loadLocalConfig()));
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/config') {
      const current = loadLocalConfig();
      const body = await readJson(req);
      const merged = saveLocalConfig({
        ...current,
        ...body,
        dashboardToken: body.dashboardToken === 'configured' ? current.dashboardToken : body.dashboardToken,
        aiProxyApiKey: body.aiProxyApiKey === 'configured' ? current.aiProxyApiKey : body.aiProxyApiKey,
      });
      writeJson(res, 200, redactLocalConfig(merged));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      writeJson(res, 200, manager.status());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/logs') {
      writeJson(res, 200, manager.logs(url.searchParams.get('runner') || 'discover'));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/start') {
      const body = await readJson(req);
      writeJson(res, 202, manager.start(body.runner));
      return;
    }

    writeJson(res, 404, { error: 'not_found' });
  } catch (error) {
    writeJson(res, 500, { error: 'runner_error', message: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`career-ops local runner control listening at http://${host}:${port}`);
});

function writeCors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization');
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
