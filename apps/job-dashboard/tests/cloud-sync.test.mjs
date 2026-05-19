import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDesiredConfig, syncCloudRunner } from '../runner/cloud-sync.mjs';

test('applies desired runner config only once per desired update timestamp', () => {
  const saved = [];
  const current = { aiModel: 'old-model', remoteConfigUpdatedAt: 'earlier' };
  const desired = { aiModel: 'claude-haiku-4-5', updatedAt: 'now' };

  const updated = applyDesiredConfig({
    current,
    desired,
    saveConfig: config => {
      saved.push(config);
      return config;
    },
  });
  const unchanged = applyDesiredConfig({
    current: updated,
    desired,
    saveConfig: config => {
      saved.push(config);
      return config;
    },
  });

  assert.equal(saved.length, 1);
  assert.equal(updated.aiModel, 'claude-haiku-4-5');
  assert.equal(updated.remoteConfigUpdatedAt, 'now');
  assert.equal(unchanged, updated);
});

test('preserves local secrets when cloud desired config contains redacted placeholders', () => {
  const updated = applyDesiredConfig({
    current: {
      dashboardToken: 'real-dashboard-token',
      aiProxyApiKey: 'real-proxy-key',
    },
    desired: {
      dashboardToken: 'configured',
      aiProxyApiKey: 'configured',
      aiModel: 'claude-haiku-4-5',
      updatedAt: 'later',
    },
    saveConfig: config => config,
  });

  assert.equal(updated.dashboardToken, 'real-dashboard-token');
  assert.equal(updated.aiProxyApiKey, 'real-proxy-key');
  assert.equal(updated.aiModel, 'claude-haiku-4-5');
});

test('syncs local runner state and available models to Railway', async () => {
  const updates = [];
  const client = {
    async fetchRunnerState() { return {}; },
    async updateRunnerState(payload) { updates.push(payload); return payload; },
    async claimRunnerCommand() { return null; },
    async updateRunnerCommand() { throw new Error('not expected'); },
  };

  await syncCloudRunner({
    client,
    manager: { status: () => ({ discover: { status: 'idle' } }) },
    loadConfig: () => ({ aiProxyApiKey: 'local-key', aiModel: 'claude-haiku-4-5' }),
    saveConfig: value => value,
    redactConfig: value => ({ ...value, aiProxyApiKey: 'configured' }),
    listModels: async () => ({ ids: ['claude-haiku-4-5'], status: 200 }),
    commandBindings: new Map(),
  });

  assert.equal(updates[0].config.aiProxyApiKey, 'configured');
  assert.equal(updates[0].aiGateway.status, 200);
  assert.ok(updates[0].aiModels.some(model => model.id === 'claude-haiku-4-5' && model.available));
});

test('claims queued Railway commands and mirrors runner logs back', async () => {
  const commandUpdates = [];
  const run = {
    name: 'discover',
    status: 'running',
    logs: [{ message: 'started' }],
  };
  const manager = {
    start(name) {
      assert.equal(name, 'discover');
      return run;
    },
    status() {
      return { discover: run };
    },
  };
  const client = {
    async fetchRunnerState() { return {}; },
    async updateRunnerState() {},
    async claimRunnerCommand() { return { id: 'cmd-1', runner: 'discover' }; },
    async updateRunnerCommand(id, payload) {
      commandUpdates.push({ id, payload });
      return payload;
    },
  };

  const bindings = new Map();
  await syncCloudRunner({
    client,
    manager,
    loadConfig: () => ({ aiProxyApiKey: '' }),
    saveConfig: value => value,
    redactConfig: value => value,
    listModels: async () => ({ ids: [] }),
    commandBindings: bindings,
  });

  assert.equal(bindings.get('discover'), 'cmd-1');
  assert.equal(commandUpdates[0].id, 'cmd-1');
  assert.equal(commandUpdates[0].payload.status, 'running');
  assert.deepEqual(commandUpdates[0].payload.logs, [{ message: 'started' }]);
});

test('executes queued AI model test commands locally and writes results back', async () => {
  const updates = [];
  const client = {
    async fetchRunnerState() { return {}; },
    async updateRunnerState() {},
    async claimRunnerCommand() { return { id: 'cmd-2', runner: 'test-ai', payload: { provider: 'anthropic', model: 'claude-haiku-4-5' } }; },
    async updateRunnerCommand(id, payload) {
      updates.push({ id, payload });
      return payload;
    },
  };

  await syncCloudRunner({
    client,
    manager: { status: () => ({}) },
    loadConfig: () => ({ aiProxyApiKey: 'local-key' }),
    saveConfig: value => value,
    redactConfig: value => value,
    listModels: async () => ({ ids: [] }),
    testModel: async () => ({ ok: true, provider: 'anthropic', model: 'claude-haiku-4-5', ms: 25 }),
    commandBindings: new Map(),
  });

  assert.equal(updates[0].id, 'cmd-2');
  assert.equal(updates[0].payload.status, 'exited');
  assert.equal(updates[0].payload.logs[0].message, 'OK anthropic claude-haiku-4-5 (25ms)');
});
