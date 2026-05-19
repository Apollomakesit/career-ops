#!/usr/bin/env node
import 'dotenv/config';

import { listGatewayModels, testCheapGatewayModels } from './ai-gateway.mjs';
import { loadLocalConfig } from './local-config.mjs';

const config = loadLocalConfig();

if (!config.aiProxyApiKey) {
  console.error('CLIProxyAPI local auth key is missing. Rerun apps/job-dashboard/scripts/start-local.ps1 or save it in Operations.');
  process.exit(1);
}

console.log('Listing CLIProxyAPI models...');
const models = await listGatewayModels({ apiKey: config.aiProxyApiKey });
console.log(`Gateway status: ${models.status}`);
console.log(`Advertised models: ${models.ids.join(', ') || 'none'}`);

console.log('\nTesting cost-efficient model choices...');
const results = await testCheapGatewayModels({ apiKey: config.aiProxyApiKey });
for (const result of results) {
  const status = result.ok ? 'OK' : `FAILED ${result.status || ''}`.trim();
  console.log(`${status} ${result.provider} ${result.model} (${result.ms}ms)`);
  if (!result.ok && result.detail) console.log(`  ${result.detail.slice(0, 220)}`);
}

if (results.every(result => !result.ok)) process.exit(1);
