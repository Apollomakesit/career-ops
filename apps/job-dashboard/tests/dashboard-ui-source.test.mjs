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

test('job list sorting is requested from the server instead of sorting only in memory', async () => {
  const source = await readFile(appSource, 'utf8');
  const currentJobsPageBody = source.match(/function currentJobsPage\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  const sortJobsBody = source.match(/async function sortJobs\(key\) \{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(source, /selected\.set\('sort', sortColumnForKey\(state\.sort\.key\)\)/);
  assert.match(source, /selected\.set\('dir', state\.sort\.direction\)/);
  assert.match(sortJobsBody, /await loadAll\(\)/);
  assert.doesNotMatch(currentJobsPageBody, /sortedJobs\(state\.jobs\)/);
  assert.doesNotMatch(source, /function sortedJobs\(jobs\)/);
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

test('manual job creation leaves empty URLs for server-side deduplication', async () => {
  const source = await readFile(appSource, 'utf8');
  const createJobBody = source.match(/async function createJob\(event\) \{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(createJobBody, /url: value\('jobUrl'\)/);
  assert.doesNotMatch(createJobBody, /manual:\$\{Date\.now\(\)\}/);
});

test('activity log polls for new events only while the tab is visible', async () => {
  const source = await readFile(appSource, 'utf8');

  assert.match(source, /setInterval\(refreshActivityEvents,\s*10000\)/);
  assert.match(source, /function isActivityViewVisible\(\)/);
  assert.match(source, /async function refreshActivityEvents\(\)/);
  assert.match(source, /if \(!isActivityViewVisible\(\)\) return/);
  assert.match(source, /api\(`\/api\/events\?since=\$\{encodeURIComponent\(lastActivityEventTimestamp\(\)\)\}`\)/);
  assert.match(source, /mergeActivityEvents\(events\)/);
  assert.match(source, /renderEvents\(\)/);
});

test('portal settings avoid plaintext password capture', async () => {
  const [source, html] = await Promise.all([
    readFile(appSource, 'utf8'),
    readFile(indexSource, 'utf8'),
  ]);

  assert.match(html, /No passwords here\. Store reusable hints only\./);
  assert.match(source, /Login email<input data-portal-email type="email" autocomplete="username"/);
  assert.doesNotMatch(source, /data-portal-password/);
});

test('operations view exposes local runner controls and live progress', async () => {
  const [source, html] = await Promise.all([
    readFile(appSource, 'utf8'),
    readFile(indexSource, 'utf8'),
  ]);

  for (const label of ['Find Jobs', 'AI Score Jobs', 'Fill Forms']) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /id="localRunnerStatus"/);
  assert.match(html, /id="runnerLogs"/);
  assert.match(source, /localRunnerUrl.*http:\/\/127\.0\.0\.1:48731/);
  assert.match(source, /localRunner\('\/start'/);
  assert.match(source, /new EventSource\('\/api\/runner\/events'\)/);
  assert.match(source, /renderRunnerStatus\(state\.runnerStatus\)/);
});

test('review queue renders side-by-side package review controls', async () => {
  const [source, css] = await Promise.all([
    readFile(appSource, 'utf8'),
    readFile(stylesSource, 'utf8'),
  ]);

  assert.match(source, /function renderPackageReviewCard\(pkg\)/);
  assert.match(source, /Fit score breakdown/);
  assert.match(source, /Draft cover letter/);
  assert.match(source, /Tailored CV excerpt/);
  assert.match(source, /data-copy-cover-letter/);
  assert.match(source, /Required fields \(\$\{fieldCount\(pkg\.requiredFields\)\}\)/);
  assert.match(source, /Missing fields \(\$\{fieldCount\(pkg\.missingFields\)\}\)/);
  assert.match(source, /<button class="primary-button" data-approve="\$\{escapeHtml\(pkg\.id\)\}"/);
  assert.match(css, /\.package-review-grid/);
  assert.match(css, /\.review-draft-columns/);
});

test('job details dialog exposes editable job fields', async () => {
  const [source, css] = await Promise.all([
    readFile(appSource, 'utf8'),
    readFile(stylesSource, 'utf8'),
  ]);

  assert.match(source, /function renderJobEditForm\(job\)/);
  for (const field of ['title', 'company', 'location', 'status', 'url', 'notes']) {
    assert.match(source, new RegExp(`data-job-edit-field="${field}"`));
  }
  assert.match(source, /data-save-job-edit/);
  assert.match(source, /api\(`\/api\/jobs\/\$\{jobId\}`,\s*\{ method: 'PATCH', body: updates \}\)/);
  assert.match(css, /\.job-edit-panel/);
});
