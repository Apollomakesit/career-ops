import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(runnerDir, '..', '..', '..');
const defaultConfigPath = path.join(repoRoot, '.career-ops-runner.local.json');

export function defaultLocalConfig() {
  return {
    dashboardUrl: process.env.DASHBOARD_URL || 'https://job-dashboard-production-0773.up.railway.app',
    dashboardToken: process.env.DASHBOARD_TOKEN || '',
    browserProfile: process.env.CAREER_OPS_BROWSER_PROFILE || '.career-ops-browser',
    aiProvider: process.env.AI_PROVIDER || 'anthropic',
    aiBaseUrl: process.env.AI_BASE_URL || 'http://127.0.0.1:8317/api/provider/anthropic/v1',
    aiModel: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'SubscriptionGateway/claude-haiku-4-5-20251001',
    aiProxyApiKey: process.env.AI_PROXY_API_KEY || '',
    aiFitLimit: process.env.AI_FIT_LIMIT || '40',
    aiDraftMinFit: process.env.AI_DRAFT_MIN_FIT || '60',
    aiDraftLimit: process.env.AI_DRAFT_LIMIT || '20',
    cliProxyUrl: process.env.CLI_PROXY_URL || 'http://127.0.0.1:8317',
    cliProxyManagementKey: process.env.CLI_PROXY_MANAGEMENT_KEY || '',
  };
}

export function loadLocalConfig(configPath = defaultConfigPath) {
  if (!existsSync(configPath)) return defaultLocalConfig();
  try {
    const text = readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
    return {
      ...defaultLocalConfig(),
      ...JSON.parse(text),
    };
  } catch {
    return defaultLocalConfig();
  }
}

export function saveLocalConfig(config, configPath = defaultConfigPath) {
  const merged = {
    ...defaultLocalConfig(),
    ...config,
  };
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return merged;
}

export function envFromLocalConfig(config = loadLocalConfig()) {
  return {
    DASHBOARD_URL: config.dashboardUrl || '',
    DASHBOARD_TOKEN: config.dashboardToken || '',
    CAREER_OPS_BROWSER_PROFILE: config.browserProfile || '.career-ops-browser',
    AI_PROVIDER: config.aiProvider || 'openai',
    AI_BASE_URL: config.aiBaseUrl || '',
    AI_MODEL: config.aiModel || '',
    AI_PROXY_API_KEY: config.aiProxyApiKey || '',
    AI_FIT_LIMIT: String(config.aiFitLimit || '40'),
    AI_DRAFT_MIN_FIT: String(config.aiDraftMinFit || '60'),
    AI_DRAFT_LIMIT: String(config.aiDraftLimit || '20'),
  };
}

export function redactLocalConfig(config = {}) {
  return {
    ...config,
    dashboardToken: config.dashboardToken ? 'configured' : '',
    aiProxyApiKey: config.aiProxyApiKey ? 'configured' : '',
    cliProxyManagementKey: config.cliProxyManagementKey ? 'configured' : '',
  };
}
