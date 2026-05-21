import test from 'node:test';
import assert from 'node:assert/strict';

import { jobFilterQueryString, sanitizeSearchQuery } from '../public/filter-query.js';

test('sanitizeSearchQuery drops dashboard URLs and autofilled emails', () => {
  assert.equal(sanitizeSearchQuery('http://127.0.0.1:3000'), '');
  assert.equal(sanitizeSearchQuery('https://localhost:3000/?workModel=remote'), '');
  assert.equal(sanitizeSearchQuery('ionut@example.com'), '');
  assert.equal(sanitizeSearchQuery('Technical Support Specialist'), 'Technical Support Specialist');
});

test('jobFilterQueryString keeps real filters but excludes URL-shaped search text', () => {
  const query = jobFilterQueryString('?workModel=remote&status=applied&sort=fit_score&dir=desc&q=http%3A%2F%2F127.0.0.1%3A3000&minMatch=75');
  assert.equal(query, '?workModel=remote&status=applied&sort=fit_score&dir=desc&minMatch=75');
});
