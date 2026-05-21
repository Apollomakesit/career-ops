import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { scoreJob } from '../src/cv-matcher.mjs';
import { loadCv } from '../src/cv-parser.mjs';
import { normalize } from '../src/skill-aliases.mjs';

test('normalizes English and Romanian aliases into canonical tokens', () => {
  assert.equal(normalize('Programator Python'), 'python developer');
  assert.equal(normalize('Dezvoltator Full Stack'), 'full stack developer');
  assert.equal(normalize('Inteligenta Artificiala'), 'artificial intelligence');
  assert.equal(normalize('telemunca'), 'remote');
  assert.equal(normalize('k8s'), 'kubernetes');
});

test('scores a React TypeScript Node posting as a strong CV match', () => {
  const cv = {
    skills: new Set(['React', 'TypeScript', 'Node.js', 'PostgreSQL']),
    technologies: new Set(['Next.js', 'Docker']),
    roles: ['Full Stack Developer'],
    yearsExperience: 5,
  };
  const projects = [{
    name: 'Full Stack Platform',
    description: 'React TypeScript Node.js PostgreSQL dashboard',
    tech: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    topics: ['dashboard'],
  }];

  const match = scoreJob({
    title: 'Full Stack Developer',
    description: 'Build React, TypeScript, Node.js and PostgreSQL applications.',
  }, { cv, projects });

  assert.ok(match.score > 70);
  assert.ok(match.matchedSkills.includes('react'));
  assert.ok(match.matchedSkills.includes('typescript'));
  assert.deepEqual(match.matchedProjects, ['Full Stack Platform']);
});

test('scores unrelated legacy mainframe work as a weak CV match', () => {
  const cv = {
    skills: new Set(['React', 'TypeScript', 'Node.js']),
    technologies: new Set(['PostgreSQL']),
    roles: ['Full Stack Developer'],
    yearsExperience: 5,
  };

  const match = scoreJob({
    title: 'COBOL Mainframe Developer',
    description: 'COBOL mainframe RPG AS/400 batch operations.',
  }, { cv, projects: [] });

  assert.ok(match.score < 20);
  assert.ok(match.missingSkills.includes('cobol'));
});

test('scores Romanian full-stack postings through canonical skill aliases', () => {
  const cv = {
    skills: new Set(['Python', 'TypeScript', 'React', 'PostgreSQL']),
    technologies: new Set(['Docker', 'Playwright']),
    roles: ['Full Stack Developer', 'Python Developer'],
    yearsExperience: 5,
  };
  const projects = [{
    name: 'Automatizari Playwright',
    description: 'Python TypeScript Playwright workflows',
    tech: ['Python', 'TypeScript', 'Playwright'],
    topics: ['automation'],
  }];

  const match = scoreJob({
    title: 'Programator Python Full Stack',
    description: 'Cerinte: React, TypeScript, PostgreSQL. Responsabilitati: dezvolti API-uri si automatizari Playwright.',
  }, { cv, projects });

  assert.ok(match.score > 70);
  assert.ok(match.matchedSkills.includes('python'));
  assert.ok(match.matchedSkills.includes('typescript'));
  assert.deepEqual(match.matchedProjects, ['Automatizari Playwright']);
});

test('explains CV matches with required, missing, project, and exceeding evidence', () => {
  const cv = {
    skills: new Set(['ServiceNow', 'Python', 'Playwright']),
    technologies: new Set(['FastAPI']),
    roles: ['Technical Support Specialist'],
    yearsExperience: 5,
  };
  const projects = [{
    name: 'Support Automation',
    description: 'ServiceNow Python Playwright automation for support teams',
    tech: ['ServiceNow', 'Python', 'Playwright'],
    topics: ['automation'],
  }];

  const match = scoreJob({
    title: 'Technical Support Specialist',
    description: 'Requirements: 3+ years experience with ServiceNow and Ivanti. Nice to have documentation.',
  }, { cv, projects });

  assert.deepEqual(match.breakdown.requiredSkills, ['servicenow', 'ivanti']);
  assert.ok(match.breakdown.matchedSkillDetails.some(item => /servicenow.*CV skills/i.test(item)));
  assert.ok(match.breakdown.missingSkillDetails.some(item => /ivanti/i.test(item)));
  assert.ok(match.breakdown.matchedProjectDetails.some(item => /Support Automation.*servicenow/i.test(item)));
  assert.ok(match.breakdown.exceedingSkills.includes('python'));
  assert.ok(match.breakdown.exceedingSignals.some(item => /5\+ years.*3\+ years/i.test(item)));
});

test('does not inflate senior full-stack roles when core requirements are missing', () => {
  const cv = {
    skills: new Set(['JavaScript', 'React', 'PostgreSQL', 'OAuth', 'Python', 'FastAPI']),
    technologies: new Set(['Next.js', 'Docker']),
    roles: ['Full Stack Developer'],
    yearsExperience: 5,
  };
  const projects = [{
    name: 'Full Stack Platform',
    description: 'React PostgreSQL FastAPI dashboard with OAuth login',
    tech: ['React', 'PostgreSQL', 'FastAPI', 'OAuth'],
    topics: ['dashboard'],
  }];

  const match = scoreJob({
    title: 'Senior Full Stack Developer',
    description: [
      'Obligatorii: React, Node.js, JavaScript, HTML5, CSS3, PostgreSQL or MySQL.',
      'GraphQL, REST APIs, Git, OAuth 2.0, webhooks, Google Cloud Platform, Cloud Run.',
      'Shopify Admin API, App Bridge, Billing API, Liquid, metafields, jQuery.',
    ].join('\n'),
  }, { cv, projects });

  assert.ok(match.score < 75);
  assert.ok(match.missingSkills.includes('node.js'));
  assert.ok(match.missingSkills.includes('graphql'));
  assert.ok(match.missingSkills.includes('google cloud platform'));
  assert.ok(match.missingSkills.includes('shopify'));
  assert.ok(match.breakdown.penalties.some(item => /missing core requirements/i.test(item)));
  assert.match(match.breakdown.scoreFormula, /Required skills/i);
});

test('marks thin postings as low confidence instead of strong matches', () => {
  const cv = {
    skills: new Set(['React', 'TypeScript', 'PostgreSQL']),
    technologies: new Set(['Next.js']),
    roles: ['Full Stack Developer'],
    yearsExperience: 5,
  };

  const match = scoreJob({
    title: 'Full Stack Developer',
    description: 'Remote role. Apply now.',
  }, { cv, projects: [] });

  assert.ok(match.score <= 45);
  assert.equal(match.breakdown.confidence, 'low');
  assert.ok(match.breakdown.rescanRecommended);
  assert.ok(match.breakdown.penalties.some(item => /No concrete requirements/i.test(item)));
});

test('loads skills from markdown subsections under the Skills heading', () => {
  const cv = loadCv(fileURLToPath(new URL('../../../cv.md', import.meta.url)));
  assert.ok(cv.skills.has('python'));
  assert.ok(cv.skills.has('typescript'));
  assert.ok(cv.skills.has('servicenow'));
  assert.ok(cv.skills.has('workspace one'));
});
