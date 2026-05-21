import test from 'node:test';
import assert from 'node:assert/strict';

import { createRunnerClient } from '../runner/api-client.mjs';

test('runner client can request incomplete jobs beyond the dashboard page', async () => {
  let requestedUrl = '';
  const client = createRunnerClient({
    baseUrl: 'http://dashboard.local',
    fetchImpl: async url => {
      requestedUrl = String(url);
      return {
        ok: true,
        async json() {
          return [];
        },
      };
    },
  });

  await client.fetchJobs({ incomplete: true, limit: 5000, portal: ['linkedin', 'ejobs'] });

  const parsed = new URL(requestedUrl);
  assert.equal(parsed.pathname, '/api/jobs');
  assert.equal(parsed.searchParams.get('incomplete'), '1');
  assert.equal(parsed.searchParams.get('limit'), '5000');
  assert.equal(parsed.searchParams.get('portal'), 'linkedin,ejobs');
});
