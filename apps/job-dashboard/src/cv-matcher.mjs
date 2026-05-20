import path from 'node:path';

import { loadCv, repoRoot } from './cv-parser.mjs';
import { loadProjects } from './projects-loader.mjs';
import { normalize, tokenize } from './skill-aliases.mjs';

const roleTerms = [
  'full stack developer',
  'backend engineer',
  'python developer',
  'ai engineer',
  'automation engineer',
  'software engineer',
  'application support engineer',
  'dezvoltator full stack',
  'programator backend',
  'programator python',
  'inginer software',
  'inginer ai',
  'specialist ai',
  'inginer automatizari',
];

const skillHints = [
  'javascript', 'typescript', 'python', 'react', 'next.js', 'node.js', 'fastapi',
  'postgresql', 'sqlite', 'prisma', 'sqlalchemy', 'docker', 'kubernetes',
  'railway', 'supabase', 'tailwind', 'stripe', 'oauth', 'servicenow',
  'salesforce', 'jira', 'mdm', 'workspace one', 'ivanti', 'soti', 'android',
  'ios', 'playwright', 'vitest', 'pytest', 'flask', 'opencv', 'cobol',
  'mainframe', 'rpg', 'as/400',
];

const stopWords = new Set([
  'and', 'or', 'the', 'with', 'for', 'from', 'this', 'that', 'you', 'your',
  'our', 'team', 'teams', 'work', 'works', 'working', 'experience', 'years',
  'role', 'job', 'candidate', 'company', 'bucuresti', 'bucharest', 'romania',
  'remote', 'hybrid', 'onsite', 'full-time', 'full', 'time', 'part',
]);

let matcherCache = null;

export async function getMatcherContext(rootDir = repoRoot) {
  const cv = loadCv(path.join(rootDir, 'cv.md'));
  const projects = loadProjects(rootDir);
  matcherCache = { rootDir, cv, projects };
  return matcherCache;
}

export function clearMatcherContextCache() {
  matcherCache = null;
}

export function scoreJob(job = {}, { cv = emptyCv(), projects = [] } = {}) {
  const title = String(job.title || '');
  const text = [
    title,
    job.description,
    job.requirements_text || job.requirementsText,
    job.responsibilities_text || job.responsibilitiesText,
  ].filter(Boolean).join('\n');
  const jobTokens = new Set([...tokenize(text), ...extractKnownPhrases(text)]);
  const titleTokens = new Set([...tokenize(title), ...extractKnownPhrases(title)]);
  const cvTokens = new Set([...setValues(cv.skills), ...setValues(cv.technologies)].map(normalize));
  const projectTokens = new Set(projects.flatMap(project => projectTokenList(project)));

  const jobSkillHints = skillHints.filter(skill => jobTokens.has(skill));
  const matchedSkills = jobSkillHints.filter(skill => cvTokens.has(skill));
  const weightedMatches = matchedSkills.reduce((sum, skill) => sum + (titleTokens.has(skill) ? 2 : 1), 0);
  const weightedTotal = Math.max(1, jobSkillHints.reduce((sum, skill) => sum + (titleTokens.has(skill) ? 2 : 1), 0));
  const skillsScore = Math.min(100, Math.round((weightedMatches / weightedTotal) * 100));

  const matchedProjects = [];
  for (const project of projects) {
    const tokens = projectTokenList(project);
    const overlap = tokens.filter(token => jobTokens.has(token));
    if (overlap.length > 0) matchedProjects.push(project.name);
  }
  const projectsScore = projects.length === 0 ? 0 : Math.min(100, Math.round((matchedProjects.length / Math.min(projects.length, 3)) * 100));

  const normalizedTitle = normalize(title);
  const roleMatched = (cv.roles || []).some(role => normalizedTitle.includes(normalize(role)) || roleTerms.some(term => normalizedTitle.includes(term) && normalize(role).includes(term.split(' ')[0])));
  let roleScore = roleMatched ? 100 : roleTerms.some(term => normalizedTitle.includes(term)) ? 65 : 0;
  if (/\b(principal|staff|head of|director)\b/i.test(title) && Number(cv.yearsExperience || 0) < 8) {
    roleScore = Math.min(roleScore, 35);
  }

  const missingSkills = jobSkillHints
    .filter(skill => !cvTokens.has(skill) && !projectTokens.has(skill) && !stopWords.has(skill))
    .slice(0, 10);

  const score = Math.round((skillsScore * 0.6) + (projectsScore * 0.25) + (roleScore * 0.15));
  return {
    score: Math.max(0, Math.min(100, score)),
    matchedSkills: matchedSkills.sort(),
    missingSkills,
    matchedProjects,
    breakdown: {
      skills: skillsScore,
      projects: projectsScore,
      role: roleScore,
    },
  };
}

function extractKnownPhrases(text) {
  const source = String(text || '');
  const normalized = normalize(text);
  return skillHints.filter(skill => {
    if (skill === 'react') {
      return /\bReact(?:\.js|JS)?\b/.test(source) || /\breact(?:\.js|js)\b/i.test(source);
    }
    return normalized.includes(skill);
  });
}

function projectTokenList(project = {}) {
  return [
    ...extractKnownPhrases(project.description || ''),
    ...(project.tech || []).map(normalize),
    ...(project.topics || []).flatMap(topic => extractKnownPhrases(topic)),
  ].filter(Boolean);
}

function setValues(value) {
  if (value instanceof Set) return [...value];
  return Array.isArray(value) ? value : [];
}

function emptyCv() {
  return {
    raw: '',
    skills: new Set(),
    technologies: new Set(),
    roles: [],
    yearsExperience: 0,
    projectNames: [],
  };
}
