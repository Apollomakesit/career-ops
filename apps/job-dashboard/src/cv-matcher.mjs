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
  'postgresql', 'mysql', 'sql', 'sqlite', 'prisma', 'sqlalchemy', 'docker', 'kubernetes',
  'graphql', 'rest api', 'git', 'webhooks', 'google cloud platform', 'cloud run',
  'shopify', 'shopify admin api', 'shopify app bridge', 'shopify billing api',
  'liquid', 'metafields', 'metaobjects', 'jquery', 'html5', 'css3',
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
  const cvTokens = expandCapabilityTokens([...setValues(cv.skills), ...setValues(cv.technologies)].map(normalize));
  const projectTokens = expandCapabilityTokens(projects.flatMap(project => projectTokenList(project)));

  const jobSkillHints = skillHints.filter(skill => jobTokens.has(skill));
  const projectMatches = projects
    .map(project => ({
      name: project.name,
      overlap: unique(projectTokenList(project).filter(token => jobTokens.has(token))),
    }))
    .filter(project => project.name && project.overlap.length > 0);
  const matchedSkills = jobSkillHints.filter(skill => cvTokens.has(skill) || projectTokens.has(skill));
  const matchedCvSkills = jobSkillHints.filter(skill => cvTokens.has(skill));
  const projectSupportedSkills = jobSkillHints.filter(skill => projectTokens.has(skill));
  const requiredTotal = jobSkillHints.length;
  const skillsScore = requiredTotal === 0 ? 0 : Math.min(100, Math.round((matchedSkills.length / requiredTotal) * 100));

  const matchedProjects = projectMatches.map(project => project.name);
  const projectsScore = requiredTotal === 0 ? 0 : Math.min(100, Math.round((projectSupportedSkills.length / requiredTotal) * 100));

  const normalizedTitle = normalize(title);
  const roleMatched = (cv.roles || []).some(role => normalizedTitle.includes(normalize(role)) || roleTerms.some(term => normalizedTitle.includes(term) && normalize(role).includes(term.split(' ')[0])));
  let roleScore = roleMatched ? 100 : roleTerms.some(term => normalizedTitle.includes(term)) ? 65 : 0;
  if (/\b(principal|staff|head of|director)\b/i.test(title) && Number(cv.yearsExperience || 0) < 8) {
    roleScore = Math.min(roleScore, 35);
  }

  const missingSkills = jobSkillHints
    .filter(skill => !cvTokens.has(skill) && !projectTokens.has(skill) && !stopWords.has(skill))
    .slice(0, 20);
  const exceedingSkills = skillHints
    .filter(skill => (cvTokens.has(skill) || projectTokens.has(skill)) && !jobSkillHints.includes(skill))
    .slice(0, 10);
  const exceedingSignals = buildExceedingSignals({ text, cv });
  const dataQuality = assessDataQuality({ text, requiredTotal });
  const penalties = buildPenalties({
    requiredTotal,
    missingSkills,
    skillsScore,
    title,
    confidence: dataQuality.confidence,
  });

  const rawScore = Math.round((skillsScore * 0.6) + (projectsScore * 0.15) + (roleScore * 0.15) + (dataQuality.score * 0.1));
  const penalizedScore = penalties.reduce((score, penalty) => score - penalty.points, rawScore);
  const score = capScore({
    score: penalizedScore,
    requiredTotal,
    skillsScore,
    confidence: dataQuality.confidence,
  });
  return {
    score: Math.max(0, Math.min(100, score)),
    matchedSkills: matchedSkills.sort(),
    missingSkills,
    matchedProjects,
    breakdown: {
      skills: skillsScore,
      projects: projectsScore,
      role: roleScore,
      dataQuality: dataQuality.score,
      confidence: dataQuality.confidence,
      rescanRecommended: dataQuality.rescanRecommended,
      requiredSkills: jobSkillHints,
      matchedRequiredSkills: matchedSkills,
      matchedCvSkills,
      projectSupportedSkills,
      matchedSkillDetails: matchedSkills.map(skill => `${skill} - ${skillSources(skill, cvTokens, projectMatches).join('; ')}`),
      missingSkillDetails: missingSkills.map(skill => `${skill} - not found in CV skills or project proof`),
      matchedProjectDetails: projectMatches.map(project => `${project.name} - ${project.overlap.join(', ')}`),
      exceedingSkills,
      exceedingSignals,
      penalties: penalties.map(penalty => `${penalty.label} (-${penalty.points})`),
      scoreFormula: `Required skills ${skillsScore}% * 60% + project evidence ${projectsScore}% * 15% + role ${roleScore}% * 15% + data quality ${dataQuality.score}% * 10% - penalties ${penalties.reduce((sum, penalty) => sum + penalty.points, 0)} = ${Math.max(0, Math.min(100, score))}%`,
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
    if (skill === 'rest api') {
      return /\bREST\s+API(?:s)?\b/i.test(source) || normalized.includes(skill);
    }
    if (skill === 'oauth') {
      return /\bOAuth(?:\s*2\.0)?\b/i.test(source) || normalized.includes(skill);
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

function skillSources(skill, cvTokens, projectMatches) {
  const sources = [];
  if (cvTokens.has(skill)) sources.push('CV skills');
  const projectNames = projectMatches
    .filter(project => project.overlap.includes(skill))
    .map(project => project.name);
  if (projectNames.length > 0) sources.push(`Project: ${projectNames.join(', ')}`);
  return sources.length > 0 ? sources : ['detected'];
}

function buildExceedingSignals({ text, cv }) {
  const signals = [];
  const requiredYears = extractRequiredYears(text);
  const candidateYears = Number(cv.yearsExperience || 0);
  if (requiredYears && candidateYears >= requiredYears + 1) {
    signals.push(`Experience: ${candidateYears}+ years exceeds ${requiredYears}+ years requested`);
  }
  return signals;
}

function extractRequiredYears(text) {
  const matches = [...String(text || '').matchAll(/\b(\d{1,2})\+?\s*(?:years?|yrs?|ani)\b/gi)]
    .map(match => Number(match[1]))
    .filter(Number.isFinite);
  return matches.length > 0 ? Math.max(...matches) : 0;
}

function assessDataQuality({ text, requiredTotal }) {
  const length = String(text || '').trim().length;
  if (requiredTotal === 0 || length < 60) {
    return {
      score: 35,
      confidence: 'low',
      rescanRecommended: true,
    };
  }
  if (requiredTotal < 4 || length < 240) {
    return {
      score: 70,
      confidence: 'medium',
      rescanRecommended: true,
    };
  }
  return {
    score: 100,
    confidence: 'high',
    rescanRecommended: false,
  };
}

function buildPenalties({ requiredTotal, missingSkills, skillsScore, title, confidence }) {
  const penalties = [];
  if (requiredTotal === 0) {
    penalties.push({ label: 'No concrete requirements detected; re-scan recommended', points: 25 });
  }
  if (requiredTotal >= 6 && missingSkills.length / requiredTotal >= 0.35) {
    penalties.push({ label: 'Missing core requirements', points: 12 });
  }
  if (/\bsenior\b/i.test(title) && requiredTotal >= 6 && skillsScore < 70) {
    penalties.push({ label: 'Senior role with incomplete required-skill coverage', points: 8 });
  }
  if (confidence === 'low') {
    penalties.push({ label: 'Low confidence job data', points: 10 });
  }
  return penalties;
}

function capScore({ score, requiredTotal, skillsScore, confidence }) {
  let capped = Math.round(score);
  if (confidence === 'low') capped = Math.min(capped, 45);
  if (requiredTotal > 0 && skillsScore === 0) capped = Math.min(capped, 25);
  else if (requiredTotal >= 6 && skillsScore < 40) capped = Math.min(capped, 60);
  else if (requiredTotal >= 6 && skillsScore < 60) capped = Math.min(capped, 74);
  return capped;
}

function setValues(value) {
  if (value instanceof Set) return [...value];
  return Array.isArray(value) ? value : [];
}

function expandCapabilityTokens(values) {
  const tokens = new Set(values.filter(Boolean));
  if (['postgresql', 'mysql', 'sqlite'].some(skill => tokens.has(skill))) tokens.add('sql');
  if (tokens.has('next.js')) tokens.add('react');
  return tokens;
}

function unique(values) {
  return [...new Set(values)];
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
