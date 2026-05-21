import test from 'node:test';
import assert from 'node:assert/strict';

import { waitForDatabase } from '../src/db.mjs';

test('waitForDatabase retries transient startup connection failures', async () => {
  let calls = 0;
  const delays = [];
  const pool = {
    async query(sql) {
      calls += 1;
      assert.equal(sql, 'SELECT 1');
      if (calls < 3) throw new Error('database is still booting');
      return { rows: [{ ok: 1 }] };
    },
  };

  const result = await waitForDatabase(pool, {
    attempts: 5,
    baseDelayMs: 10,
    sleep: async ms => { delays.push(ms); },
  });

  assert.deepEqual(result.rows, [{ ok: 1 }]);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);
});

test('waitForDatabase throws after the final failed startup attempt', async () => {
  let calls = 0;
  const delays = [];
  const pool = {
    async query() {
      calls += 1;
      throw new Error(`failure ${calls}`);
    },
  };

  await assert.rejects(
    waitForDatabase(pool, {
      attempts: 3,
      baseDelayMs: 5,
      sleep: async ms => { delays.push(ms); },
    }),
    /failure 3/,
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [5, 10]);
});
