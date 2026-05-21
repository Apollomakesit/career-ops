import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRunnerPayload,
  filterEvents,
  jobsToCsv,
  nextBulkSelection,
  paginateItems,
  parseJobImport,
  validatePortalConfig,
} from '../public/dashboard-helpers.js';

test('builds missing-detail rescan payloads without a smoke URL', () => {
  assert.deepEqual(buildRunnerPayload('discover', { mode: 'missing' }), {
    runner: 'discover',
    mode: 'missing',
  });
  assert.deepEqual(buildRunnerPayload('discover', { portal: ' LinkedIn ', mode: 'missing' }), {
    runner: 'discover',
    portal: 'linkedin',
    mode: 'missing',
  });
});

test('paginates job rows with stable page bounds', () => {
  const result = paginateItems(Array.from({ length: 128 }, (_, index) => ({ id: index + 1 })), {
    page: 3,
    pageSize: 50,
  });

  assert.equal(result.page, 3);
  assert.equal(result.totalPages, 3);
  assert.equal(result.items.length, 28);
  assert.equal(result.start, 101);
  assert.equal(result.end, 128);
});

test('tracks bulk selection across visible job ids', () => {
  const current = new Set(['a', 'outside']);
  const selected = nextBulkSelection(current, ['a', 'b', 'c'], 'select-visible');

  assert.deepEqual([...selected].sort(), ['a', 'b', 'c', 'outside']);
  assert.deepEqual([...nextBulkSelection(selected, ['a', 'b'], 'clear-visible')].sort(), ['c', 'outside']);
});

test('filters activity by text, type, portal, and date range', () => {
  const events = [
    { eventType: 'job_created', message: 'LinkedIn role imported', createdAt: '2026-05-18T12:00:00Z', payload: { portal: 'linkedin' } },
    { eventType: 'portal_updated', message: 'eJobs settings saved', createdAt: '2026-05-19T12:00:00Z', payload: { portal: 'ejobs' } },
  ];

  const result = filterEvents(events, {
    q: 'role',
    type: 'job_created',
    portal: 'linkedin',
    from: '2026-05-18',
    to: '2026-05-18',
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].message, 'LinkedIn role imported');
});

test('validates portal configuration before saving', () => {
  const invalid = validatePortalConfig({
    profileUrl: 'notaurl',
    usernameEmail: 'not-an-email',
    fieldHintsText: '{bad json',
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.profileUrl, /valid URL/);
  assert.match(invalid.errors.usernameEmail, /valid email/);
  assert.match(invalid.errors.fieldHints, /valid JSON/);

  const valid = validatePortalConfig({
    profileUrl: 'https://www.linkedin.com/in/example',
    usernameEmail: 'ionut@example.com',
    fieldHintsText: '{"fieldAliases":{}}',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.fieldHints, { fieldAliases: {} });
});

test('exports and imports jobs as portable data', () => {
  const jobs = [{
    url: 'https://example.com/job/1',
    company: 'Example',
    title: 'Engineer',
    portal: 'linkedin',
    status: 'discovered',
  }];

  const csv = jobsToCsv(jobs);
  assert.match(csv, /company,title,portal,status,url/);
  assert.match(csv, /Example/);

  assert.deepEqual(parseJobImport(JSON.stringify(jobs)), jobs);
  assert.deepEqual(parseJobImport(csv), jobs);
});
