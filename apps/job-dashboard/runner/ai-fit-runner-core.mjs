import { generateAiFitScore } from '../src/ai-generator.mjs';

export function selectJobsForAiScoring({
  jobs = [],
  limit = Number(process.env.AI_FIT_LIMIT || 40),
} = {}) {
  return jobs
    .filter(job => job?.id)
    .filter(job => `${job.title || ''} ${job.description || ''}`.trim().length > 0)
    .slice(0, limit);
}

export async function scoreJobsWithAi({
  client,
  generateFitScore = generateAiFitScore,
  limit = Number(process.env.AI_FIT_LIMIT || 40),
  cooldownMs = Number(process.env.AI_REQUEST_COOLDOWN_MS || 0),
  wait = delay,
  onLog = () => {},
} = {}) {
  const [profile, jobs] = await Promise.all([
    client.fetchProfile(),
    client.fetchJobs(),
  ]);

  const selected = selectJobsForAiScoring({ jobs, limit });
  onLog(`Selected ${selected.length} job(s) for local AI fit scoring.`);

  let updated = 0;
  const failed = [];

  for (let index = 0; index < selected.length; index += 1) {
    const job = selected[index];
    if (index > 0 && cooldownMs > 0) await wait(cooldownMs);
    try {
      onLog(`Scoring ${job.company || 'Unknown company'} - ${job.title || 'Unknown role'}.`);
      const fit = await generateFitScore({
        profile,
        job,
        rulesFit: jobToRulesFit(job),
      });
      await client.updateJobFit(job.id, fit);
      updated += 1;
      onLog(`Updated fit for ${job.company || 'company'} - ${job.title || 'role'}: ${fit.score}%.`);
    } catch (error) {
      failed.push({ jobId: job.id, error: error.message });
      onLog(`Failed to score ${job.company || 'company'} - ${job.title || 'role'}: ${error.message}`);
    }
  }

  return {
    selected: selected.length,
    updated,
    failed,
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jobToRulesFit(job = {}) {
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
