import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;

const { createPool } = await import('../src/db.mjs');
const { migrate } = await import('../src/schema.mjs');
const { createPostgresStore } = await import('../src/routes.mjs');

async function freshStore() {
  const pool = createPool(undefined);
  assert.equal(pool.dialect, 'sqlite');
  await migrate(pool);
  return createPostgresStore(pool);
}

const sampleFit = {
  score: 82,
  category: 'strong',
  matchedSkills: ['Python', 'FastAPI'],
  missingSkills: ['Docker'],
  riskFlags: [],
  recommendation: 'apply',
  reasons: ['Good overlap.'],
};

test('migrate seeds the four Romanian portals', async () => {
  const store = await freshStore();
  const portals = await store.listPortals();
  assert.deepEqual(portals.map(p => p.portal).sort(), ['bestjobs', 'ejobs', 'hipo', 'linkedin']);
  assert.equal(portals[0].fieldHints.discovery.enabled, true);
});

test('job round-trips through create, list, get, and fit update', async () => {
  const store = await freshStore();
  const created = await store.createJob({
    url: 'https://example.com/job/1',
    company: 'ExampleSoft',
    title: 'Python FastAPI Developer',
    portal: 'bestjobs',
    fit: sampleFit,
  });
  assert.ok(created.id);
  assert.equal(created.company, 'ExampleSoft');
  assert.deepEqual(created.matchedSkills, ['Python', 'FastAPI']);

  const list = await store.listJobs();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Python FastAPI Developer');

  const fetched = await store.getJob(created.id);
  assert.equal(fetched.url, 'https://example.com/job/1');

  const rescored = await store.updateJobFit(created.id, { ...sampleFit, score: 91 });
  assert.equal(rescored.fitScore, 91);
  assert.deepEqual(rescored.missingSkills, ['Docker']);
});

test('createJob upserts on duplicate url', async () => {
  const store = await freshStore();
  await store.createJob({ url: 'https://example.com/job/dup', title: 'First', fit: sampleFit });
  await store.createJob({ url: 'https://example.com/job/dup', title: 'Second', fit: sampleFit });
  const list = await store.listJobs();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Second');
});

test('manual createJob uses a stable company and title dedup key', async () => {
  const store = await freshStore();
  const first = await store.createJob({ company: 'ExampleSoft', title: 'Support Engineer', fit: sampleFit });
  const second = await store.createJob({ company: ' examplesoft ', title: ' support engineer ', fit: sampleFit });
  const list = await store.listJobs();

  assert.match(first.url, /^manual:/);
  assert.equal(second.id, first.id);
  assert.equal(list.length, 1);
});

test('updateJob changes editable fields and persists notes', async () => {
  const store = await freshStore();
  const created = await store.createJob({
    url: 'https://example.com/job/editable',
    title: 'First title',
    company: 'FirstCo',
    location: 'Remote',
    status: 'discovered',
    fit: sampleFit,
  });

  const updated = await store.updateJob(created.id, {
    url: 'https://example.com/job/editable-updated',
    title: 'Updated title',
    company: 'UpdatedCo',
    location: 'Bucharest',
    status: 'reviewed',
    notes: 'Call recruiter before applying.',
  });
  const fetched = await store.getJob(created.id);

  assert.equal(updated.title, 'Updated title');
  assert.equal(updated.url, 'https://example.com/job/editable-updated');
  assert.equal(updated.company, 'UpdatedCo');
  assert.equal(fetched.location, 'Bucharest');
  assert.equal(fetched.status, 'reviewed');
  assert.equal(fetched.notes, 'Call recruiter before applying.');
});

test('job stats count totals and incomplete rows by portal', async () => {
  const store = await freshStore();
  await store.createJob({
    url: 'https://example.com/job/complete',
    portal: 'ejobs',
    company: 'ExampleSoft',
    title: 'Complete',
    description: 'Detailed posting '.repeat(40),
    source: 'portal-discovery:ejobs:detail',
    fit: sampleFit,
  });
  await store.createJob({
    url: 'https://example.com/job/incomplete',
    portal: 'ejobs',
    title: 'Incomplete',
    description: 'Short listing',
    source: 'portal-discovery:ejobs:partial-detail',
    fit: sampleFit,
  });
  await store.createJob({
    url: 'https://example.com/job/linkedin-incomplete',
    portal: 'linkedin',
    title: 'LinkedIn incomplete',
    source: 'portal-discovery:linkedin',
    fit: sampleFit,
  });

  const stats = await store.listJobStats();
  assert.equal(stats.total, 3);
  assert.equal(stats.incomplete, 2);
  assert.deepEqual(stats.byPortal.find(item => item.portal === 'ejobs'), {
    portal: 'ejobs',
    total: 2,
    incomplete: 1,
  });
  assert.deepEqual(stats.byPortal.find(item => item.portal === 'linkedin'), {
    portal: 'linkedin',
    total: 1,
    incomplete: 1,
  });
});

