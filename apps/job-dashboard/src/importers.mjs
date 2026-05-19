import 'dotenv/config';

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

import { createPool } from './db.mjs';
import { migrate } from './schema.mjs';
import { scoreJobFit } from './fit-score.mjs';

const KNOWN_SKILLS = [
  'ServiceNow',
  'Salesforce',
  'Jira',
  'Workspace ONE',
  'AirWatch',
  'Ivanti',
  'MobileIron',
  'SOTI',
  'Android',
  'iOS',
  'Python',
  'FastAPI',
  'JavaScript',
  'TypeScript',
  'Next.js',
  'React',
  'PostgreSQL',
  'Prisma',
  'SQLAlchemy',
  'Tailwind CSS',
  'Docker',
  'Railway',
  'Supabase',
  'Playwright',
  'OpenCV',
  'Chrome extension',
  'MDM',
  'ITSM',
];

export function parseProfileYaml(text) {
  const doc = yaml.load(text) || {};
  const candidate = doc.candidate || {};
  const targetRoles = doc.target_roles?.primary || [];
  const narrative = doc.narrative || {};

  return {
    fullName: candidate.full_name || '',
    email: candidate.email || '',
    phone: candidate.phone || '',
    location: candidate.location || '',
    linkedin: candidate.linkedin || '',
    github: candidate.github || '',
    headline: narrative.headline || '',
    targetRoles,
    skills: [
      ...(narrative.superpowers || []),
      ...((narrative.proof_points || []).map(point => point.name)),
    ],
    applicationDefaults: doc.application_defaults || {},
  };
}

export function parsePortalsYaml(text) {
  const doc = yaml.load(text) || {};
  const fields = doc.portal_fields || {};
  return Object.entries(fields).map(([portal, value]) => ({
    portal,
    profileUrl: value?.profile_url || '',
    usernameEmail: value?.username_email || '',
    fieldHints: value?.field_hints || {},
    notes: value?.notes || '',
  }));
}

export function parseApplicationsMarkdown(text) {
  return text
    .split(/\r?\n/)
    .filter(line => /^\|\s*\d+\s*\|/.test(line))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells.length >= 9)
    .map(cells => ({
      number: Number(cells[0]),
      date: cells[1],
      company: cells[2],
      role: cells[3],
      score: cells[4],
      status: cells[5],
      pdf: cells[6],
      report: cells[7],
      notes: cells[8],
    }));
}

export function parseCvMarkdown(text) {
  return {
    text,
    skills: KNOWN_SKILLS.filter(skill => text.toLowerCase().includes(skill.toLowerCase())),
  };
}

export async function importLocalCareerOps(rootDir = process.cwd(), pool = createPool()) {
  await migrate(pool);

  const cvPath = path.join(rootDir, 'cv.md');
  const profilePath = path.join(rootDir, 'config', 'profile.yml');
  const portalsPath = path.join(rootDir, 'portals.yml');
  const applicationsPath = path.join(rootDir, 'data', 'applications.md');

  const cv = existsSync(cvPath) ? parseCvMarkdown(readFileSync(cvPath, 'utf8')) : { text: '', skills: [] };
  const profile = existsSync(profilePath) ? parseProfileYaml(readFileSync(profilePath, 'utf8')) : {};
  profile.skills = [...new Set([...(profile.skills || []), ...cv.skills])];

  await upsertProfile(pool, profile);

  if (existsSync(portalsPath)) {
    for (const portal of parsePortalsYaml(readFileSync(portalsPath, 'utf8'))) {
      await upsertPortal(pool, portal);
    }
  }

  if (existsSync(applicationsPath)) {
    for (const app of parseApplicationsMarkdown(readFileSync(applicationsPath, 'utf8'))) {
      const fit = scoreJobFit({
        title: app.role,
        company: app.company,
        description: app.notes,
      }, profile);
      await upsertJob(pool, {
        url: `local:applications/${app.number}`,
        company: app.company,
        title: app.role,
        portal: 'manual',
        location: profile.location || '',
        description: app.notes,
        source: 'applications.md',
        status: app.status || 'Evaluated',
        fit,
      });
    }
  }
}

async function upsertProfile(pool, profile) {
  await pool.query(`
    INSERT INTO profile (
      active, full_name, email, phone, location, linkedin, github, headline,
      target_roles, skills, application_defaults, updated_at
    )
    VALUES (TRUE, $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, now())
  `, [
    profile.fullName || '',
    profile.email || '',
    profile.phone || '',
    profile.location || '',
    profile.linkedin || '',
    profile.github || '',
    profile.headline || '',
    JSON.stringify(profile.targetRoles || []),
    JSON.stringify(profile.skills || []),
    JSON.stringify(profile.applicationDefaults || {}),
  ]);
}

async function upsertPortal(pool, portal) {
  await pool.query(`
    INSERT INTO portal_credentials (portal, profile_url, username_email, field_hints, notes, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, now())
    ON CONFLICT (portal) DO UPDATE SET
      profile_url = EXCLUDED.profile_url,
      username_email = EXCLUDED.username_email,
      field_hints = EXCLUDED.field_hints,
      notes = EXCLUDED.notes,
      updated_at = now()
  `, [
    portal.portal,
    portal.profileUrl,
    portal.usernameEmail,
    JSON.stringify(portal.fieldHints || {}),
    portal.notes || '',
  ]);
}

async function upsertJob(pool, job) {
  await pool.query(`
    INSERT INTO jobs (
      url, company, title, portal, location, description, source, status,
      fit_score, fit_category, matched_skills, missing_skills, risk_flags,
      recommendation, fit_reasons, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15::jsonb, now())
    ON CONFLICT (url) DO UPDATE SET
      company = EXCLUDED.company,
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      fit_score = EXCLUDED.fit_score,
      fit_category = EXCLUDED.fit_category,
      matched_skills = EXCLUDED.matched_skills,
      missing_skills = EXCLUDED.missing_skills,
      risk_flags = EXCLUDED.risk_flags,
      recommendation = EXCLUDED.recommendation,
      fit_reasons = EXCLUDED.fit_reasons,
      updated_at = now()
  `, [
    job.url,
    job.company,
    job.title,
    job.portal,
    job.location,
    job.description,
    job.source,
    job.status,
    job.fit.score,
    job.fit.category,
    JSON.stringify(job.fit.matchedSkills),
    JSON.stringify(job.fit.missingSkills),
    JSON.stringify(job.fit.riskFlags),
    job.fit.recommendation,
    JSON.stringify(job.fit.reasons),
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  try {
    await importLocalCareerOps(path.resolve(process.cwd(), '..', '..'), pool);
    console.log('local career-ops data imported');
  } finally {
    await pool.end();
  }
}
