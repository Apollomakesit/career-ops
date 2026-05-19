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

test('imports discovered jobs into the dashboard', async () => {
  const calls = [];
  const client = createRunnerClient({
    baseUrl: 'https://dashboard.example/',
    token: 'secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: 'job-1', fit: { score: 86 } });
    },
  });

  const job = await client.createJob({
    url: 'https://www.ejobs.ro/user/locuri-de-munca/support/1',
    company: 'ExampleSoft',
    title: 'Application Support Engineer',
    portal: 'ejobs',
    location: 'Bucharest',
    description: 'ServiceNow MDM Python automation',
  });

  assert.equal(job.id, 'job-1');
  assert.equal(calls[0].url, 'https://dashboard.example/api/jobs');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret');
  assert.equal(JSON.parse(calls[0].options.body).portal, 'ejobs');
});

test('fetches portal configuration and creates AI-generated packages', async () => {
  const calls = [];
  const client = createRunnerClient({
    baseUrl: 'https://dashboard.example/',
    token: 'secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/api/portals')) return jsonResponse([{ portal: 'ejobs' }]);
      if (url.endsWith('/api/packages')) return jsonResponse([]);
      if (url.endsWith('/api/jobs/job-1/package')) return jsonResponse({ id: 'pkg-1' });
      return jsonResponse([]);
    },
  });

  const portals = await client.fetchPortals();
  const packages = await client.fetchPackages();
  const created = await client.createPackage('job-1', {
    coverLetter: 'Hello',
    tailoredCvMd: '# CV',
    requiredFields: {},
    missingFields: {},
  });

  assert.equal(portals[0].portal, 'ejobs');
  assert.deepEqual(packages, []);
  assert.equal(created.id, 'pkg-1');
  assert.equal(calls[2].options.method, 'POST');
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
