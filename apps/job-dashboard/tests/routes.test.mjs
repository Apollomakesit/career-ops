import test from 'node:test';
import assert from 'node:assert/strict';

import { createPostgresStore, dispatchApi } from '../src/routes.mjs';

function createStore() {
  const state = {
    profile: {
      fullName: 'Ioan Stefan Vlaicu',
      email: 'ionut@example.com',
      targetRoles: ['Application Support Engineer'],
      skills: ['ServiceNow', 'MDM', 'Python'],
    },
    portals: [{ portal: 'ejobs', usernameEmail: 'ionut@example.com' }],
    jobs: [],
    packages: [],
    events: [],
    runnerState: {},
    runnerCommands: [],
    healthCalls: 0,
  };

  return {
    state,
    async health() {
      state.healthCalls += 1;
      return { ok: true, dialect: 'memory' };
    },
    async getProfile() { return state.profile; },
    async updateProfile(profile) { state.profile = profile; return profile; },
    async listPortals() { return state.portals; },
    async upsertPortal(portal) {
      state.portals = state.portals.filter(item => item.portal !== portal.portal).concat(portal);
      return portal;
    },
    async listJobs(filters = {}) {
      const offset = Number(filters.offset || 0);
      const limit = Number(filters.limit || state.jobs.length || 50);
      return state.jobs.slice(offset, offset + limit);
    },
    async countJobs() { return state.jobs.length; },
    async listJobStats() {
      const byPortal = {};
      let incomplete = 0;
      for (const job of state.jobs) {
        const portal = job.portal || 'unknown';
        byPortal[portal] ||= { portal, total: 0, incomplete: 0 };
        byPortal[portal].total += 1;
        const isIncomplete = !job.description || job.description.length < 240 || String(job.source || '').includes(':partial-detail');
        if (isIncomplete) {
          incomplete += 1;
          byPortal[portal].incomplete += 1;
        }
      }
      return { total: state.jobs.length, incomplete, byPortal: Object.values(byPortal) };
    },
    async listJobDetails(id) { return state.jobs.find(job => job.id === id) || null; },
    async getJob(id) { return state.jobs.find(job => job.id === id) || null; },
    async createJob(job) {
      const created = { id: 'job-1', ...job };
      state.jobs.push(created);
      return created;
    },
    async updateJob(id, updates) {
      const job = state.jobs.find(item => item.id === id);
      if (!job) return null;
      Object.assign(job, updates);
      return job;
    },
    async updateJobFit(id, fit) {
      const job = state.jobs.find(item => item.id === id);
      Object.assign(job, {
        fitScore: fit.score,
        fitCategory: fit.category,
        matchedSkills: fit.matchedSkills || [],
        missingSkills: fit.missingSkills || [],
        riskFlags: fit.riskFlags || [],
        recommendation: fit.recommendation || 'review',
        fitReasons: fit.reasons || fit.fitReasons || [],
      });
      return job;
    },
    async updateJobStatuses(ids, status) {
      let updated = 0;
      for (const job of state.jobs) {
        if (ids.includes(job.id)) {
          job.status = status;
          updated += 1;
        }
      }
      return { updated };
    },
    async deleteJobs(ids) {
      const before = state.jobs.length;
      state.jobs = state.jobs.filter(job => !ids.includes(job.id));
      return { deleted: before - state.jobs.length };
    },
    async listPackages(filter) {
      return filter?.approvalState
        ? state.packages.filter(pkg => pkg.approvalState === filter.approvalState)
        : state.packages;
    },
    async createPackage(jobId, payload) {
      const existing = state.packages.find(item => item.jobId === jobId);
      if (existing) {
        Object.assign(existing, { approvalState: 'draft', runnerStatus: 'not_started', ...payload, wasCreated: false });
        return existing;
      }
      const created = { id: `pkg-${state.packages.length + 1}`, jobId, approvalState: 'draft', runnerStatus: 'not_started', ...payload, wasCreated: true };
      state.packages.push(created);
      return created;
    },
    async approvePackage(id) {
      const pkg = state.packages.find(item => item.id === id);
      pkg.approvalState = 'approved';
      return pkg;
    },
    async updateRunnerStatus(id, payload) {
      const pkg = state.packages.find(item => item.id === id);
      pkg.runnerStatus = payload.runnerStatus;
      pkg.missingFields = payload.missingFields || {};
      return pkg;
    },
    async getRunnerState() { return state.runnerState; },
    async updateRunnerState(payload) {
      state.runnerState = { ...state.runnerState, ...payload };
      return state.runnerState;
    },
    async updateRunnerDesiredConfig(payload) {
      state.runnerState.desiredConfig = payload;
      return state.runnerState;
    },
    async listRunnerCommands() { return state.runnerCommands; },
    async createRunnerCommand(payload) {
      const command = { id: `cmd-${state.runnerCommands.length + 1}`, runner: payload.runner, status: 'queued', logs: [] };
      state.runnerCommands.push(command);
      return command;
    },
    async claimRunnerCommand() {
      const command = state.runnerCommands.find(item => item.status === 'queued');
      if (!command) return null;
      command.status = 'running';
      return command;
    },
    async updateRunnerCommand(id, payload) {
      const command = state.runnerCommands.find(item => item.id === id);
      Object.assign(command, payload);
      return command;
    },
    async listEvents() { return state.events; },
    async rescoreCvMatches() { return { updated: state.jobs.length }; },
  };
}

