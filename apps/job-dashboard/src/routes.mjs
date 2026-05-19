import { scoreJobFit } from './fit-score.mjs';
import { generateApplicationPackage as defaultGenerateApplicationPackage } from './ai-generator.mjs';

export async function dispatchApi(request, store, services = {}) {
  const url = new URL(request.url, 'http://dashboard.local');
  const method = request.method.toUpperCase();
  const segments = url.pathname.split('/').filter(Boolean);
  const generateApplicationPackage = services.generateApplicationPackage || defaultGenerateApplicationPackage;

  try {
    if (method === 'GET' && url.pathname === '/api/health') {
      return json(200, { ok: true, service: 'career-ops-job-dashboard' });
    }

    if (method === 'GET' && url.pathname === '/api/profile') {
      return json(200, await store.getProfile());
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

    if (method === 'GET' && url.pathname === '/api/jobs') {
      return json(200, await store.listJobs());
    }

    if (method === 'POST' && url.pathname === '/api/jobs') {
      const profile = await store.getProfile();
      const fit = scoreJobFit(request.body || {}, {
        targetRoles: profile?.targetRoles || profile?.target_roles || [],
        skills: profile?.skills || [],
        location: profile?.location || '',
      });
      return json(201, await store.createJob({ ...(request.body || {}), fit }));
    }

    if (method === 'POST' && segments[0] === 'api' && segments[1] === 'jobs' && segments[3] === 'package' && segments[4] === 'generate') {
      const job = await store.getJob(segments[2]);
      if (!job) return json(404, { error: 'job_not_found' });
      const profile = await store.getProfile();
      try {
        const generated = await generateApplicationPackage({
          profile,
          job,
          provider: services.aiProvider,
          apiKey: services.aiApiKey ?? services.openaiApiKey,
          model: services.aiModel ?? services.openaiModel,
          baseUrl: services.aiBaseUrl,
          fetchImpl: services.fetchImpl,
        });
        return json(201, await store.createPackage(segments[2], generated));
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
      return json(201, await store.createPackage(segments[2], request.body || {}));
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

    return json(404, { error: 'not_found' });
  } catch (error) {
    return json(500, { error: 'server_error', message: error.message });
  }
}

export function createPostgresStore(pool) {
  return {
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

    async listJobs() {
      const result = await pool.query(`
        SELECT id, url, company, title, portal, location, description, source, status,
               fit_score AS "fitScore", fit_category AS "fitCategory",
               matched_skills AS "matchedSkills", missing_skills AS "missingSkills",
               risk_flags AS "riskFlags", recommendation, fit_reasons AS "fitReasons",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM jobs
        ORDER BY updated_at DESC
        LIMIT 200
      `);
      return result.rows;
    },

    async getJob(id) {
      const result = await pool.query(`
        SELECT id, url, company, title, portal, location, description, source, status,
               fit_score AS "fitScore", fit_category AS "fitCategory",
               matched_skills AS "matchedSkills", missing_skills AS "missingSkills",
               risk_flags AS "riskFlags", recommendation, fit_reasons AS "fitReasons",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM jobs
        WHERE id = $1
        LIMIT 1
      `, [id]);
      return result.rows[0] || null;
    },

    async createJob(job) {
      const fit = job.fit || scoreJobFit(job);
      const result = await pool.query(`
        INSERT INTO jobs (
          url, company, title, portal, location, description, source, status,
          fit_score, fit_category, matched_skills, missing_skills, risk_flags,
          recommendation, fit_reasons, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15::jsonb, now())
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
          updated_at = now()
        RETURNING id, url, company, title, portal, location, description, source, status,
                  fit_score AS "fitScore", fit_category AS "fitCategory",
                  matched_skills AS "matchedSkills", missing_skills AS "missingSkills",
                  risk_flags AS "riskFlags", recommendation, fit_reasons AS "fitReasons"
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
      ]);
      await appendEvent(pool, 'job', result.rows[0].id, 'job_created', `Job created: ${job.company || ''} ${job.title || ''}`.trim(), { fit });
      return { ...result.rows[0], fit };
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
      const result = await pool.query(`
        INSERT INTO application_packages (
          job_id, cover_letter, tailored_cv_md, required_fields, missing_fields,
          approval_state, runner_status, updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'draft', 'not_started', now())
        RETURNING id, job_id AS "jobId", cover_letter AS "coverLetter",
                  tailored_cv_md AS "tailoredCvMd", required_fields AS "requiredFields",
                  missing_fields AS "missingFields", approval_state AS "approvalState",
                  runner_status AS "runnerStatus"
      `, [
        jobId,
        payload.coverLetter || '',
        payload.tailoredCvMd || '',
        JSON.stringify(payload.requiredFields || {}),
        JSON.stringify(payload.missingFields || {}),
      ]);
      await appendEvent(pool, 'package', result.rows[0].id, 'package_created', 'Application package created', {});
      return result.rows[0];
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
  };
}

export function json(status, body) {
  return { status, body };
}

async function appendEvent(pool, entityType, entityId, eventType, message, payload) {
  await pool.query(`
    INSERT INTO events (entity_type, entity_id, event_type, message, payload)
    VALUES ($1, $2, $3, $4, $5::jsonb)
  `, [entityType, entityId, eventType, message, JSON.stringify(payload || {})]);
}
