import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseApplicationsMarkdown,
  parseCvMarkdown,
  parsePortalsYaml,
  parseProfileYaml,
} from '../src/importers.mjs';

test('parses profile YAML into dashboard profile shape', () => {
  const profile = parseProfileYaml(`
candidate:
  full_name: Ioan Stefan Vlaicu
  email: ionut@example.com
  phone: "+40 700 000 000"
  location: Bucharest, Romania
  linkedin: linkedin.com/in/ioanstefanvlaicu
  github: github.com/Apollomakesit
target_roles:
  primary:
    - Technical Support Specialist
    - Python/FastAPI Developer
narrative:
  headline: Support engineer who builds automation
application_defaults:
  work_authorization: Authorized to work in Romania and EU
`);

  assert.equal(profile.fullName, 'Ioan Stefan Vlaicu');
  assert.equal(profile.email, 'ionut@example.com');
  assert.deepEqual(profile.targetRoles, ['Technical Support Specialist', 'Python/FastAPI Developer']);
  assert.equal(profile.applicationDefaults.work_authorization, 'Authorized to work in Romania and EU');
});

test('parses portal YAML into non-secret portal records', () => {
  const portals = parsePortalsYaml(`
portal_fields:
  ejobs:
    profile_url: https://example.com/me
    username_email: ionut@example.com
tracked_companies:
  - name: UiPath
    careers_url: https://uipath.com/careers
`);

  assert.equal(portals[0].portal, 'ejobs');
  assert.equal(portals[0].profileUrl, 'https://example.com/me');
  assert.equal(portals[0].usernameEmail, 'ionut@example.com');
});

test('parses applications markdown rows', () => {
  const rows = parseApplicationsMarkdown(`
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-05-19 | UiPath | Support Engineer | 4.2/5 | Evaluated | ✅ | [1](reports/001-uipath-2026-05-19.md) | Strong fit |
`);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].company, 'UiPath');
  assert.equal(rows[0].role, 'Support Engineer');
  assert.equal(rows[0].score, '4.2/5');
});

test('extracts skills from CV markdown', () => {
  const cv = parseCvMarkdown(`
# Ioan Stefan Vlaicu

## Skills

Python, FastAPI, ServiceNow, Workspace ONE, PostgreSQL
`);

  assert.ok(cv.text.includes('Ioan Stefan Vlaicu'));
  assert.ok(cv.skills.includes('Python'));
  assert.ok(cv.skills.includes('FastAPI'));
  assert.ok(cv.skills.includes('ServiceNow'));
});
