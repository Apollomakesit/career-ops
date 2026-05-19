import test from 'node:test';
import assert from 'node:assert/strict';

import { createDashboardServer, resolveDashboardServices } from '../src/server.mjs';

test('serves health response through HTTP', async () => {
  const server = createDashboardServer({
    store: {
      async getProfile() { return {}; },
    },
  });

  await listen(server);
  try {
    const baseUrl = addressFor(server);
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
  } finally {
    await close(server);
  }
});

test('serves dashboard HTML', async () => {
  const server = createDashboardServer({
    store: {
      async getProfile() { return {}; },
    },
  });

  await listen(server);
  try {
    const response = await fetch(addressFor(server));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Career Ops Dashboard/);
    assert.match(html, /Local Runner Control/);
    assert.match(html, /runnerAiModelSelect/);
    assert.match(html, /testSelectedAiModelButton/);
    assert.match(html, /testCheapAiModelsButton/);
  } finally {
    await close(server);
  }
});

test('serves dashboard shell while protecting API data when token is configured', async () => {
  const previousToken = process.env.DASHBOARD_TOKEN;
  process.env.DASHBOARD_TOKEN = 'secret';
  const server = createDashboardServer({
    store: {
      async getProfile() { return {}; },
    },
  });

  await listen(server);
  try {
    const baseUrl = addressFor(server);
    const htmlResponse = await fetch(baseUrl);
    assert.equal(htmlResponse.status, 200);
    assert.match(await htmlResponse.text(), /Career Ops Dashboard/);

    const apiResponse = await fetch(`${baseUrl}/api/profile`);
    assert.equal(apiResponse.status, 401);
  } finally {
    await close(server);
    if (previousToken === undefined) {
      delete process.env.DASHBOARD_TOKEN;
    } else {
      process.env.DASHBOARD_TOKEN = previousToken;
    }
  }
});

test('resolves AI services from local runner config when running without DATABASE_URL', () => {
  const services = resolveDashboardServices({
    env: {
      DATABASE_URL: '',
    },
    loadConfig: () => ({
      aiProvider: 'anthropic',
      aiBaseUrl: 'http://127.0.0.1:8317/api/provider/anthropic/v1',
      aiModel: 'SubscriptionGateway/claude-haiku-4-5-20251001',
      aiProxyApiKey: 'local-proxy-key',
    }),
  });

  assert.equal(services.aiProvider, 'anthropic');
  assert.equal(services.aiBaseUrl, 'http://127.0.0.1:8317/api/provider/anthropic/v1');
  assert.equal(services.aiModel, 'SubscriptionGateway/claude-haiku-4-5-20251001');
  assert.equal(services.aiApiKey, 'local-proxy-key');
});

test('does not point a hosted DATABASE_URL deployment at localhost CLIProxyAPI by default', () => {
  const services = resolveDashboardServices({
    env: {
      DATABASE_URL: 'postgresql://railway.internal/db',
    },
    loadConfig: () => ({
      aiProvider: 'anthropic',
      aiBaseUrl: 'http://127.0.0.1:8317/api/provider/anthropic/v1',
      aiModel: 'SubscriptionGateway/claude-haiku-4-5-20251001',
      aiProxyApiKey: 'local-proxy-key',
    }),
  });

  assert.equal(services.aiBaseUrl, undefined);
  assert.equal(services.aiApiKey, undefined);
});

test('explicit AI env configuration wins over local runner config', () => {
  const services = resolveDashboardServices({
    env: {
      DATABASE_URL: 'postgresql://railway.internal/db',
      AI_PROVIDER: 'openai',
      AI_BASE_URL: 'https://gateway.example/openai/v1',
      AI_MODEL: 'gpt-5.4-mini',
      AI_PROXY_API_KEY: 'env-key',
    },
    loadConfig: () => ({
      aiProvider: 'anthropic',
      aiBaseUrl: 'http://127.0.0.1:8317/api/provider/anthropic/v1',
      aiModel: 'SubscriptionGateway/claude-haiku-4-5-20251001',
      aiProxyApiKey: 'local-proxy-key',
    }),
  });

  assert.equal(services.aiProvider, 'openai');
  assert.equal(services.aiBaseUrl, 'https://gateway.example/openai/v1');
  assert.equal(services.aiModel, 'gpt-5.4-mini');
  assert.equal(services.aiApiKey, 'env-key');
});

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

function addressFor(server) {
  const address = server.address();
  return `http://${address.address}:${address.port}`;
}
