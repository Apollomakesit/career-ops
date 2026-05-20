import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const cache = new Map();

export function loadProjects(rootDir) {
  const jsonPath = path.join(rootDir, 'projects.json');
  const mdPath = path.join(rootDir, 'projects.md');
  const filePath = existsSync(jsonPath) ? jsonPath : existsSync(mdPath) ? mdPath : '';
  if (!filePath) return [];

  const mtimeMs = statSync(filePath).mtimeMs;
  const cached = cache.get(filePath);
  if (cached?.mtimeMs === mtimeMs) return cached.value;

  const raw = readFileSync(filePath, 'utf8');
  const value = filePath.endsWith('.json') ? parseJsonProjects(raw) : parseMarkdownProjects(raw);
  cache.set(filePath, { mtimeMs, value });
  return value;
}

export function invalidateProjectsCache() {
  cache.clear();
}

function parseJsonProjects(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeProject).filter(project => project.name) : [];
  } catch {
    return [];
  }
}

function parseMarkdownProjects(raw) {
  const projects = [];
  let current = null;
  for (const line of String(raw || '').split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) projects.push(normalizeProject(current));
      current = { name: heading[1], description: '', tech: [], topics: [] };
      continue;
    }
    if (!current) continue;
    if (/tech|stack/i.test(line)) current.tech.push(...splitList(line.replace(/^[-*]\s*/, '').replace(/^[^:]+:/, '')));
    else if (/^[-*]\s+/.test(line)) current.topics.push(...splitList(line.replace(/^[-*]\s*/, '')));
    else current.description = `${current.description} ${line}`.trim();
  }
  if (current) projects.push(normalizeProject(current));
  return projects.filter(project => project.name);
}

function normalizeProject(project = {}) {
  return {
    name: String(project.name || '').trim(),
    url: String(project.url || project.link || '').trim(),
    description: String(project.description || '').trim(),
    tech: arrayOfStrings(project.tech || project.technologies || project.stack),
    topics: arrayOfStrings(project.topics || project.keywords || project.features),
  };
}

function splitList(text) {
  return String(text || '').split(/[|,;]/).map(item => item.trim()).filter(Boolean);
}

function arrayOfStrings(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  return splitList(value);
}
