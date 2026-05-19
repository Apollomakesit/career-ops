import test from 'node:test';
import assert from 'node:assert/strict';

import { selectJobsForDrafting, draftPackagesForJobs } from '../runner/ai-draft-runner-core.mjs';

test('selects fit-enough jobs that do not already have packages', () => {
  const selected = selectJobsForDrafting({
    jobs: [
      { id: 'job-1', fitScore: 87, company: 'A' },
      { id: 'job-2', fitScore: 42, company: 'B' },
      { id: 'job-3', fitScore: 90, company: 'C' },
    ],
    packages: [{ jobId: 'job-3' }],
    minFitScore: 60,
  });

  assert.deepEqual(selected.map(job => job.id), ['job-1']);
});

test('drafts packages locally and posts them back to the dashboard', async () => {
  const created = [];
  const result = await draftPackagesForJobs({
    client: {
      async fetchProfile() { return { fullName: 'Ioan Stefan Vlaicu' }; },
      async fetchJobs() { return [{ id: 'job-1', fitScore: 91, company: 'ExampleSoft', title: 'Support Engineer' }]; },
      async fetchPackages() { return []; },
      async createPackage(jobId, payload) { created.push({ jobId, payload }); return { id: 'pkg-1' }; },
    },
    minFitScore: 60,
    generatePackage: async ({ profile, job }) => ({
      coverLetter: `${profile.fullName} for ${job.company}`,
      tailoredCvMd: '# CV',
      requiredFields: {},
      missingFields: {},
    }),
  });

  assert.equal(result.created, 1);
  assert.equal(created[0].jobId, 'job-1');
  assert.equal(created[0].payload.coverLetter, 'Ioan Stefan Vlaicu for ExampleSoft');
});
