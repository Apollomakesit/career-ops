import { parseWorkModel } from '../runner/parsers/work-model.mjs';
import { parsePostedDate } from '../runner/parsers/posted-date.mjs';

const KNOWN_WORK_MODELS = new Set(['remote', 'hybrid', 'onsite']);

export function jobTextForDerivation(job = {}) {
  return [
    job.location,
    job.title,
    job.description,
    job.requirements_text || job.requirementsText,
    job.responsibilities_text || job.responsibilitiesText,
  ].filter(Boolean).join('\n');
}

export function deriveWorkModel(job = {}) {
  const existing = String(job.work_model ?? job.workModel ?? '').trim().toLowerCase();
  if (KNOWN_WORK_MODELS.has(existing)) return existing;
  const parsed = parseWorkModel(jobTextForDerivation(job));
  return KNOWN_WORK_MODELS.has(parsed) ? parsed : 'unknown';
}

export function derivePostedDate(job = {}) {
  const existing = job.posted_date ?? job.postedDate;
  if (existing) return existing;
  return parsePostedDate(jobTextForDerivation(job)) || null;
}

export function deriveJobFields(job = {}) {
  return {
    work_model: deriveWorkModel(job),
    posted_date: derivePostedDate(job),
  };
}
