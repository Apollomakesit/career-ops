import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const routesSource = new URL('../src/routes.mjs', import.meta.url);

test('rescoreCvMatches batches database writes inside a transaction', async () => {
  const source = await readFile(routesSource, 'utf8');
  const rescoreBody = source.match(/async rescoreCvMatches\(\) \{([\s\S]*?)\n    \},/)?.[1] || '';

  assert.doesNotMatch(rescoreBody, /await this\.updateJobCvMatch/);
  assert.match(source, /async function updateJobCvMatchBatch/);
  assert.match(source, /client\.query\('BEGIN'\)/);
  assert.match(source, /UPDATE jobs[\s\S]*FROM \(VALUES/);
});
