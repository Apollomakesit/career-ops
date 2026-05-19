import test from 'node:test';
import assert from 'node:assert/strict';

import { controlCorsHeaders, createControlHandler } from '../runner/control-server-core.mjs';

test('control handler returns model options and gateway availability', async () => {
  const handler = createControlHandler({
    loadConfig: () => ({ aiProxyApiKey: 'local-key' }),
    listModels: async () => ({ ids: ['gpt-5.4-mini'], raw: { data: [] } }),
  });

  const response = await handler({
    method: 'GET',
    url: '/ai/models',
    body: null,
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.models.some(model => model.id === 'gpt-5.4-mini' && model.available === true));
  assert.ok(response.body.models.some(model => model.id === 'claude-haiku-4-5' && model.recommended === true));
});

test('control handler tests a selected AI model', async () => {
  const handler = createControlHandler({
    loadConfig: () => ({ aiProxyApiKey: 'local-key' }),
    testModel: async payload => ({ ok: true, provider: payload.provider, model: payload.model, status: 200 }),
  });

  const response = await handler({
    method: 'POST',
    url: '/ai/test',
    body: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.provider, 'anthropic');
});

test('control handler tests cheap gateway models', async () => {
  const handler = createControlHandler({
    loadConfig: () => ({ aiProxyApiKey: 'local-key' }),
    testCheapModels: async () => [{ ok: true, provider: 'anthropic', model: 'SubscriptionGateway/claude-haiku-4-5-20251001' }],
  });

  const response = await handler({
    method: 'POST',
    url: '/ai/test-cheap',
    body: {},
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.results.length, 1);
});

test('control handler reports missing CLIProxyAPI auth key for model tests', async () => {
  const handler = createControlHandler({
    loadConfig: () => ({ aiProxyApiKey: '' }),
  });

  const response = await handler({
    method: 'POST',
    url: '/ai/test',
    body: { provider: 'openai', model: 'gpt-5.4-mini' },
  });

  assert.equal(response.status, 424);
  assert.equal(response.body.error, 'ai_proxy_key_missing');
});

function mockFetch(routes) {
  return async (url) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const match = Object.entries(routes).find(([key]) => path.startsWith(key));
    const payload = match ? match[1] : { error: 'not_found' };
    return {
      ok: Boolean(match),
      status: match ? 200 : 404,
      async text() {
        return JSON.stringify(payload);
      },
    };
  };
}

test('control handler lists linked AI accounts from CLIProxyAPI', async () => {
  const handler = createControlHandler({
    loadConfig: () => ({ cliProxyUrl: 'http://127.0.0.1:8317', cliProxyManagementKey: 'mgmt-key' }),
    fetchImpl: mockFetch({
      '/v0/management/auth-files': {
        files: [
          { id: 'claude-a.json', name: 'claude-a.json', provider: 'claude', email: 'a@x.com', disabled: false },
          { id: 'codex-b.json', name: 'codex-b.json', provider: 'codex', email: 'b@x.com', disabled: true },
        ],
      },
    }),
  });

  const response = await handler({ method: 'GET', url: '/accounts', body: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.accounts.length, 2);
  assert.equal(response.body.accounts[0].provider, 'Anthropic');
  assert.equal(response.body.accounts[1].provider, 'OpenAI');
  assert.equal(response.body.accounts[1].disabled, true);
});

test('control handler starts an OAuth login and returns the auth URL', async () => {
  const handler = createControlHandler({
    loadConfig: () => ({ cliProxyManagementKey: 'mgmt-key' }),
    fetchImpl: mockFetch({
      '/v0/management/anthropic-auth-url': { status: 'ok', url: 'https://claude.ai/oauth/authorize?x=1', state: 'st-1' },
    }),
  });

  const response = await handler({ method: 'POST', url: '/accounts/login', body: { provider: 'anthropic' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'anthropic');
  assert.match(response.body.url, /claude\.ai\/oauth/);
  assert.equal(response.body.state, 'st-1');
});

test('control handler reports a missing management key for account actions', async () => {
  const handler = createControlHandler({
    loadConfig: () => ({ cliProxyManagementKey: '' }),
  });

  const response = await handler({ method: 'GET', url: '/accounts', body: null });
  assert.equal(response.status, 424);
  assert.equal(response.body.error, 'management_key_missing');
});

test('control CORS headers allow HTTPS dashboard calls into localhost', () => {
  const headers = controlCorsHeaders();

  assert.equal(headers['access-control-allow-origin'], '*');
  assert.equal(headers['access-control-allow-private-network'], 'true');
});
