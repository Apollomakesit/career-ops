import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clearMatcherContextCache, getMatcherContext, scoreJob } from './cv-matcher.mjs';
import { invalidateCvCache } from './cv-parser.mjs';
import { scoreJobFit } from './fit-score.mjs';
import { invalidateProjectsCache } from './projects-loader.mjs';
import { deriveJobFields } from './job-derivers.mjs';
import {
  generateAiFitScore as defaultGenerateAiFitScore,
  generateApplicationPackage as defaultGenerateApplicationPackage,
} from './ai-generator.mjs';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(srcDir, '..', '..', '..');
const defaultCvPath = path.join(repoRoot, 'cv.md');

export async function dispatchApi(request, store, services = {}) {
  const url = new URL(request.url, 'http://dashboard.local');
  const method = request.method.toUpperCase();
  const segments = url.pathname.split('/').filter(Boolean);
  const generateApplicationPackage = services.generateApplicationPackage || defaultGenerateApplicationPackage;
  const generateAiFitScore = services.generateAiFitScore || defaultGenerateAiFitScore;
  const readCv = services.readCv || defaultReadCv;
  const writeCv = services.writeCv || defaultWriteCv;
  const fetchImpl = services.fetchImpl || fetch;

  try {
    if (method === 'GET' && url.pathname === '/api/health') {
      return healthResponse(store);
    }

    if (method === 'GET' && url.pathname === '/api/profile') {
      return json(200, await store.getProfile());
    }

    if (method === 'GET' && url.pathname === '/api/cv') {
      return json(200, { markdown: await readCv() });
    }

    if (method === 'PUT' && url.pathname === '/api/cv') {
      const { markdown } = request.body || {};
      if (typeof markdown !== 'string' || !markdown.trim()) {
        return json(400, { error: 'cv_markdown_required', message: 'CV markdown cannot be empty.' });
      }
      const result = await writeCv(markdown);
      invalidateCvCache();
      invalidateProjectsCache();
      clearMatcherContextCache();
      return json(200, result || { markdown });
    }

    if (method === 'POST' && url.pathname === '/api/cv/rescore-all') {
      if (typeof store.rescoreCvMatches === 'function') {
        return json(200, await store.rescoreCvMatches());
      }
      return json(200, { updated: 0 });
    }

    if (method === 'PUT' && url.pathname === '/api/profile') {
      return json(200, await store.updateProfile(request.body || {}));
    }

    if (method === 'GET' && url.pathname === '/api/portals') {
      return json(200, await store.listPortals());
    }

    if (method === 'PUT' && segments[0] === 'api' && segments[1] === 'portals' && segments[2]) {
      return json(200, await store.upsertPortal({ ...(request.body || {}), portal: segments[2] }));
    }

    if (method === 'GET' && url.pathname === '/api/jobs/stats') {
      return json(200, typeof store.listJobStats === 'function'
        ? await store.listJobStats()
        : { total: 0, incomplete: 0, byPortal: [] });
    }

    if (method === 'GET' && url.pathname === '/api/jobs') {
      return json(200, await store.listJobs(filtersFromSearch(url.searchParams)));
    }

    if (method === 'POST' && url.pathname === '/api/jobs') {
      const profile = await store.getProfile();
      const fit = scoreJobFit(request.body || {}, {
        targetRoles: profile?.targetRoles || profile?.target_roles || [],
        skills: profile?.skills || [],
        location: profile?.location || '',
      });
      const cvMatch = scoreJob(request.body || {}, await getMatcherContext());
      return json(201, await store.createJob({ ...(request.body || {}), fit, cvMatch }));
    }

    if (method === 'PATCH' && segments[0] === 'api' && segments[1] === 'jobs' && segments[2] === 'bulk') {
      const ids = arrayOfStrings((request.body || {}).ids);
      const status = String((request.body || {}).status || '').trim();
      if (ids.length === 0 || !status) return json(400, { error: 'ids_and_status_required' });
      return json(200, typeof store.updateJobStatuses === 'function'
        ? await store.updateJobStatuses(ids, status)
        : { updated: 0 });
    }

    if (method === 'DELETE' && segments[0] === 'api' && segments[1] === 'jobs' && segments[2] === 'bulk') {
      const ids = arrayOfStrings((request.body || {}).ids);
      if (ids.length === 0) return json(400, { error: 'ids_required' });
      return json(200, typeof store.deleteJobs === 'function'
        ? await store.deleteJobs(ids)
        : { deleted: 0 });
    }

    if (method === 'GET' && segments[0] === 'api' && segments[1] === 'jobs' && segments[3] === 'detail') {
      const job = typeof store.getJobDetail === 'function'
        ? await store.getJobDetail(segments[2])
        : await store.getJob(segments[2]);
      if (!job) return json(404, { error: 'job_not_found' });
      return json(200, job);
    }

    if (method === 'PATCH' && segments[0] === 'api' && segments[1] === 'jobs' && segments[3] === 'fit') {
      const job = await store.getJob(segments[2]);
      if (!job) return json(404, { error: 'job_not_found' });
      if (!hasFitScorePayload(request.body || {})) return json(400, { error: 'fit_score_required' });
      return json(200, await store.updateJobFit(segments[2], request.body || {}));
    }

    if (method === 'POST' && segments[0] === 'api' && segments[1] === 'jobs' && segments[3] === 'fit' && segments[4] === 'generate') {
      const job = await store.getJob(segments[2]);
      if (!job) return json(404, { error: 'job_not_found' });
      const profile = await store.getProfile();
      try {
        const matcherContext = await getMatcherContext();
        const generated = await generateAiFitScore({
          profile,
          job,
          rulesFit: jobToFit(job),
          cv: matcherContext.cv,
          projects: matcherContext.projects,
          provider: services.aiProvider,
          apiKey: services.aiApiKey ?? services.openaiApiKey,
          model: services.aiModel ?? services.openaiModel,
          baseUrl: services.aiBaseUrl,
          fetchImpl: services.fetchImpl,
        });
        return json(200, await store.updateJobFit(segments[2], generated));
      } catch (error) {
        if (error.code === 'ai_not_configured' || error.code === 'ai_generation_failed') {
          return json(error.status || 424, { error: error.code, message: error.message });
        }
        throw error;
      }
    }

    if (method === 'POST' && segments[0] === 'api' && segments[1] === 'jobs' && segments[3] === 'package' && segments[4] === 'generate') {
      const job = await store.getJob(segments[2]);
      if (!job) return json(404, { error: 'job_not_found' });
      const profile = await store.getProfile();
      try {
        const matcherContext = await getMatcherContext();
        const generated = await generateApplicationPackage({
          profile,
          job,
          cv: matcherContext.cv,
          projects: matcherContext.projects,
          provider: services.aiProvider,
          apiKey: services.aiApiKey ?? services.openaiApiKey,
          model: services.aiModel ?? services.openaiModel,
          baseUrl: services.aiBaseUrl,
          fetchImpl: services.fetchImpl,
        });
        const pkg = await store.createPackage(segments[2], generated);
        return json(pkg?.wasCreated === false ? 200 : 201, pkg);
      } catch (error) {
        if (error.code === 'ai_not_configured' || error.code === 'ai_generation_failed') {
          return json(error.status || 424, { error: error.code, message: error.message });
        }
        throw error;
      }
    }

    if (method === 'GET' && url.pathname === '/api/packages') {
      return json(200, await store.listPackages({
        approvalState: url.searchParams.get('approvalState') || undefined,
      }));
    }

    if (method === 'POST' && segments[0] === 'api' && segments[1] === 'jobs' && segments[3] === 'package') {
      const job = await store.getJob(segments[2]);
      if (!job) return json(404, { error: 'job_not_found' });
      const pkg = await store.createPackage(segments[2], request.body || {});
      return json(pkg?.wasCreated === false ? 200 : 201, pkg);
    }

    if (method === 'POST' && segments[0] === 'api' && segments[1] === 'packages' && segments[3] === 'approve') {
      return json(200, await store.approvePackage(segments[2]));
    }

    if (method === 'PATCH' && segments[0] === 'api' && segments[1] === 'packages' && segments[3] === 'runner') {
      return json(200, await store.updateRunnerStatus(segments[2], request.body || {}));
    }

    if (method === 'GET' && url.pathname === '/api/events') {
      return json(200, await store.listEvents());
    }

    if (method === 'GET' && url.pathname === '/api/runner/state') {
      return json(200, await store.getRunnerState());
    }

    if (method === 'PATCH' && url.pathname === '/api/runner/state') {
      return json(200, await store.updateRunnerState(request.body || {}));
    }

    if (method === 'PUT' && url.pathname === '/api/runner/config') {
      return json(200, await store.updateRunnerDesiredConfig(request.body || {}));
    }

    if (method === 'GET' && url.pathname === '/api/runner/commands') {
      return json(200, await store.listRunnerCommands());
    }

    if (method === 'POST' && url.pathname === '/api/runner/commands') {
      return json(202, await store.createRunnerCommand(request.body || {}));
    }

    if (method === 'POST' && url.pathname === '/api/runner/start') {
      return json(202, await proxyRunner(fetchImpl, '/start', { method: 'POST', body: request.body || {} }));
    }

    if (method === 'POST' && ['/api/runner/pause', '/api/runner/resume', '/api/runner/stop'].includes(url.pathname)) {
      const action = url.pathname.split('/').at(-1);
      return json(200, await proxyRunner(fetchImpl, `/${action}`, { method: 'POST', body: request.body || {} }));
    }

    if (method === 'GET' && url.pathname === '/api/runner/progress') {
      return json(200, await proxyRunner(fetchImpl, '/progress'));
    }

    if (method === 'POST' && url.pathname === '/api/runner/commands/claim') {
      return json(200, await store.claimRunnerCommand(request.body || {}));
    }

    if (method === 'PATCH' && segments[0] === 'api' && segments[1] === 'runner' && segments[2] === 'commands' && segments[3]) {
      return json(200, await store.updateRunnerCommand(segments[3], request.body || {}));
    }

    return json(404, { error: 'not_found' });
  } catch (error) {
    return json(500, { error: 'server_error', message: error.message });
  }
}

