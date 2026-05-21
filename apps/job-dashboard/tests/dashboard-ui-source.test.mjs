import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const appSource = new URL('../public/app.js', import.meta.url);
const indexSource = new URL('../public/index.html', import.meta.url);
const stylesSource = new URL('../public/styles.css', import.meta.url);

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

test('AI scoring actions ask for confirmation before paid OpenAI requests', async () => {
  const source = await readFile(appSource, 'utf8');
  const singleScoreBody = source.match(/async function scoreWithAi\(jobId, button\) \{([\s\S]*?)\n\}/)?.[1] || '';
  const bulkScoreBody = source.match(/async function bulkAiScore\(\) \{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(singleScoreBody, /confirmAction\(\{/);
  assert.match(singleScoreBody, /This will send 1 job to OpenAI for scoring\. Continue\?/);
  assert.match(bulkScoreBody, /AI Score Jobs/);
  assert.match(bulkScoreBody, /This will send \$\{ids\.length\} job\(s\) to OpenAI for scoring\. Continue\?/);
});

test('job filters include application status in the UI and query state', async () => {
  const [source, html] = await Promise.all([
    readFile(appSource, 'utf8'),
    readFile(indexSource, 'utf8'),
  ]);

  assert.match(html, /id="status-filter"/);
  assert.match(html, /<option value="applied">Applied<\/option>/);
  assert.match(source, /'status-filter'/);
  assert.match(source, /setParam\(params, 'status', value\('status-filter'\)\)/);
  assert.match(source, /setValue\('status-filter', params\.get\('status'\) \|\| ''\)/);
});

test('initial dashboard load renders skeleton placeholders before API data arrives', async () => {
  const [source, css] = await Promise.all([
    readFile(appSource, 'utf8'),
    readFile(stylesSource, 'utf8'),
  ]);
  const initBody = source.match(/async function init\(\) \{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(source, /await init\(\)/);
  assert.match(initBody, /showSkeletons\(\)/);
  assert.match(initBody, /await loadAll\(\)/);
  assert.match(initBody, /finally \{\s*hideSkeletons\(\);?\s*\}/);
  assert.match(source, /function showSkeletons\(\)/);
  assert.match(source, /data-skeleton/);
  assert.match(css, /\.skeleton-line/);
  assert.match(css, /@keyframes skeleton-pulse/);
});
