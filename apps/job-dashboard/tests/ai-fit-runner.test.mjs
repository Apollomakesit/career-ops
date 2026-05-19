import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreJobsWithAi, selectJobsForAiScoring } from '../runner/ai-fit-runner-core.mjs';

test('selects recent jobs with enough content for AI scoring', () => {
  const selected = selectJobsForAiScoring({
    jobs: [
      { id: 'job-1', title: 'Application Support Engineer', description: 'ServiceNow MDM Python automation' },
      { id: 'job-2', title: '', description: '' },
      { id: 'job-3', title: 'Python Developer', description: 'FastAPI PostgreSQL background jobs' },
    ],
    limit: 1,
  });

  assert.deepEqual(selected.map(job => job.id), ['job-1']);
});

test('scores jobs locally and posts fit data back to the dashboard', async () => {
  const updates = [];
  const logs = [];

  const result = await scoreJobsWithAi({
    client: {
      async fetchProfile() { return { fullName: 'Ioan Stefan Vlaicu', skills: ['ServiceNow', 'MDM'] }; },
      async fetchJobs() {
        return [{
          id: 'job-1',
          fitScore: 72,
          company: 'ExampleSoft',
          title: 'Application Support Engineer',
          description: 'ServiceNow MDM support automation',
        }];
      },
      async updateJobFit(jobId, fit) { updates.push({ jobId, fit }); return { id: jobId, fitScore: fit.score }; },
    },
    limit: 10,
    onLog: message => logs.push(message),
    generateFitScore: async ({ profile, job, rulesFit }) => ({
      score: 91,
      category: 'excellent',
      matchedSkills: profile.skills,
      missingSkills: [],
      riskFlags: [],
      recommendation: 'strong_apply',
      reasons: [`Rules score was ${rulesFit.score} for ${job.company}.`],
    }),
  });

  assert.equal(result.updated, 1);
  assert.equal(updates[0].jobId, 'job-1');
  assert.equal(updates[0].fit.score, 91);
  assert.match(logs.join('\n'), /Selected 1 job/);
});