test('dispatches health with database connectivity details', async () => {
  const store = createStore();
  const response = await dispatchApi({ method: 'GET', url: '/api/health' }, store);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.database.ok, true);
  assert.equal(response.body.database.dialect, 'memory');
  assert.equal(store.state.healthCalls, 1);
});

test('reports unhealthy database state from health endpoint', async () => {
  const store = createStore();
  store.health = async () => {
    throw new Error('database unavailable');
  };

  const response = await dispatchApi({ method: 'GET', url: '/api/health' }, store);

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.database.ok, false);
  assert.match(response.body.database.message, /database unavailable/);
});

test('updates profile', async () => {
  const store = createStore();
  const response = await dispatchApi({
    method: 'PUT',
    url: '/api/profile',
    body: { fullName: 'Updated Name' },
  }, store);

  assert.equal(response.status, 200);
  assert.equal(response.body.fullName, 'Updated Name');
  assert.equal(store.state.profile.fullName, 'Updated Name');
});

test('serves canonical CV markdown for dashboard viewing', async () => {
  const response = await dispatchApi({
    method: 'GET',
    url: '/api/cv',
  }, createStore(), {
    readCv: async () => '# Ioan Stefan Vlaicu\n\n## Experience',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.markdown, '# Ioan Stefan Vlaicu\n\n## Experience');
});

test('updates canonical CV markdown and can request a deterministic re-score', async () => {
  const writes = [];
  const put = await dispatchApi({
    method: 'PUT',
    url: '/api/cv',
    body: { markdown: '# Updated CV' },
  }, createStore(), {
    writeCv: async markdown => {
      writes.push(markdown);
      return { markdown };
    },
  });
  const rescore = await dispatchApi({
    method: 'POST',
    url: '/api/cv/rescore-all',
    body: {},
  }, createStore());

  assert.equal(put.status, 200);
  assert.deepEqual(writes, ['# Updated CV']);
  assert.equal(rescore.body.updated, 0);
});

test('rejects empty canonical CV markdown updates', async () => {
  const writes = [];
  const response = await dispatchApi({
    method: 'PUT',
    url: '/api/cv',
    body: { markdown: '   ' },
  }, createStore(), {
    writeCv: async markdown => {
      writes.push(markdown);
      return { markdown };
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'cv_markdown_required');
  assert.deepEqual(writes, []);
});

test('rejects non-string canonical CV markdown updates', async () => {
  const writes = [];
  const response = await dispatchApi({
    method: 'PUT',
    url: '/api/cv',
    body: { markdown: 123 },
  }, createStore(), {
    writeCv: async markdown => {
      writes.push(markdown);
      return { markdown };
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'cv_markdown_required');
  assert.deepEqual(writes, []);
});

test('creates a job with fit scoring', async () => {
  const store = createStore();
  const response = await dispatchApi({
    method: 'POST',
    url: '/api/jobs',
    body: {
      title: 'Application Support Engineer MDM',
      company: 'Example',
      location: 'Bucharest',
      description: 'ServiceNow Workspace ONE Ivanti Android iOS',
    },
  }, store);

  assert.equal(response.status, 201);
  assert.ok(response.body.fit.score >= 80);
  assert.ok(response.body.cvMatch);
  assert.equal(typeof response.body.cvMatch.score, 'number');
});

test('returns expanded job detail fields', async () => {
  const store = createStore();
  store.state.jobs.push({
    id: 'job-1',
    title: 'Backend Engineer',
    company: 'Example',
    description: 'Full description',
    requirementsText: 'Python',
    responsibilitiesText: 'Build APIs',
    cvMatchedSkills: ['python'],
    cvMissingSkills: ['kubernetes'],
    cvMatchedProjects: ['Project Helios'],
    cvMatchBreakdown: { skills: 80, projects: 60, role: 70 },
  });

  const response = await dispatchApi({
    method: 'GET',
    url: '/api/jobs/job-1/detail',
  }, store);

  assert.equal(response.status, 200);
  assert.equal(response.body.requirementsText, 'Python');
  assert.deepEqual(response.body.cvMatchedProjects, ['Project Helios']);
});

test('updates editable job fields without accepting unrelated keys', async () => {
  const store = createStore();
  store.state.jobs.push({
    id: 'job-1',
    title: 'Old title',
    company: 'OldCo',
    location: 'Remote',
    status: 'discovered',
    notes: '',
  });

  const response = await dispatchApi({
    method: 'PATCH',
    url: '/api/jobs/job-1',
    body: {
      title: 'Senior Support Engineer',
      company: 'NewCo',
      location: 'Bucharest',
      status: 'reviewed',
      notes: 'Promising role.',
      fitScore: 1,
    },
  }, store);

  assert.equal(response.status, 200);
  assert.equal(response.body.title, 'Senior Support Engineer');
  assert.equal(response.body.company, 'NewCo');
  assert.equal(response.body.notes, 'Promising role.');
  assert.equal(response.body.fitScore, undefined);
});

test('returns 404 when editing a missing job', async () => {
  const response = await dispatchApi({
    method: 'PATCH',
    url: '/api/jobs/missing-job',
    body: { title: 'Nope' },
  }, createStore());

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'job_not_found');
});

test('updates and deletes jobs in bulk', async () => {
  const store = createStore();
  store.state.jobs = [
    { id: 'job-1', title: 'One', status: 'discovered' },
    { id: 'job-2', title: 'Two', status: 'discovered' },
  ];

  const updated = await dispatchApi({
    method: 'PATCH',
    url: '/api/jobs/bulk',
    body: { ids: ['job-1', 'job-2'], status: 'rejected' },
  }, store);

  assert.equal(updated.status, 200);
  assert.equal(updated.body.updated, 2);
  assert.deepEqual(store.state.jobs.map(job => job.status), ['rejected', 'rejected']);

  const deleted = await dispatchApi({
    method: 'DELETE',
    url: '/api/jobs/bulk',
    body: { ids: ['job-1'] },
  }, store);

  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, 1);
  assert.deepEqual(store.state.jobs.map(job => job.id), ['job-2']);
});

test('returns job totals by portal and incomplete data counts', async () => {
  const store = createStore();
  store.state.jobs.push(
    { id: 'job-1', portal: 'ejobs', description: 'Detailed posting '.repeat(40), source: 'portal-discovery:ejobs:detail' },
    { id: 'job-2', portal: 'ejobs', description: 'Short listing', source: 'portal-discovery:ejobs:partial-detail' },
    { id: 'job-3', portal: 'linkedin', description: '', source: 'portal-discovery:linkedin' },
  );

  const response = await dispatchApi({ method: 'GET', url: '/api/jobs/stats' }, store);

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 3);
  assert.equal(response.body.incomplete, 2);
  assert.deepEqual(response.body.byPortal.find(item => item.portal === 'ejobs'), {
    portal: 'ejobs',
    total: 2,
    incomplete: 1,
  });
});

test('passes incomplete job paging filters to the store', async () => {
  const store = createStore();
  let seenFilters = null;
  store.listJobs = async filters => {
    seenFilters = filters;
    return [];
  };

  const response = await dispatchApi({
    method: 'GET',
    url: '/api/jobs?incomplete=1&limit=5000&portal=linkedin,ejobs',
  }, store);

  assert.equal(response.status, 200);
  assert.equal(seenFilters.incomplete, true);
  assert.equal(seenFilters.limit, 200);
  assert.deepEqual(seenFilters.portal, ['linkedin', 'ejobs']);
});

test('paginates job listings with total metadata', async () => {
  const store = createStore();
  store.state.jobs = [
    { id: 'job-1', title: 'One' },
    { id: 'job-2', title: 'Two' },
    { id: 'job-3', title: 'Three' },
  ];

  const response = await dispatchApi({
    method: 'GET',
    url: '/api/jobs?limit=2&offset=1',
  }, store);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.jobs.map(job => job.id), ['job-2', 'job-3']);
  assert.equal(response.body.limit, 2);
  assert.equal(response.body.offset, 1);
  assert.equal(response.body.total, 3);
});

test('proxies runner start with portal and rescan mode', async () => {
  const calls = [];
  const store = createStore();
  const response = await dispatchApi({
    method: 'POST',
    url: '/api/runner/start',
    body: { runner: 'discover', portal: 'linkedin', mode: 'missing' },
  }, store, {
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 202,
        async json() { return { status: 'running' }; },
      };
    },
  });

  assert.equal(response.status, 202);
  assert.equal(calls[0].url, 'http://127.0.0.1:48731/start');
  assert.deepEqual(calls[0].body, { runner: 'discover', portal: 'linkedin', mode: 'missing' });
});