async function defaultReadCv() {
  return readFile(defaultCvPath, 'utf8');
}

async function defaultWriteCv(markdown) {
  const resolved = path.resolve(defaultCvPath);
  if (!resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error('Refusing to write CV outside the repository root.');
  }
  await writeFile(resolved, String(markdown || ''), 'utf8');
  return { markdown: String(markdown || '') };
}

export function createPostgresStore(pool) {
  return {
    async health() {
      if (typeof pool.health === 'function') return pool.health();
      const result = await pool.query('SELECT 1 AS ok');
      return { ok: true, dialect: pool.dialect || 'postgres', rows: result.rows };
    },

    async getProfile() {
      const result = await pool.query(`
        SELECT full_name AS "fullName", email, phone, location, linkedin, github, headline,
               target_roles AS "targetRoles", skills, application_defaults AS "applicationDefaults"
        FROM profile
        WHERE active = TRUE
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      return result.rows[0] || {};
    },

    async updateProfile(profile) {
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
      await appendEvent(pool, 'profile', null, 'profile_updated', 'Profile updated from dashboard', {});
      return profile;
    },

    async listPortals() {
      const result = await pool.query(`
        SELECT portal, profile_url AS "profileUrl", username_email AS "usernameEmail",
               field_hints AS "fieldHints", notes
        FROM portal_credentials
        ORDER BY portal
      `);
      return result.rows;
    },

    async upsertPortal(portal) {
      const result = await pool.query(`
        INSERT INTO portal_credentials (portal, profile_url, username_email, field_hints, notes, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, $5, now())
        ON CONFLICT (portal) DO UPDATE SET
          profile_url = EXCLUDED.profile_url,
          username_email = EXCLUDED.username_email,
          field_hints = EXCLUDED.field_hints,
          notes = EXCLUDED.notes,
          updated_at = now()
        RETURNING portal, profile_url AS "profileUrl", username_email AS "usernameEmail",
                  field_hints AS "fieldHints", notes
      `, [
        portal.portal,
        portal.profileUrl || portal.profile_url || '',
        portal.usernameEmail || portal.username_email || '',
        JSON.stringify(portal.fieldHints || portal.field_hints || {}),
        portal.notes || '',
      ]);
      await appendEvent(pool, 'portal', null, 'portal_updated', `Portal ${portal.portal} updated`, {});
      return result.rows[0];
    },

    async listJobs(filters = {}) {
      const { where, params } = buildJobsWhere(filters, pool.dialect);
      const limit = limitParam(filters.limit) || 200;
      const result = await pool.query(`
        SELECT id, url, company, title, portal, location, description, source, status,
               substr(description, 1, 300) AS "descriptionPreview",
               fit_score AS "fitScore", fit_category AS "fitCategory",
               matched_skills AS "matchedSkills", missing_skills AS "missingSkills",
               risk_flags AS "riskFlags", recommendation, fit_reasons AS "fitReasons",
               salary_min AS "salaryMin", salary_max AS "salaryMax",
               salary_currency AS "salaryCurrency", salary_period AS "salaryPeriod",
               work_model AS "workModel", employment_type AS "employmentType",
               posted_date AS "postedDate", requirements_text AS "requirementsText",
               responsibilities_text AS "responsibilitiesText",
               cv_match_score AS "cvMatchScore",
               cv_matched_skills AS "cvMatchedSkills",
               cv_matched_projects AS "cvMatchedProjects",
               cv_missing_skills AS "cvMissingSkills",
               cv_match_breakdown AS "cvMatchBreakdown",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM jobs
        ${where}
        ${pool.dialect === 'sqlite'
          ? 'ORDER BY COALESCE(cv_match_score, 0) DESC, COALESCE(fit_score, 0) DESC, updated_at DESC'
          : 'ORDER BY cv_match_score DESC NULLS LAST, fit_score DESC NULLS LAST, updated_at DESC'}
        LIMIT ${limit}
      `, params);
      return result.rows;
    },

    async getJob(id) {
      const result = await pool.query(`
        SELECT id, url, company, title, portal, location, description, source, status,
               fit_score AS "fitScore", fit_category AS "fitCategory",
               matched_skills AS "matchedSkills", missing_skills AS "missingSkills",
               risk_flags AS "riskFlags", recommendation, fit_reasons AS "fitReasons",
               salary_min AS "salaryMin", salary_max AS "salaryMax",
               salary_currency AS "salaryCurrency", salary_period AS "salaryPeriod",
               work_model AS "workModel", employment_type AS "employmentType",
               posted_date AS "postedDate", requirements_text AS "requirementsText",
               responsibilities_text AS "responsibilitiesText",
               cv_match_score AS "cvMatchScore",
               cv_matched_skills AS "cvMatchedSkills",
               cv_matched_projects AS "cvMatchedProjects",
               cv_missing_skills AS "cvMissingSkills",
               cv_match_breakdown AS "cvMatchBreakdown",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM jobs
        WHERE id = $1
        LIMIT 1
      `, [id]);
      return result.rows[0] || null;
    },

    async getJobDetail(id) {
      return this.getJob(id);
    },

    async listJobStats() {
      const incomplete = jobIncompleteSql();
      const [totalResult, portalResult] = await Promise.all([
        pool.query(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN ${incomplete} THEN 1 ELSE 0 END) AS incomplete
          FROM jobs
        `),
        pool.query(`
          SELECT COALESCE(NULLIF(portal, ''), 'unknown') AS portal,
                 COUNT(*) AS total,
                 SUM(CASE WHEN ${incomplete} THEN 1 ELSE 0 END) AS incomplete
          FROM jobs
          GROUP BY COALESCE(NULLIF(portal, ''), 'unknown')
          ORDER BY portal
        `),
      ]);
      const totalRow = totalResult.rows[0] || {};
      return {
        total: Number(totalRow.total || 0),
        incomplete: Number(totalRow.incomplete || 0),
        byPortal: portalResult.rows.map(row => ({
          portal: row.portal,
          total: Number(row.total || 0),
          incomplete: Number(row.incomplete || 0),
        })),
      };
    },

    async createJob(job) {
      const fit = job.fit || scoreJobFit(job);
      const cvMatch = normalizeCvMatchPayload(job.cvMatch || {});
      const derived = deriveJobFields(job);
      const result = await pool.query(`
        INSERT INTO jobs (
          url, company, title, portal, location, description, source, status,
          fit_score, fit_category, matched_skills, missing_skills, risk_flags,
          recommendation, fit_reasons,
          salary_min, salary_max, salary_currency, salary_period, work_model,
          employment_type, posted_date, requirements_text, responsibilities_text,
          cv_match_score, cv_matched_skills, cv_matched_projects, cv_missing_skills,
          cv_match_breakdown, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15::jsonb,
                $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb, $27::jsonb, $28::jsonb, $29::jsonb, now())
        ON CONFLICT (url) DO UPDATE SET
          company = EXCLUDED.company,
          title = EXCLUDED.title,
          portal = EXCLUDED.portal,
          location = EXCLUDED.location,
          description = EXCLUDED.description,
          source = EXCLUDED.source,
          status = EXCLUDED.status,
          fit_score = EXCLUDED.fit_score,
          fit_category = EXCLUDED.fit_category,
          matched_skills = EXCLUDED.matched_skills,
          missing_skills = EXCLUDED.missing_skills,
          risk_flags = EXCLUDED.risk_flags,
          recommendation = EXCLUDED.recommendation,
          fit_reasons = EXCLUDED.fit_reasons,
          salary_min = EXCLUDED.salary_min,
          salary_max = EXCLUDED.salary_max,
          salary_currency = EXCLUDED.salary_currency,
          salary_period = EXCLUDED.salary_period,
          work_model = EXCLUDED.work_model,
          employment_type = EXCLUDED.employment_type,
          posted_date = EXCLUDED.posted_date,
          requirements_text = EXCLUDED.requirements_text,
          responsibilities_text = EXCLUDED.responsibilities_text,
          cv_match_score = EXCLUDED.cv_match_score,
          cv_matched_skills = EXCLUDED.cv_matched_skills,
          cv_matched_projects = EXCLUDED.cv_matched_projects,
          cv_missing_skills = EXCLUDED.cv_missing_skills,
          cv_match_breakdown = EXCLUDED.cv_match_breakdown,
          updated_at = now()
        RETURNING id, url, company, title, portal, location, description, source, status,
                  fit_score AS "fitScore", fit_category AS "fitCategory",
                  matched_skills AS "matchedSkills", missing_skills AS "missingSkills",
                  risk_flags AS "riskFlags", recommendation, fit_reasons AS "fitReasons",
                  salary_min AS "salaryMin", salary_max AS "salaryMax",
                  salary_currency AS "salaryCurrency", salary_period AS "salaryPeriod",
                  work_model AS "workModel", employment_type AS "employmentType",
                  posted_date AS "postedDate", requirements_text AS "requirementsText",
                  responsibilities_text AS "responsibilitiesText",
                  cv_match_score AS "cvMatchScore",
                  cv_matched_skills AS "cvMatchedSkills",
                  cv_matched_projects AS "cvMatchedProjects",
                  cv_missing_skills AS "cvMissingSkills",
                  cv_match_breakdown AS "cvMatchBreakdown"
      `, [
        job.url || `manual:${Date.now()}`,
        job.company || '',
        job.title || '',
        job.portal || '',
        job.location || '',
        job.description || '',
        job.source || 'dashboard',
        job.status || 'discovered',
        fit.score,
        fit.category,
        JSON.stringify(fit.matchedSkills),
        JSON.stringify(fit.missingSkills),
        JSON.stringify(fit.riskFlags),
        fit.recommendation,
        JSON.stringify(fit.reasons),
        nullableNumber(job.salary_min ?? job.salaryMin),
        nullableNumber(job.salary_max ?? job.salaryMax),
        String(job.salary_currency ?? job.salaryCurrency ?? ''),
        String(job.salary_period ?? job.salaryPeriod ?? ''),
        derived.work_model,
        String(job.employment_type ?? job.employmentType ?? 'unknown'),
        derived.posted_date,
        String(job.requirements_text ?? job.requirementsText ?? ''),
        String(job.responsibilities_text ?? job.responsibilitiesText ?? ''),
        cvMatch.score,
        JSON.stringify(cvMatch.matchedSkills),
        JSON.stringify(cvMatch.matchedProjects),
        JSON.stringify(cvMatch.missingSkills),
        JSON.stringify(cvMatch.breakdown),
      ]);
      await appendEvent(pool, 'job', result.rows[0].id, 'job_created', `Job created: ${job.company || ''} ${job.title || ''}`.trim(), { fit, cvMatch });
      return { ...result.rows[0], fit, cvMatch };
    },

    async updateJobFit(id, fit) {
      const normalized = normalizeFitPayload(fit);
      const result = await pool.query(`
        UPDATE jobs
        SET fit_score = $2,
            fit_category = $3,
            matched_skills = $4::jsonb,
            missing_skills = $5::jsonb,
            risk_flags = $6::jsonb,
            recommendation = $7,
            fit_reasons = $8::jsonb,
            updated_at = now()
        WHERE id = $1
        RETURNING id, url, company, title, portal, location, description, source, status,
                  fit_score AS "fitScore", fit_category AS "fitCategory",
                  matched_skills AS "matchedSkills", missing_skills AS "missingSkills",
                  risk_flags AS "riskFlags", recommendation, fit_reasons AS "fitReasons"
      `, [
        id,
        normalized.score,
        normalized.category,
        JSON.stringify(normalized.matchedSkills),
        JSON.stringify(normalized.missingSkills),
        JSON.stringify(normalized.riskFlags),
        normalized.recommendation,
        JSON.stringify(normalized.reasons),
      ]);
      await appendEvent(pool, 'job', id, 'job_fit_updated', `AI fit updated: ${normalized.score}%`, normalized);
      return result.rows[0] || null;
    },

    async updateJobStatuses(ids, status) {
      const cleanIds = arrayOfStrings(ids);
      if (cleanIds.length === 0) return { updated: 0 };
      const params = [status, ...cleanIds];
      const placeholders = cleanIds.map((_, index) => `$${index + 2}`).join(', ');
      const result = await pool.query(`
        UPDATE jobs
        SET status = $1,
            updated_at = now()
        WHERE id IN (${placeholders})
      `, params);
      await appendEvent(pool, 'job', null, 'jobs_bulk_status_updated', `Updated ${result.rowCount || 0} job status(es) to ${status}`, { ids: cleanIds, status });
      return { updated: result.rowCount || 0 };
    },

    async deleteJobs(ids) {
      const cleanIds = arrayOfStrings(ids);
      if (cleanIds.length === 0) return { deleted: 0 };
      const placeholders = cleanIds.map((_, index) => `$${index + 1}`).join(', ');
      const result = await pool.query(`
        DELETE FROM jobs
        WHERE id IN (${placeholders})
      `, cleanIds);
      await appendEvent(pool, 'job', null, 'jobs_bulk_deleted', `Deleted ${result.rowCount || 0} job(s)`, { ids: cleanIds });
      return { deleted: result.rowCount || 0 };
    },

    async updateJobCvMatch(id, cvMatch) {
      const normalized = normalizeCvMatchPayload(cvMatch);
      const result = await pool.query(`
        UPDATE jobs
        SET cv_match_score = $2,
            cv_matched_skills = $3::jsonb,
            cv_matched_projects = $4::jsonb,
            cv_missing_skills = $5::jsonb,
            cv_match_breakdown = $6::jsonb,
            updated_at = now()
        WHERE id = $1
        RETURNING id, cv_match_score AS "cvMatchScore",
                  cv_matched_skills AS "cvMatchedSkills",
                  cv_matched_projects AS "cvMatchedProjects",
                  cv_missing_skills AS "cvMissingSkills",
                  cv_match_breakdown AS "cvMatchBreakdown"
      `, [
        id,
        normalized.score,
        JSON.stringify(normalized.matchedSkills),
        JSON.stringify(normalized.matchedProjects),
        JSON.stringify(normalized.missingSkills),
        JSON.stringify(normalized.breakdown),
      ]);
      return result.rows[0] || null;
    },

    async rescoreCvMatches() {
      const context = await getMatcherContext();
      const result = await pool.query(`
        SELECT id, title, description, requirements_text AS "requirementsText",
               responsibilities_text AS "responsibilitiesText"
        FROM jobs
      `);
      let updated = 0;
      for (const job of result.rows) {
        const cvMatch = scoreJob(job, context);
        await this.updateJobCvMatch(job.id, cvMatch);
        updated += 1;
      }
      await appendEvent(pool, 'job', null, 'cv_match_backfilled', `Re-scored ${updated} job(s) against cv.md`, {});
      return { updated };
    },

    async listPackages(filter = {}) {
      const params = [];
      let where = '';
      if (filter.approvalState) {
        params.push(filter.approvalState);
        where = 'WHERE p.approval_state = $1';
      }
      const result = await pool.query(`
        SELECT p.id, p.job_id AS "jobId", p.cover_letter AS "coverLetter",
               p.tailored_cv_md AS "tailoredCvMd", p.required_fields AS "requiredFields",
               p.missing_fields AS "missingFields", p.approval_state AS "approvalState",
               p.runner_status AS "runnerStatus", p.created_at AS "createdAt", p.updated_at AS "updatedAt",
               j.url AS "jobUrl", j.company, j.title, j.portal, j.location
        FROM application_packages p
        LEFT JOIN jobs j ON j.id = p.job_id
        ${where}
        ORDER BY p.updated_at DESC
        LIMIT 200
      `, params);
      return result.rows;
    },

    async createPackage(jobId, payload) {
      const existing = await pool.query('SELECT id FROM application_packages WHERE job_id = $1', [jobId]);
      const wasCreated = existing.rows.length === 0;
      const result = await pool.query(`
        INSERT INTO application_packages (
          job_id, cover_letter, tailored_cv_md, required_fields, missing_fields,
          approval_state, runner_status, updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'draft', 'not_started', now())
        ON CONFLICT (job_id) DO UPDATE SET
          cover_letter = EXCLUDED.cover_letter,
          tailored_cv_md = EXCLUDED.tailored_cv_md,
          required_fields = EXCLUDED.required_fields,
          missing_fields = EXCLUDED.missing_fields,
          approval_state = 'draft',
          runner_status = 'not_started',
          updated_at = now()
        RETURNING id, job_id AS "jobId", cover_letter AS "coverLetter",
                  tailored_cv_md AS "tailoredCvMd", required_fields AS "requiredFields",
                  missing_fields AS "missingFields", approval_state AS "approvalState",
                  runner_status AS "runnerStatus", updated_at AS "updatedAt"
      `, [
        jobId,
        payload.coverLetter || '',
        payload.tailoredCvMd || '',
        JSON.stringify(payload.requiredFields || {}),
        JSON.stringify(payload.missingFields || {}),
      ]);
      await appendEvent(
        pool,
        'package',
        result.rows[0].id,
        wasCreated ? 'package_created' : 'package_updated',
        wasCreated ? 'Application package created' : 'Application package updated',
        {},
      );
      return { ...result.rows[0], wasCreated };
    },

    async approvePackage(id) {
      const result = await pool.query(`
        UPDATE application_packages
        SET approval_state = 'approved', updated_at = now()
        WHERE id = $1
        RETURNING id, job_id AS "jobId", approval_state AS "approvalState", runner_status AS "runnerStatus"
      `, [id]);
      await appendEvent(pool, 'package', id, 'package_approved', 'Application package approved for local runner', {});
      return result.rows[0] || null;
    },

    async updateRunnerStatus(id, payload) {
      const result = await pool.query(`
        UPDATE application_packages
        SET runner_status = $2, missing_fields = $3::jsonb, updated_at = now()
        WHERE id = $1
        RETURNING id, job_id AS "jobId", missing_fields AS "missingFields",
                  approval_state AS "approvalState", runner_status AS "runnerStatus"
      `, [
        id,
        payload.runnerStatus || 'not_started',
        JSON.stringify(payload.missingFields || {}),
      ]);
      await appendEvent(pool, 'package', id, 'runner_status_updated', `Runner status: ${payload.runnerStatus || 'not_started'}`, payload);
      return result.rows[0] || null;
    },

    async listEvents() {
      const result = await pool.query(`
        SELECT id, entity_type AS "entityType", entity_id AS "entityId",
               event_type AS "eventType", message, payload, created_at AS "createdAt"
        FROM events
        ORDER BY created_at DESC
        LIMIT 200
      `);
      return result.rows;
    },

    async getRunnerState() {
      const result = await pool.query(`
        SELECT status, config, desired_config AS "desiredConfig",
               ai_models AS "aiModels", ai_gateway AS "aiGateway",
               updated_at AS "updatedAt"
        FROM runner_state
        WHERE id = 'local'
        LIMIT 1
      `);
      return result.rows[0] || {};
    },

    async updateRunnerState(payload) {
      const current = await this.getRunnerState();
      const result = await pool.query(`
        INSERT INTO runner_state (id, status, config, desired_config, ai_models, ai_gateway, updated_at)
        VALUES ('local', $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          config = EXCLUDED.config,
          desired_config = COALESCE(runner_state.desired_config, EXCLUDED.desired_config),
          ai_models = EXCLUDED.ai_models,
          ai_gateway = EXCLUDED.ai_gateway,
          updated_at = now()
        RETURNING status, config, desired_config AS "desiredConfig",
                  ai_models AS "aiModels", ai_gateway AS "aiGateway",
                  updated_at AS "updatedAt"
      `, [
        JSON.stringify(payload.status || {}),
        JSON.stringify(payload.config || {}),
        JSON.stringify(current.desiredConfig || payload.desiredConfig || {}),
        JSON.stringify(payload.aiModels || []),
        JSON.stringify(payload.aiGateway || {}),
      ]);
      return result.rows[0];
    },

    async updateRunnerDesiredConfig(payload) {
      const current = await this.getRunnerState();
      const desiredConfig = deepMerge({}, current.desiredConfig || {}, payload || {});
      desiredConfig.updatedAt = new Date().toISOString();
      const result = await pool.query(`
        INSERT INTO runner_state (id, status, config, desired_config, ai_models, ai_gateway, updated_at)
        VALUES ('local', $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET
          desired_config = EXCLUDED.desired_config,
          updated_at = now()
        RETURNING status, config, desired_config AS "desiredConfig",
                  ai_models AS "aiModels", ai_gateway AS "aiGateway",
                  updated_at AS "updatedAt"
      `, [
        JSON.stringify(current.status || {}),
        JSON.stringify(current.config || {}),
        JSON.stringify(desiredConfig),
        JSON.stringify(current.aiModels || []),
        JSON.stringify(current.aiGateway || {}),
      ]);
      await appendEvent(pool, 'runner', null, 'runner_config_requested', 'Local runner config update requested', {});
      return result.rows[0];
    },

    async listRunnerCommands() {
      const result = await pool.query(`
        SELECT id, runner, status, payload, logs, exit_code AS "exitCode",
               created_at AS "createdAt", claimed_at AS "claimedAt",
               finished_at AS "finishedAt", updated_at AS "updatedAt"
        FROM runner_commands
        ORDER BY created_at DESC
        LIMIT 50
      `);
      return result.rows;
    },

    async createRunnerCommand(payload) {
      const runner = normalizeRunnerName(payload.runner);
      const result = await pool.query(`
        INSERT INTO runner_commands (runner, status, payload, logs, updated_at)
        VALUES ($1, 'queued', $2::jsonb, '[]'::jsonb, now())
        RETURNING id, runner, status, payload, logs, exit_code AS "exitCode",
                  created_at AS "createdAt", claimed_at AS "claimedAt",
                  finished_at AS "finishedAt", updated_at AS "updatedAt"
      `, [runner, JSON.stringify(payload.payload || {})]);
      await appendEvent(pool, 'runner', result.rows[0].id, 'runner_command_queued', `Runner command queued: ${runner}`, {});
      return result.rows[0];
    },

    async claimRunnerCommand() {
      // Portable across Postgres and SQLite. This dashboard is single-user, so
      // claiming the oldest queued command without row locking is sufficient.
      const result = await pool.query(`
        UPDATE runner_commands
        SET status = 'running', claimed_at = now(), updated_at = now()
        WHERE id = (
          SELECT id
          FROM runner_commands
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
        )
        RETURNING id, runner, status, payload, logs, exit_code AS "exitCode",
                  created_at AS "createdAt", claimed_at AS "claimedAt",
                  finished_at AS "finishedAt", updated_at AS "updatedAt"
      `);
      return result.rows[0] || null;
    },

    async updateRunnerCommand(id, payload) {
      const status = String(payload.status || 'running');
      const result = await pool.query(`
        UPDATE runner_commands
        SET status = $2,
            logs = $3::jsonb,
            exit_code = $4,
            finished_at = CASE WHEN $2 IN ('exited', 'error') THEN now() ELSE finished_at END,
            updated_at = now()
        WHERE id = $1
        RETURNING id, runner, status, payload, logs, exit_code AS "exitCode",
                  created_at AS "createdAt", claimed_at AS "claimedAt",
                  finished_at AS "finishedAt", updated_at AS "updatedAt"
      `, [
        id,
        status,
        JSON.stringify(payload.logs || []),
        Number.isFinite(Number(payload.exitCode)) ? Number(payload.exitCode) : null,
      ]);
      return result.rows[0] || null;
    },
  };
}

