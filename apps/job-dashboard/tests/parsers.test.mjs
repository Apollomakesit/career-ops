import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEmploymentType } from '../runner/parsers/employment-type.mjs';
import { parsePostedDate } from '../runner/parsers/posted-date.mjs';
import { parseSalary } from '../runner/parsers/salary.mjs';
import { parseWorkModel } from '../runner/parsers/work-model.mjs';

test('parses Romanian and international salary ranges', () => {
  assert.deepEqual(parseSalary('2500-4000 EUR/luna'), {
    min: 2500,
    max: 4000,
    currency: 'EUR',
    period: 'month',
  });
  assert.deepEqual(parseSalary('15.000 RON brut/luna'), {
    min: 15000,
    max: 15000,
    currency: 'RON',
    period: 'month',
  });
  assert.deepEqual(parseSalary('$60k-$80k/year'), {
    min: 60000,
    max: 80000,
    currency: 'USD',
    period: 'year',
  });
});

test('parses work model aliases', () => {
  assert.equal(parseWorkModel('telemunca de acasa'), 'remote');
  assert.equal(parseWorkModel('program hibrid Bucuresti'), 'hybrid');
  assert.equal(parseWorkModel('la sediu / on-site'), 'onsite');
  assert.equal(parseWorkModel('program flexibil'), 'unknown');
});

test('hybrid wins when both remote and hybrid appear in body text', () => {
  // The dashboard concatenates work-model selector hits with description text,
  // so postings that link "Remote Jobs" in their sidebar but say "Hybrid" in
  // the body must classify as hybrid.
  assert.equal(parseWorkModel('Remote Jobs\nRemote work: Hybrid'), 'hybrid');
  assert.equal(parseWorkModel('Bucharest, Romania (Hybrid)'), 'hybrid');
});

test('parses office-based aliases as onsite', () => {
  assert.equal(parseWorkModel('Customer Support - Office Based'), 'onsite');
  assert.equal(parseWorkModel('Work office based, One Cotroceni Park'), 'onsite');
  assert.equal(parseWorkModel('fully onsite role'), 'onsite');
});

test('parses posted dates from relative and absolute text', () => {
  const now = new Date('2026-05-20T12:00:00.000Z');
  assert.equal(parsePostedDate('acum 3 zile', now), '2026-05-17T12:00:00.000Z');
  assert.equal(parsePostedDate('ieri', now), '2026-05-19T12:00:00.000Z');
  assert.equal(parsePostedDate('Posted on 2026-05-12', now), '2026-05-12T00:00:00.000Z');
});

test('parses employment type aliases', () => {
  assert.equal(parseEmploymentType('full-time contract'), 'full-time');
  assert.equal(parseEmploymentType('part time'), 'part-time');
  assert.equal(parseEmploymentType('internship program'), 'internship');
  assert.equal(parseEmploymentType('B2B contractor'), 'contract');
});