test('approves package and exposes approved queue', async () => {
  const store = createStore();
  await dispatchApi({
    method: 'POST',
    url: '/api/jobs',
    body: { title: 'Application Support Engineer', company: 'ExampleSoft' },
  }, store);
  await dispatchApi({
    method: 'POST',
    url: '/api/jobs/job-1/package',
    body: { coverLetter: 'Hello', tailoredCvMd: '# CV' },
  }, store);
  await dispatchApi({ method: 'POST', url: '/api/packages/pkg-1/approve' }, store);

  const approved = await dispatchApi({ method: 'GET', url: '/api/packages?approvalState=approved' }, store);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.length, 1);
  assert.equal(approved.body[0].approvalState, 'approved');
});

test('runner can update package status without final submission', async () => {
  const store = createStore();
  await dispatchApi({
    method: 'POST',
    url: '/api/jobs',
    body: { title: 'Application Support Engineer', company: 'ExampleSoft' },
  }, store);
  await dispatchApi({
    method: 'POST',
    url: '/api/jobs/job-1/package',
    body: { coverLetter: 'Hello', tailoredCvMd: '# CV' },
  }, store);

  const response = await dispatchApi({
    method: 'PATCH',
    url: '/api/packages/pkg-1/runner',
    body: { runnerStatus: 'ready_for_user_submit', missingFields: { salary: 'required' } },
  }, store);

  assert.equal(response.status, 200);
  assert.equal(response.body.runnerStatus, 'ready_for_user_submit');
  assert.deepEqual(response.body.missingFields, { salary: 'required' });
});

