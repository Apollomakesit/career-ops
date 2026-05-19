#!/usr/bin/env node
import 'dotenv/config';

import { createRunnerClient } from './api-client.mjs';
import { scoreJobsWithAi } from './ai-fit-runner-core.mjs';
import { envFromLocalConfig, loadLocalConfig } from './local-config.mjs';
import { generateAiFitScore, resolveAiRuntimeConfig } from '../src/ai-generator.mjs';

const localEnv = envFromLocalConfig(loadLocalConfig());
const env = { ...localEnv, ...process.env };
const dashboardUrl = env.DASHBOARD_URL || 'http://localhost:3000';
const token = env.DASHBOARD_TOKEN || '';
const limit = Number(env.AI_FIT_LIMIT || 40);
const aiConfig = resolveAiRuntimeConfig(env);

const client = createRunnerClient({ baseUrl: dashboardUrl, token });

console.log(`Dashboard: ${dashboardUrl}`);
console.log(`AI provider: ${aiConfig.provider}`);
console.log(`AI model: ${aiConfig.model}`);
console.log(`AI base URL: ${aiConfig.baseUrl || 'OpenAI public API'}`);
console.log(`Scoring up to ${limit} job(s).`);

const result = await scoreJobsWithAi({
  client,
  limit,
  onLog: message => console.log(message),
  generateFitScore: ({ profile, job, rulesFit }) => generateAiFitScore({
    profile,
    job,
    rulesFit,
    provider: aiConfig.provider,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model,
    baseUrl: aiConfig.baseUrl,
  }),
});

console.log(`AI fit run complete. Updated ${result.updated}/${result.selected} job(s).`);
if (result.failed.length > 0) {
  console.log(`Failures: ${result.failed.length}`);
  for (const failure of result.failed) console.log(`  - ${failure.jobId}: ${failure.error}`);
}
