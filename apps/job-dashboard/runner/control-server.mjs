#!/usr/bin/env node
import 'dotenv/config';

import { createServer } from 'node:http';

import { createRunnerClient } from './api-client.mjs';
import { syncCloudRunner } from './cloud-sync.mjs';
import { controlCorsHeaders, createControlHandler } from './control-server-core.mjs';
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
const commandBindings = new Map();
const handleControlRequest = createControlHandler({
  manager,
  loadConfig: loadLocalConfig,
  saveConfig: saveLocalConfig,
  redactConfig: redactLocalConfig,
});

const server = createServer(async (req, res) => {
  writeCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const parsed = new URL(req.url || '/', `http://${host}:${port}`);
    if (req.method === 'POST' && parsed.pathname === '/cloud-sync') {
      await syncWithDashboard();
      writeJson(res, 200, { ok: true });
      return;
    }

    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : null;
    const response = await handleControlRequest({
      method: req.method,
      url: req.url || '/',
      body,
    });
    writeJson(res, response.status, response.body);
  } catch (error) {
    writeJson(res, 500, { error: 'runner_error', message: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`career-ops local runner control listening at http://${host}:${port}`);
});

const syncIntervalMs = Number(process.env.LOCAL_RUNNER_CLOUD_SYNC_INTERVAL_MS || 3000);
const syncTimer = setInterval(() => {
  syncWithDashboard().catch(error => {
    console.error(`dashboard sync failed: ${error.message}`);
  });
}, syncIntervalMs);
syncWithDashboard().catch(() => {});

function writeCors(res) {
  for (const [key, value] of Object.entries(controlCorsHeaders())) {
    res.setHeader(key, value);
  }
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

async function syncWithDashboard() {
  const config = loadLocalConfig();
  if (!config.dashboardUrl || !config.dashboardToken) return;
  const client = createRunnerClient({ baseUrl: config.dashboardUrl, token: config.dashboardToken });
  await syncCloudRunner({
    client,
    manager,
    loadConfig: loadLocalConfig,
    saveConfig: saveLocalConfig,
    redactConfig: redactLocalConfig,
    commandBindings,
  });
}