test('manual package creation returns 404 for a missing job', async () => {
  const response = await dispatchApi({
    method: 'POST',
    url: '/api/jobs/missing-job/package',
    body: { coverLetter: 'Hello', tailoredCvMd: '# CV' },
  }, createStore());

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'job_not_found');
});

test('updates a job fit score from the local AI scorer', async () => {
  const store = createStore();
  await dispatchApi({
    method: 'POST',
    url: '/api/jobs',
    body: {
      title: 'Application Support Engineer',
      company: 'ExampleSoft',
      description: 'ServiceNow MDM Python automation',
    },
  }, store);
  store.state.jobs[0].fitScore = 88;

  const response = await dispatchApi({
    method: 'PATCH',
    url: '/api/jobs/job-1/fit',
    body: {
      score: 89,
      category: 'strong',
      matchedSkills: ['ServiceNow', 'MDM', 'Python'],
      missingSkills: ['Azure'],
      riskFlags: [],
      recommendation: 'apply',
      reasons: ['Strong overlap with support automation work.'],
    },
  }, store);

  assert.equal(response.status, 200);
  assert.equal(response.body.fitScore, 89);
  assert.equal(response.body.recommendation, 'apply');
});

test('manual fit updates require a score to avoid accidental zeroing', async () => {
  const store = createStore();
  await dispatchApi({
    method: 'POST',
    url: '/api/jobs',
    body: {
      title: 'Application Support Engineer',
      company: 'ExampleSoft',
      description: 'ServiceNow MDM Python automation',
    },
  }, store);
  store.state.jobs[0].fitScore = 88;

  const response = await dispatchApi({
    method: 'PATCH',
    url: '/api/jobs/job-1/fit',
    body: { category: '' },
  }, store);

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'fit_score_required');
  assert.equal(store.state.jobs[0].fitScore, 88);
});