test('listJobs can return incomplete rows beyond the normal dashboard page', async () => {
  const store = await freshStore();
  for (let index = 0; index < 205; index += 1) {
    await store.createJob({
      url: `https://example.com/job/complete-${index}`,
      portal: 'ejobs',
      company: `Complete ${index}`,
      title: `Complete Role ${index}`,
      description: 'Detailed posting '.repeat(40),
      source: 'portal-discovery:ejobs:detail',
      fit: sampleFit,
      cvMatch: { score: 99, matchedSkills: ['python'], missingSkills: [], matchedProjects: [] },
    });
  }
  await store.createJob({
    url: 'https://example.com/job/incomplete-outside-page',
    portal: 'linkedin',
    company: 'IncompleteCo',
    title: 'Incomplete LinkedIn Role',
    description: 'Short listing',
    source: 'portal-discovery:linkedin:partial-detail',
    fit: sampleFit,
    cvMatch: { score: 0, matchedSkills: [], missingSkills: [], matchedProjects: [] },
  });

  const incomplete = await store.listJobs({ incomplete: true, limit: 500 });

  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].title, 'Incomplete LinkedIn Role');
});

test('listJobs and countJobs can filter by application status', async () => {
  const store = await freshStore();
  await store.createJob({
    url: 'https://example.com/job/status-applied',
    title: 'Applied Role',
    status: 'applied',
    fit: sampleFit,
  });
  await store.createJob({
    url: 'https://example.com/job/status-reviewed',
    title: 'Reviewed Role',
    status: 'reviewed',
    fit: sampleFit,
  });

  const applied = await store.listJobs({ status: 'applied' });
  const appliedTotal = await store.countJobs({ status: 'applied' });

  assert.deepEqual(applied.map(job => job.title), ['Applied Role']);
  assert.equal(appliedTotal, 1);
});

test('listJobs can sort jobs server-side by fit score', async () => {
  const store = await freshStore();
  await store.createJob({
    url: 'https://example.com/job/fit-low',
    title: 'Low Fit',
    fit: { ...sampleFit, score: 42 },
  });
  await store.createJob({
    url: 'https://example.com/job/fit-high',
    title: 'High Fit',
    fit: { ...sampleFit, score: 94 },
  });

  const byFit = await store.listJobs({ sort: 'fit_score', dir: 'asc' });

  assert.deepEqual(byFit.map(job => job.title), ['Low Fit', 'High Fit']);
});

test('job CV match stores rich breakdown evidence', async () => {
  const store = await freshStore();
  const created = await store.createJob({
    url: 'https://example.com/job/rich-match',
    title: 'Technical Support Specialist',
    fit: sampleFit,
    cvMatch: {
      score: 92,
      matchedSkills: ['servicenow'],
      missingSkills: ['ivanti'],
      matchedProjects: ['Support Automation'],
      breakdown: {
        skills: 80,
        projects: 100,
        role: 100,
        requiredSkills: ['servicenow', 'ivanti'],
        matchedSkillDetails: ['servicenow - CV skills; Project: Support Automation'],
        missingSkillDetails: ['ivanti - not found in CV skills or project proof'],
        matchedProjectDetails: ['Support Automation - servicenow, python'],
        exceedingSkills: ['python', 'playwright'],
        exceedingSignals: ['Experience: 5+ years exceeds 3+ years requested'],
      },
    },
  });

  const fetched = await store.getJob(created.id);
  assert.deepEqual(fetched.cvMatchBreakdown.requiredSkills, ['servicenow', 'ivanti']);
  assert.deepEqual(fetched.cvMatchBreakdown.exceedingSkills, ['python', 'playwright']);
  assert.ok(fetched.cvMatchBreakdown.matchedSkillDetails[0].includes('Support Automation'));
});