export function json(status, body) {
  return { status, body };
}

async function healthResponse(store) {
  try {
    const database = typeof store.health === 'function'
      ? await store.health()
      : { ok: true, dialect: 'unknown' };
    return json(200, {
      ok: true,
      service: 'career-ops-job-dashboard',
      database: { ...database, ok: database?.ok !== false },
    });
  } catch (error) {
    return json(503, {
      ok: false,
      service: 'career-ops-job-dashboard',
      database: {
        ok: false,
        message: error.message,
      },
    });
  }
}

async function appendEvent(pool, entityType, entityId, eventType, message, payload) {
  await pool.query(`
    INSERT INTO events (entity_type, entity_id, event_type, message, payload)
    VALUES ($1, $2, $3, $4, $5::jsonb)
  `, [entityType, entityId, eventType, message, JSON.stringify(payload || {})]);
}

function jobToFit(job = {}) {
  return {
    score: job.fitScore ?? job.fit?.score ?? 0,
    category: job.fitCategory ?? job.fit?.category ?? '',
    matchedSkills: job.matchedSkills ?? job.fit?.matchedSkills ?? [],
    missingSkills: job.missingSkills ?? job.fit?.missingSkills ?? [],
    riskFlags: job.riskFlags ?? job.fit?.riskFlags ?? [],
    recommendation: job.recommendation ?? job.fit?.recommendation ?? 'review',
    reasons: job.fitReasons ?? job.fit?.reasons ?? [],
  };
}

