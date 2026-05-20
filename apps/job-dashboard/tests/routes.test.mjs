import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchApi } from '../src/routes.mjs';

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
  };

  return {
    state,
    async getProfile() { return state.profile; },
    async updateProfile(profile) { state.profile = profile; return profile; },
    async listPortals() { return state.portals; },
    async upsertPortal(portal) {
      state.portals = state.portals.filter(item => item.portal !== portal.portal).concat(portal);
      return portal;
    },
    async listJobs() { return state.jobs; },
    async listJobDetails(id) { return state.jobs.find(job => job.id === id) || null; },
    async getJob(id) { return state.jobs.find(job => job.id === id) || null; },
    async createJob(job) {
      const created = { id: 'job-1', ...job };
      state.jobs.push(created);
      return created;
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
    async listPackages(filter) {
      return filter?.approvalState
        ? state.packages.filter(pkg => pkg.approvalState === filter.approvalState)
        : state.packages;
    },
    async createPackage(jobId, payload) {
      const created = { id: 'pkg-1', jobId, approvalState: 'draft', runnerStatus: 'not_started', ...payload };
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

test('dispatches health without a database call', async () => {
  const response = await dispatchApi({ method: 'GET', url: '/api/health' }, createStore());
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
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

test('approves package and exposes approved queue', async () => {
  const store = createStore();
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