test('profile and portal updates persist', async () => {
  const store = await freshStore();
  await store.updateProfile({
    fullName: 'Ioan Stefan Vlaicu',
    email: 'ionut@example.com',
    targetRoles: ['Technical Support', 'Python FastAPI Developer'],
    skills: ['Python', 'FastAPI'],
  });
  const profile = await store.getProfile();
  assert.equal(profile.fullName, 'Ioan Stefan Vlaicu');
  assert.deepEqual(profile.targetRoles, ['Technical Support', 'Python FastAPI Developer']);

  const portal = await store.upsertPortal({ portal: 'ejobs', usernameEmail: 'me@x.com' });
  assert.equal(portal.usernameEmail, 'me@x.com');
});

test('packages create, approve, and report runner status', async () => {
  const store = await freshStore();
  const job = await store.createJob({ url: 'https://example.com/job/pkg', title: 'Role', fit: sampleFit });
  const pkg = await store.createPackage(job.id, {
    coverLetter: 'Letter.',
    tailoredCvMd: '# CV',
    requiredFields: { full_name: 'Ioan' },
    missingFields: { salary: 'confirm' },
  });
  assert.equal(pkg.approvalState, 'draft');
  assert.deepEqual(pkg.requiredFields, { full_name: 'Ioan' });

  const approved = await store.approvePackage(pkg.id);
  assert.equal(approved.approvalState, 'approved');

  const list = await store.listPackages({ approvalState: 'approved' });
  assert.equal(list.length, 1);
  assert.equal(list[0].company, '');
  assert.equal(list[0].title, 'Role');
  assert.equal(list[0].fitScore, sampleFit.score);
  assert.deepEqual(list[0].matchedSkills, sampleFit.matchedSkills);
});

test('packages are upserted per job instead of duplicated', async () => {
  const store = await freshStore();
  const job = await store.createJob({ url: 'https://example.com/job/pkg-upsert', title: 'Role', fit: sampleFit });

  const first = await store.createPackage(job.id, {
    coverLetter: 'First letter.',
    tailoredCvMd: '# First CV',
  });
  const second = await store.createPackage(job.id, {
    coverLetter: 'Second letter.',
    tailoredCvMd: '# Second CV',
  });
  const list = await store.listPackages();

  assert.equal(first.wasCreated, true);
  assert.equal(second.wasCreated, false);
  assert.equal(second.id, first.id);
  assert.equal(second.coverLetter, 'Second letter.');
  assert.equal(list.length, 1);
});

test('runner commands queue, claim, and update', async () => {
  const store = await freshStore();
  const queued = await store.createRunnerCommand({ runner: 'discover', payload: { keyword: 'x' } });
  assert.equal(queued.status, 'queued');

  const claimed = await store.claimRunnerCommand();
  assert.equal(claimed.id, queued.id);
  assert.equal(claimed.status, 'running');

  const finished = await store.updateRunnerCommand(claimed.id, {
    status: 'exited',
    logs: ['line one'],
    exitCode: 0,
  });
  assert.equal(finished.status, 'exited');
  assert.deepEqual(finished.logs, ['line one']);
  assert.equal(finished.exitCode, 0);

  assert.equal(await store.claimRunnerCommand(), null);
});

test('runner state stores desired config and events accumulate', async () => {
  const store = await freshStore();
  await store.updateRunnerState({ status: { online: true }, config: { aiProvider: 'anthropic' } });
  await store.updateRunnerDesiredConfig({ aiModel: 'claude-haiku-4-5' });
  const state = await store.getRunnerState();
  assert.equal(state.status.online, true);
  assert.equal(state.desiredConfig.aiModel, 'claude-haiku-4-5');

  const events = await store.listEvents();
  assert.ok(events.length > 0);
  assert.ok(events.every(event => typeof event.eventType === 'string'));
});

test('listEvents can return only events newer than a cursor', async () => {
  const store = await freshStore();
  await store.updateRunnerDesiredConfig({ aiModel: 'claude-haiku-4-5' });

  const futureEvents = await store.listEvents({ since: '2999-01-01T00:00:00.000Z' });

  assert.deepEqual(futureEvents, []);
});

test('runner desired config updates preserve nested sibling settings', async () => {
  const store = await freshStore();
  await store.updateRunnerState({
    desiredConfig: {
      ai: { model: 'claude-haiku-4-5', cooldownMs: 1000 },
      discovery: { totalBudget: 1000 },
    },
  });

  await store.updateRunnerDesiredConfig({ ai: { model: 'gpt-5.4-mini' } });
  const state = await store.getRunnerState();

  assert.equal(state.desiredConfig.ai.model, 'gpt-5.4-mini');
  assert.equal(state.desiredConfig.ai.cooldownMs, 1000);
  assert.equal(state.desiredConfig.discovery.totalBudget, 1000);
});
