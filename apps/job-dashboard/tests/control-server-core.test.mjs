import test from 'node:test';
import assert from 'node:assert/strict';

import { controlCorsHeaders, createControlHandler } from '../runner/control-server-core.mjs';
import { createRunState } from '../runner/run-state.mjs';

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

test('control CORS headers allow the local dashboard origin without wildcard access', () => {
  const headers = controlCorsHeaders('http://127.0.0.1:3000');

  assert.equal(headers['access-control-allow-origin'], 'http://127.0.0.1:3000');
  assert.equal(headers['access-control-allow-private-network'], 'true');
  assert.equal(headers.vary, 'origin');
});

test('control CORS headers allow the configured dashboard URL without wildcard access', () => {
  const previous = process.env.DASHBOARD_URL;
  process.env.DASHBOARD_URL = 'https://dashboard.example';
  try {
    const headers = controlCorsHeaders('https://dashboard.example');

    assert.equal(headers['access-control-allow-origin'], 'https://dashboard.example');
    assert.notEqual(headers['access-control-allow-origin'], '*');
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_URL;
    else process.env.DASHBOARD_URL = previous;
  }
});

test('control CORS headers reject unrelated browser origins', () => {
  const headers = controlCorsHeaders('https://example.invalid');

  assert.equal(headers['access-control-allow-origin'], undefined);
  assert.equal(headers['access-control-allow-private-network'], 'true');
});

test('control handler exposes pause, resume, stop, and progress state', async () => {
  const runState = createRunState({ persist: false });
  const handler = createControlHandler({
    loadConfig: () => ({}),
    runState,
  });

  const paused = await handler({ method: 'POST', url: '/pause', body: { portal: 'ejobs' } });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.perPortal.ejobs.paused, true);

  const progress = await handler({ method: 'GET', url: '/progress', body: null });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.perPortal.ejobs.status, 'paused');

  const resumed = await handler({ method: 'POST', url: '/resume', body: { portal: 'ejobs' } });
  assert.equal(resumed.body.perPortal.ejobs.paused, false);

  const stopped = await handler({ method: 'POST', url: '/stop', body: {} });
  assert.equal(stopped.body.global.cancelled, true);
});

test('run state tracks rescan queued and processed counts', () => {
  const runState = createRunState({ persist: false });

  runState.setQueued('linkedin', 3);
  runState.incr('linkedin', 'processed');

  const snapshot = runState.snapshot();
  assert.equal(snapshot.perPortal.linkedin.queued, 3);
  assert.equal(snapshot.perPortal.linkedin.processed, 1);
});

test('control handler starts portal-specific discovery and clears stale stop state', async () => {
  const runState = createRunState({ persist: false });
  runState.stopPortal('linkedin');
  const starts = [];
  const handler = createControlHandler({
    loadConfig: () => ({}),
    runState,
    manager: {
      status: () => ({ discover: { status: 'running' } }),
      start(runner, options) {
        starts.push({ runner, options });
        return { status: 'running' };
      },
    },
  });

  const response = await handler({
    method: 'POST',
    url: '/start',
    body: { runner: 'discover', portal: 'linkedin', mode: 'missing' },
  });

  assert.equal(response.status, 202);
  assert.deepEqual(starts[0], { runner: 'discover', options: { portal: 'linkedin', mode: 'missing' } });
  assert.equal(runState.snapshot().perPortal.linkedin.cancelled, false);
});
