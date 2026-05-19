import test from 'node:test';
import assert from 'node:assert/strict';

import {
  listGatewayModels,
  testAiGatewayModel,
  testCheapGatewayModels,
} from '../runner/ai-gateway.mjs';

test('lists gateway models with configured authorization', async () => {
  const calls = [];
  const models = await listGatewayModels({
    apiKey: 'local-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: [{ id: 'gpt-5.4-mini' }] };
        },
      };
    },
  });

  assert.equal(calls[0].url, 'http://127.0.0.1:8317/v1/models');
  assert.equal(calls[0].options.headers.authorization, 'Bearer local-key');
  assert.deepEqual(models.ids, ['gpt-5.4-mini']);
});

test('tests an OpenAI-compatible model through the Responses endpoint', async () => {
  const calls = [];
  const result = await testAiGatewayModel({
    provider: 'openai',
    model: 'gpt-5.4-mini',
    apiKey: 'local-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ output_text: '{"ok":true}' });
        },
      };
    },
  });

  assert.equal(calls[0].url, 'http://127.0.0.1:8317/api/provider/openai/v1/responses');
  assert.equal(JSON.parse(calls[0].options.body).model, 'gpt-5.4-mini');
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'openai');
});

test('tests an Anthropic model through the messages endpoint', async () => {
  const calls = [];
  const result = await testAiGatewayModel({
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    apiKey: 'local-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ content: [{ type: 'text', text: '{"ok":true}' }] });
        },
      };
    },
  });

  assert.equal(calls[0].url, 'http://127.0.0.1:8317/api/provider/anthropic/v1/messages');
  assert.equal(JSON.parse(calls[0].options.body).model, 'SubscriptionGateway/claude-haiku-4-5-20251001');
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'anthropic');
});

test('records failed gateway tests without throwing', async () => {
  const result = await testAiGatewayModel({
    provider: 'openai',
    model: 'gpt-5.4-mini',
    apiKey: 'local-key',
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async text() {
        return '{"error":{"message":"token expired"}}';
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.detail, /token expired/);
});

test('tests the cheap model set in order', async () => {
  const seen = [];
  const results = await testCheapGatewayModels({
    apiKey: 'local-key',
    fetchImpl: async (_url, options) => {
      seen.push(JSON.parse(options.body).model);
      return {
        ok: true,
        status: 200,
        async text() {
          return '{}';
        },
      };
    },
  });

  assert.deepEqual(seen, ['gpt-5.4-mini', 'SubscriptionGateway/claude-haiku-4-5-20251001']);
  assert.equal(results.length, 2);
});
