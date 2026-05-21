import { generateApplicationPackage } from '../src/ai-generator.mjs';

export function selectJobsForDrafting({
  jobs = [],
  packages = [],
  minFitScore = Number(process.env.AI_DRAFT_MIN_FIT || 60),
  limit = Number(process.env.AI_DRAFT_LIMIT || 20),
} = {}) {
  const packagedJobIds = new Set(packages.map(pkg => pkg.jobId || pkg.job_id).filter(Boolean));
  return jobs
    .filter(job => !packagedJobIds.has(job.id))
    .filter(job => Number(job.fitScore ?? job.fit?.score ?? 0) >= minFitScore)
    .slice(0, limit);
}

export async function draftPackagesForJobs({
  client,
  generatePackage = generateApplicationPackage,
  minFitScore = Number(process.env.AI_DRAFT_MIN_FIT || 60),
  limit = Number(process.env.AI_DRAFT_LIMIT || 20),
  cooldownMs = Number(process.env.AI_REQUEST_COOLDOWN_MS || 0),
  wait = delay,
  onLog = () => {},
} = {}) {
  const [profile, jobs, packages] = await Promise.all([
    client.fetchProfile(),
    client.fetchJobs(),
    client.fetchPackages(),
  ]);

  const selected = selectJobsForDrafting({ jobs, packages, minFitScore, limit });
  onLog(`Selected ${selected.length} job(s) for local AI drafting.`);

  let created = 0;
  const failed = [];

  for (let index = 0; index < selected.length; index += 1) {
    const job = selected[index];
    if (index > 0 && cooldownMs > 0) await wait(cooldownMs);
    try {
      onLog(`Drafting ${job.company || 'Unknown company'} - ${job.title || 'Unknown role'} (${job.fitScore || 0}%).`);
      const generated = await generatePackage({ profile, job });
      await client.createPackage(job.id, generated);
      created += 1;
      onLog(`Created draft package for ${job.company || 'company'} - ${job.title || 'role'}.`);
    } catch (error) {
      failed.push({ jobId: job.id, error: error.message });
      onLog(`Failed to draft ${job.company || 'company'} - ${job.title || 'role'}: ${error.message}`);
    }
  }

  return {
    selected: selected.length,
    created,
    failed,
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
