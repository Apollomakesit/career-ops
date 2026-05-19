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
