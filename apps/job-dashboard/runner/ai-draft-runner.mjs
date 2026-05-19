#!/usr/bin/env node
import 'dotenv/config';

import { createRunnerClient } from './api-client.mjs';
import { draftPackagesForJobs } from './ai-draft-runner-core.mjs';
import { generateApplicationPackage, resolveAiRuntimeConfig } from '../src/ai-generator.mjs';

const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
const token = process.env.DASHBOARD_TOKEN || '';
const minFitScore = Number(process.env.AI_DRAFT_MIN_FIT || 60);
const limit = Number(process.env.AI_DRAFT_LIMIT || 20);
const aiConfig = resolveAiRuntimeConfig();

const client = createRunnerClient({ baseUrl: dashboardUrl, token });

console.log(`Dashboard: ${dashboardUrl}`);
console.log(`AI provider: ${aiConfig.provider}`);
console.log(`AI model: ${aiConfig.model}`);
console.log(`AI base URL: ${aiConfig.baseUrl || 'OpenAI public API'}`);
console.log(`Drafting jobs with fit score >= ${minFitScore}% (limit ${limit}).`);

const result = await draftPackagesForJobs({
  client,
  minFitScore,
  limit,
  onLog: message => console.log(message),
  generatePackage: ({ profile, job }) => generateApplicationPackage({
    profile,
    job,
    provider: aiConfig.provider,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model,
    baseUrl: aiConfig.baseUrl,
  }),
});

console.log(`AI draft run complete. Created ${result.created}/${result.selected} package(s).`);
if (result.failed.length > 0) {
  console.log(`Failures: ${result.failed.length}`);
  for (const failure of result.failed) console.log(`  - ${failure.jobId}: ${failure.error}`);
}
