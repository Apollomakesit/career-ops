import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const appSource = new URL('../public/app.js', import.meta.url);

test('job details dialog wires Generate Package to the package generator', async () => {
  const source = await readFile(appSource, 'utf8');

  assert.match(source, /data-generate-package-job="\$\{job\.id\}"/);
  assert.match(source, /generatePackage\(button\.dataset\.generatePackageJob,\s*button\)/);
});

test('job details dialog renders generated AI drafts inline', async () => {
  const source = await readFile(appSource, 'utf8');

  assert.match(source, /Generate AI Draft/);
  assert.match(source, /data-job-package-section=/);
  assert.match(source, /data-package-error/);
  assert.match(source, /const pkg = await withRetry\(\(\) => api\(`\/api\/jobs\/\$\{jobId\}\/package\/generate`/);
  assert.match(source, /upsertPackageState\(pkg\)/);
  assert.match(source, /renderJobPackageSection\(jobId,\s*pkg\)/);
});

test('job list requests one server-side page at a time', async () => {
  const source = await readFile(appSource, 'utf8');

  assert.match(source, /normalizeJobsResponse\(jobsResponse\)/);
  assert.match(source, /selected\.set\('limit', String\(state\.jobPageSize\)\)/);
  assert.match(source, /selected\.set\('offset', String\(\(state\.jobPage - 1\) \* state\.jobPageSize\)\)/);
  assert.doesNotMatch(source, /selected\.set\('limit', '5000'\)/);
});
