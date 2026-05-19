import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cheapModelTestPlan,
  listConfiguredAiModels,
  normalizeSelectedAiModel,
  parseGatewayModelIds,
  providerBaseUrl,
} from '../runner/ai-models.mjs';

test('lists user-requested OpenAI and Anthropic model choices with cheap recommendations', () => {
  const models = listConfiguredAiModels();

  assert.ok(models.some(model => model.provider === 'openai' && model.id === 'gpt-5.4-mini' && model.recommended));
  assert.ok(models.some(model => model.provider === 'anthropic' && model.id === 'claude-haiku-4-5' && model.recommended));
  assert.ok(models.some(model => model.provider === 'openai' && model.id === 'o3'));
  assert.ok(models.some(model => model.provider === 'anthropic' && model.id === 'claude-opus-4-7'));
});

test('normalizes Anthropic short aliases to the gateway model IDs exposed by CLIProxyAPI', () => {
  const selected = normalizeSelectedAiModel({ provider: 'anthropic', model: 'claude-haiku-4-5' });

  assert.equal(selected.provider, 'anthropic');
  assert.equal(selected.model, 'SubscriptionGateway/claude-haiku-4-5-20251001');
  assert.equal(selected.baseUrl, 'http://127.0.0.1:8317/api/provider/anthropic/v1');
});

test('keeps OpenAI model IDs unchanged and assigns the provider-specific Responses base URL', () => {
  const selected = normalizeSelectedAiModel({ provider: 'openai', model: 'gpt-5.4-mini' });

  assert.equal(selected.provider, 'openai');
  assert.equal(selected.model, 'gpt-5.4-mini');
  assert.equal(selected.baseUrl, 'http://127.0.0.1:8317/api/provider/openai/v1');
});

test('parses gateway model IDs from OpenAI and Anthropic style model-list payloads', () => {
  assert.deepEqual(parseGatewayModelIds({ data: [{ id: 'gpt-5.4-mini' }] }), ['gpt-5.4-mini']);
  assert.deepEqual(parseGatewayModelIds({ data: [{ id: 'SubscriptionGateway/claude-haiku-4-5-20251001' }] }), [
    'SubscriptionGateway/claude-haiku-4-5-20251001',
  ]);
});

test('builds a cheap model test plan for both providers', () => {
  const plan = cheapModelTestPlan();

  assert.deepEqual(plan.map(item => `${item.provider}:${item.model}`), [
    'openai:gpt-5.4-mini',
    'anthropic:SubscriptionGateway/claude-haiku-4-5-20251001',
  ]);
});

test('returns provider-specific CLIProxyAPI base URLs', () => {
  assert.equal(providerBaseUrl('openai'), 'http://127.0.0.1:8317/api/provider/openai/v1');
  assert.equal(providerBaseUrl('anthropic'), 'http://127.0.0.1:8317/api/provider/anthropic/v1');
});
