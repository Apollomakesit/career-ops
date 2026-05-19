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
    async getJob(id) { return state.jobs.find(job => job.id === id) || null; },
    async createJob(job) {
      const created = { id: 'job-1', ...job };
      state.jobs.push(created);
      return created;
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
    async listEvents() { return state.events; },
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
