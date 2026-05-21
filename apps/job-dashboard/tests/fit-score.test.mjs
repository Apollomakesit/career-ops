import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreJobFit } from '../src/fit-score.mjs';

const profile = {
  targetRoles: [
    'Technical Support Specialist',
    'Application Support Engineer',
    'MDM Administrator',
    'Python/FastAPI Developer',
    'Full-Stack Developer',
    'AI/Automation Engineer',
  ],
  skills: [
    'ServiceNow',
    'Jira',
    'Salesforce',
    'Workspace ONE',
    'AirWatch',
    'Ivanti',
    'SOTI',
    'Python',
    'FastAPI',
    'Next.js',
    'React',
    'PostgreSQL',
    'Docker',
    'Railway',
    'Playwright',
  ],
  location: 'Bucharest, Romania',
};

test('scores MDM application support roles as strong fits', () => {
  const result = scoreJobFit({
    title: 'Application Support Engineer - MDM',
    company: 'ExampleCo',
    location: 'Bucharest, Romania Hybrid',
    description: 'Support enterprise customers using ServiceNow, Workspace ONE AirWatch, Ivanti, Android and iOS mobile device fleets. Own escalations and document root cause analysis.',
  }, profile);

  assert.equal(result.category, 'support_mdm');
  assert.ok(result.score >= 85, `expected strong fit, got ${result.score}`);
  assert.ok(result.matchedSkills.includes('ServiceNow'));
  assert.ok(result.matchedSkills.includes('Workspace ONE'));
  assert.equal(result.recommendation, 'strong_apply');
});

test('scores compatible Python/FastAPI developer roles as solid but not support-primary fits', () => {
  const result = scoreJobFit({
    title: 'Python FastAPI Developer',
    company: 'ExampleSoft',
    location: 'Remote Romania',
    description: 'Build APIs with Python, FastAPI, PostgreSQL, Docker, CI/CD and React dashboards for internal tools.',
  }, profile);

  assert.equal(result.category, 'developer');
  assert.ok(result.score >= 70 && result.score < 90, `expected solid developer fit, got ${result.score}`);
  assert.ok(result.matchedSkills.includes('FastAPI'));
  assert.ok(result.missingSkills.length >= 1);
});

test('does not list skills the candidate already has as profile gaps', () => {
  // Workspace ONE, AirWatch, Ivanti, SOTI, Android, iOS are all in the
  // candidate profile. When the JD doesn't reprint them, they must NOT come
  // back as "Profile gaps vs role" — that was the misleading behavior before.
  const result = scoreJobFit({
    title: 'Technical Support Engineer',
    company: 'Cegeka',
    location: 'Romania (Remote)',
    description: 'You will work with ServiceNow tickets and Python scripts.',
  }, {
    ...profile,
    skills: [...profile.skills, 'Android', 'iOS'],
  });
  assert.deepEqual(result.missingSkills, []);
});

test('penalizes pure sales and internship roles', () => {
  const result = scoreJobFit({
    title: 'Junior Sales Internship',
    company: 'SalesCo',
    location: 'Bucharest',
    description: 'Door to door sales internship for students with cold calling and field sales targets.',
  }, profile);

  assert.ok(result.score < 35, `expected low score, got ${result.score}`);
  assert.equal(result.recommendation, 'skip');
  assert.ok(result.riskFlags.includes('internship_or_student'));
  assert.ok(result.riskFlags.includes('pure_sales'));
});
