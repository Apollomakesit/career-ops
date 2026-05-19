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

test('control CORS headers allow HTTPS dashboard calls into localhost', () => {
  const headers = controlCorsHeaders();

  assert.equal(headers['access-control-allow-origin'], '*');
  assert.equal(headers['access-control-allow-private-network'], 'true');
});