function normalizeFitPayload(fit = {}) {
  const score = Number(fit.score ?? fit.fitScore ?? 0);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    category: String(fit.category ?? fit.fitCategory ?? '').trim(),
    matchedSkills: arrayOfStrings(fit.matchedSkills),
    missingSkills: arrayOfStrings(fit.missingSkills),
    riskFlags: arrayOfStrings(fit.riskFlags),
    recommendation: String(fit.recommendation || 'review').trim(),
    reasons: arrayOfStrings(fit.reasons || fit.fitReasons),
  };
}

function hasFitScorePayload(fit = {}) {
  const score = fit.score ?? fit.fitScore;
  if (score === undefined || score === null) return false;
  if (typeof score === 'string' && !score.trim()) return false;
  return Number.isFinite(Number(score));
}

function normalizeCvMatchPayload(cvMatch = {}) {
  const score = Number(cvMatch.score ?? cvMatch.cvMatchScore ?? 0);
  const breakdown = cvMatch.breakdown || cvMatch.cvMatchBreakdown || {};
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    matchedSkills: arrayOfStrings(cvMatch.matchedSkills || cvMatch.cvMatchedSkills),
    missingSkills: arrayOfStrings(cvMatch.missingSkills || cvMatch.cvMissingSkills),
    matchedProjects: arrayOfStrings(cvMatch.matchedProjects || cvMatch.cvMatchedProjects),
    breakdown: {
      skills: clampPercent(breakdown.skills),
      projects: clampPercent(breakdown.projects),
      role: clampPercent(breakdown.role),
      dataQuality: clampPercent(breakdown.dataQuality),
      confidence: String(breakdown.confidence || '').trim(),
      rescanRecommended: Boolean(breakdown.rescanRecommended),
      requiredSkills: arrayOfStrings(breakdown.requiredSkills),
      matchedRequiredSkills: arrayOfStrings(breakdown.matchedRequiredSkills),
      matchedCvSkills: arrayOfStrings(breakdown.matchedCvSkills),
      projectSupportedSkills: arrayOfStrings(breakdown.projectSupportedSkills),
      matchedSkillDetails: arrayOfStrings(breakdown.matchedSkillDetails),
      missingSkillDetails: arrayOfStrings(breakdown.missingSkillDetails),
      matchedProjectDetails: arrayOfStrings(breakdown.matchedProjectDetails),
      exceedingSkills: arrayOfStrings(breakdown.exceedingSkills),
      exceedingSignals: arrayOfStrings(breakdown.exceedingSignals),
      penalties: arrayOfStrings(breakdown.penalties),
      scoreFormula: String(breakdown.scoreFormula || '').trim(),
    },
  };
}

