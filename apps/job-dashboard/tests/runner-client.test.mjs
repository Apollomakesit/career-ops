import test from 'node:test';
import assert from 'node:assert/strict';

import { createRunnerClient } from '../runner/api-client.mjs';

test('fetches approved packages with bearer token', async () => {
  const calls = [];
  const client = createRunnerClient({
    baseUrl: 'https://dashboard.example',
    token: 'secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse([{ id: 'pkg-1', approvalState: 'approved' }]);
    },
  });

  const packages = await client.fetchApprovedPackages();
  assert.equal(packages.length, 1);
  assert.equal(calls[0].url, 'https://dashboard.example/api/packages?approvalState=approved');
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret');
});

test('marks runner status and missing fields', async () => {
  const calls = [];
  const client = createRunnerClient({
    baseUrl: 'http://localhost:3000/',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: 'pkg-1', runnerStatus: 'ready_for_user_submit' });
    },
  });

  const result = await client.markRunnerStatus('pkg-1', {
    runnerStatus: 'ready_for_user_submit',
    missingFields: { salary: 'required' },
  });

  assert.equal(result.runnerStatus, 'ready_for_user_submit');
  assert.equal(calls[0].url, 'http://localhost:3000/api/packages/pkg-1/runner');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].options.body).missingFields, { salary: 'required' });
});

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  };
}
