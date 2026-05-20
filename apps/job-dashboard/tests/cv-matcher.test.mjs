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

test('loads skills from markdown subsections under the Skills heading', () => {
  const cv = loadCv(fileURLToPath(new URL('../../../cv.md', import.meta.url)));
  assert.ok(cv.skills.has('python'));
  assert.ok(cv.skills.has('typescript'));
  assert.ok(cv.skills.has('servicenow'));
  assert.ok(cv.skills.has('workspace one'));
});