function clampPercent(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}

function nullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function filtersFromSearch(searchParams) {
  return {
    workModel: csvParam(searchParams.get('workModel')),
    portal: csvParam(searchParams.get('portal')),
    minSalary: numericParam(searchParams.get('minSalary')),
    maxSalary: numericParam(searchParams.get('maxSalary')),
    currency: searchParams.get('currency') || '',
    postedWithinDays: numericParam(searchParams.get('postedWithinDays')),
    minMatch: numericParam(searchParams.get('minMatch')),
    maxMatch: numericParam(searchParams.get('maxMatch')),
    incomplete: boolParam(searchParams.get('incomplete')),
    limit: limitParam(searchParams.get('limit')),
    q: searchParams.get('q') || '',
  };
}

function buildJobsWhere(filters = {}, dialect = 'postgres') {
  const clauses = [];
  const params = [];
  const add = value => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.workModel?.length) {
    clauses.push(`work_model IN (${filters.workModel.map(add).join(', ')})`);
  }
  if (filters.portal?.length) {
    clauses.push(`portal IN (${filters.portal.map(add).join(', ')})`);
  }
  if (filters.minSalary != null) clauses.push(`salary_min >= ${add(filters.minSalary)}`);
  if (filters.maxSalary != null) clauses.push(`salary_max <= ${add(filters.maxSalary)}`);
  if (filters.currency) clauses.push(`salary_currency = ${add(filters.currency)}`);
  if (filters.minMatch != null) clauses.push(`cv_match_score >= ${add(filters.minMatch)}`);
  if (filters.maxMatch != null) clauses.push(`cv_match_score <= ${add(filters.maxMatch)}`);
  if (filters.incomplete) clauses.push(`(${jobIncompleteSql()})`);
  if (filters.q) {
    const placeholder = add(`%${String(filters.q).toLowerCase()}%`);
    clauses.push(`(LOWER(title) LIKE ${placeholder} OR LOWER(description) LIKE ${placeholder})`);
  }
  if (filters.postedWithinDays != null) {
    const placeholder = add(filters.postedWithinDays);
    clauses.push(dialect === 'sqlite'
      ? `posted_date IS NOT NULL AND datetime(posted_date) >= datetime('now', '-' || ${placeholder} || ' days')`
      : `posted_date IS NOT NULL AND posted_date >= now() - (${placeholder}::text || ' days')::interval`);
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

function jobIncompleteSql() {
  return [
    "COALESCE(url, '') = ''",
    "COALESCE(title, '') = ''",
    "COALESCE(company, '') = ''",
    "COALESCE(description, '') = ''",
    'LENGTH(COALESCE(description, \'\')) < 240',
    "COALESCE(source, '') LIKE '%:partial-detail%'",
    "COALESCE(source, '') NOT LIKE '%:detail%'",
  ].join(' OR ');
}

async function proxyRunner(fetchImpl, pathName, { method = 'GET', body } = {}) {
  const response = await fetchImpl(`http://127.0.0.1:48731${pathName}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    return { error: 'runner_unreachable', status: response.status };
  }
  return response.json();
}

function csvParam(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function numericParam(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolParam(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function deepMerge(target = {}, ...sources) {
  const output = isPlainObject(target) ? { ...target } : {};
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      output[key] = isPlainObject(value) && isPlainObject(output[key])
        ? deepMerge(output[key], value)
        : value;
    }
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function limitParam(value) {
  if (value == null || value === '') return null;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 5000);
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean)
    : [];
}

function normalizeRunnerName(value) {
  const runner = String(value || '').trim();
  if (!['discover', 'score-ai', 'draft-ai', 'applications', 'test-ai', 'test-cheap-ai'].includes(runner)) {
    throw new Error(`Unsupported runner command: ${runner}`);
  }
  return runner;
}