test('returns 404 when updating fit for a missing job', async () => {
  const response = await dispatchApi({
    method: 'PATCH',
    url: '/api/jobs/missing-job/fit',
    body: { score: 80, category: 'strong' },
  }, createStore());

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'job_not_found');
});

test('generates an AI application package for a stored job', async () => {
  const store = createStore();
  await dispatchApi({
    method: 'POST',
    url: '/api/jobs',
    body: {
      title: 'Application Support Engineer',
      company: 'ExampleSoft',
      location: 'Bucharest',
      description: 'ServiceNow MDM Python automation',
    },
  }, store);

  const response = await dispatchApi({
    method: 'POST',
    url: '/api/jobs/job-1/package/generate',
    body: {},
  }, store, {
    generateApplicationPackage: async ({ profile, job }) => ({
      coverLetter: `Dear ${job.company}, ${profile.fullName} is a strong fit.`,
      tailoredCvMd: '# Tailored CV',
      requiredFields: { full_name: profile.fullName, email: profile.email },
      missingFields: { salary_expectation: 'Confirm before submitting.' },
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.coverLetter, 'Dear ExampleSoft, Ioan Stefan Vlaicu is a strong fit.');
  assert.equal(response.body.approvalState, 'draft');
  assert.deepEqual(response.body.missingFields, { salary_expectation: 'Confirm before submitting.' });
});

test('regenerating an AI application package updates the existing package', async () => {
  const store = createStore();
  await dispatchApi({
    method: 'POST',
    url: '/api/jobs',
    body: {
      title: 'Application Support Engineer',
      company: 'ExampleSoft',
      location: 'Bucharest',
      description: 'ServiceNow MDM Python automation',
    },
  }, store);

  const first = await dispatchApi({
    method: 'POST',
    url: '/api/jobs/job-1/package/generate',
    body: {},
  }, store, {
    generateApplicationPackage: async () => ({
      coverLetter: 'First draft',
      tailoredCvMd: '# First CV',
    }),
  });
  const second = await dispatchApi({
    method: 'POST',
    url: '/api/jobs/job-1/package/generate',
    body: {},
  }, store, {
    generateApplicationPackage: async () => ({
      coverLetter: 'Second draft',
      tailoredCvMd: '# Second CV',
    }),
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.id, first.body.id);
  assert.equal(second.body.coverLetter, 'Second draft');
  assert.equal(store.state.packages.length, 1);
});

test('returns a setup error when AI generation is not configured', async () => {
  const store = createStore();
  await dispatchApi({
    method: 'POST',
    url: '/api/jobs',
    body: { title: 'Application Support Engineer', company: 'ExampleSoft' },
  }, store);

  const error = new Error('Set OPENAI_API_KEY');
  error.code = 'ai_not_configured';

  const response = await dispatchApi({
    method: 'POST',
    url: '/api/jobs/job-1/package/generate',
    body: {},
  }, store, {
    generateApplicationPackage: async () => { throw error; },
  });

  assert.equal(response.status, 424);
  assert.equal(response.body.error, 'ai_not_configured');
});

test('queues runner commands from the hosted dashboard', async () => {
  const store = createStore();

  const created = await dispatchApi({
    method: 'POST',
    url: '/api/runner/commands',
    body: { runner: 'discover' },
  }, store);
  const listed = await dispatchApi({ method: 'GET', url: '/api/runner/commands' }, store);

  assert.equal(created.status, 202);
  assert.equal(created.body.runner, 'discover');
  assert.equal(listed.body[0].status, 'queued');
});

test('lets the local runner publish state, claim commands, and update logs', async () => {
  const store = createStore();
  await dispatchApi({ method: 'POST', url: '/api/runner/commands', body: { runner: 'score-ai' } }, store);

  const stateResponse = await dispatchApi({
    method: 'PATCH',
    url: '/api/runner/state',
    body: {
      status: { 'score-ai': { status: 'idle' } },
      aiModels: [{ id: 'claude-haiku-4-5', available: true }],
    },
  }, store);
  const claimed = await dispatchApi({ method: 'POST', url: '/api/runner/commands/claim', body: {} }, store);
  const updated = await dispatchApi({
    method: 'PATCH',
    url: '/api/runner/commands/cmd-1',
    body: { status: 'exited', exitCode: 0, logs: [{ message: 'done' }] },
  }, store);

  assert.equal(stateResponse.status, 200);
  assert.equal(claimed.body.runner, 'score-ai');
  assert.equal(updated.body.status, 'exited');
  assert.equal(updated.body.logs[0].message, 'done');
});

test('stores desired local runner config from the dashboard', async () => {
  const store = createStore();

  const response = await dispatchApi({
    method: 'PUT',
    url: '/api/runner/config',
    body: { aiProvider: 'anthropic', aiModel: 'claude-haiku-4-5' },
  }, store);

  assert.equal(response.status, 200);
  assert.equal(response.body.desiredConfig.aiModel, 'claude-haiku-4-5');
});

test('postgres runner command claims use row locking to avoid duplicate claims', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/SELECT id\s+FROM runner_commands/i.test(text)) return { rows: [{ id: 'cmd-1' }] };
      if (/UPDATE runner_commands/i.test(text)) {
        return {
          rows: [{
            id: 'cmd-1',
            runner: 'discover',
            status: 'running',
            payload: {},
            logs: [],
          }],
        };
      }
      return { rows: [] };
    },
    release() {
      calls.push({ sql: 'RELEASE', params: [] });
    },
  };
  const store = createPostgresStore({
    dialect: 'postgres',
    connect: async () => client,
    query: async () => {
      throw new Error('claimRunnerCommand should use a transaction client for Postgres');
    },
  });

  const claimed = await store.claimRunnerCommand();
  const selectCall = calls.find(call => /SELECT id\s+FROM runner_commands/i.test(call.sql));

  assert.equal(claimed.id, 'cmd-1');
  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(selectCall.sql, /FOR UPDATE SKIP LOCKED/i);
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
  assert.ok(calls.some(call => call.sql === 'RELEASE'));
});
