import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalize, tokenize } from './skill-aliases.mjs';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(srcDir, '..', '..', '..');
const emptyCv = () => ({
  raw: '',
  skills: new Set(),
  technologies: new Set(),
  roles: [],
  yearsExperience: 0,
  projectNames: [],
});
const cache = new Map();

export function loadCv(filePath = path.join(repoRoot, 'cv.md')) {
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved)) return emptyCv();
  const mtimeMs = statSync(resolved).mtimeMs;
  const cached = cache.get(resolved);
  if (cached?.mtimeMs === mtimeMs) return cached.value;

  const raw = readFileSync(resolved, 'utf8');
  const skillsText = markdownBlock(raw, /skills/i);
  const experienceText = markdownBlock(raw, /experience|work/i);
  const projectsText = markdownBlock(raw, /projects/i);
  const profileLine = raw.split(/\r?\n/).find(line => /target roles/i.test(line)) || '';

  const skills = extractListTokens(skillsText);
  const technologies = new Set([
    ...tokensFromBackticks(raw),
    ...extractListTokens([skillsText, projectsText].join('\n')),
  ]);
  const roles = extractRoles(profileLine, experienceText);
  const yearsExperience = extractYears(raw);
  const projectNames = [...projectsText.matchAll(/^###\s+(.+)$/gmi)].map(match => match[1].trim());

  const value = { raw, skills, technologies, roles, yearsExperience, projectNames };
  cache.set(resolved, { mtimeMs, value });
  return value;
}

export function invalidateCvCache() {
  cache.clear();
}

function markdownBlock(raw, headingPattern) {
  const lines = String(raw || '').split(/\r?\n/);
  const blocks = [];
  let active = false;
  let body = [];
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      if (active) blocks.push(body.join('\n'));
      active = headingPattern.test(h2[1]);
      body = [];
      continue;
    }
    if (active) body.push(line);
  }
  if (active) blocks.push(body.join('\n'));
  return blocks.join('\n');
}

function extractListTokens(text) {
  const values = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!/^\s*[-*]|\|/.test(line) && !line.includes(',')) continue;
    for (const part of line.split(/[|,;:]/)) {
      const clean = part.replace(/^\s*[-*]\s*/, '').replace(/\*\*/g, '').trim();
      if (!clean || clean.length > 60) continue;
      values.add(normalize(clean));
    }
  }
  for (const token of tokenize(text)) {
    if (isLikelySkill(token)) values.add(token);
  }
  return values;
}

function tokensFromBackticks(text) {
  return [...String(text || '').matchAll(/`([^`]+)`/g)].map(match => normalize(match[1]));
}

function extractRoles(profileLine, experienceText) {
  const roles = new Set();
  const roleSource = `${profileLine}\n${experienceText}`;
  for (const match of roleSource.matchAll(/(?:^|\n)#{3}\s+(.+?)(?:\s+-\s+|$)/g)) {
    roles.add(match[1].trim());
  }
  const target = profileLine.split(':').slice(1).join(':');
  for (const item of target.split(',')) {
    const clean = item.replace(/\*\*/g, '').trim();
    if (clean) roles.add(clean);
  }
  return [...roles].slice(0, 24);
}

function extractYears(raw) {
  const explicit = String(raw || '').match(/(\d+)\+?\s+years?/i);
  if (explicit) return Number(explicit[1]);
  const years = [...String(raw || '').matchAll(/\b(20\d{2}|19\d{2})\b/g)].map(match => Number(match[1]));
  if (years.length < 2) return 0;
  return Math.max(...years) - Math.min(...years);
}

function isLikelySkill(token) {
  return /^(python|fastapi|javascript|typescript|react|next\.js|node\.js|postgresql|prisma|docker|railway|supabase|servicenow|salesforce|jira|mdm|workspace one|ivanti|soti|android|ios|playwright|kubernetes|sqlite|sqlalchemy|tailwind|stripe|oauth|vitest|pytest)$/.test(token);
}
