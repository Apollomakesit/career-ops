import { annotateModelAvailability, listConfiguredAiModels } from './ai-models.mjs';
import { listGatewayModels, testAiGatewayModel, testCheapGatewayModels } from './ai-gateway.mjs';

export function controlCorsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-private-network': 'true',
  };
}

export function createControlHandler({
  manager,
  loadConfig,
  saveConfig,
  redactConfig = value => value,
  listModels = listGatewayModels,
  testModel = testAiGatewayModel,
  testCheapModels = testCheapGatewayModels,
} = {}) {
  return async function handleControlRequest({ method, url, body }) {
    const parsed = new URL(url || '/', 'http://127.0.0.1:48731');

    if (method === 'GET' && parsed.pathname === '/health') {
      return response(200, { ok: true, service: 'career-ops-local-runner' });
    }

    if (method === 'GET' && parsed.pathname === '/config') {
      return response(200, redactConfig(loadConfig()));
    }

    if (method === 'PUT' && parsed.pathname === '/config') {
      const current = loadConfig();
      const incoming = body || {};
      const merged = saveConfig({
        ...current,
        ...incoming,
        dashboardToken: incoming.dashboardToken === 'configured' ? current.dashboardToken : incoming.dashboardToken,
        aiProxyApiKey: incoming.aiProxyApiKey === 'configured' ? current.aiProxyApiKey : incoming.aiProxyApiKey,
      });
      return response(200, redactConfig(merged));
    }

    if (method === 'GET' && parsed.pathname === '/status') {
      return response(200, manager.status());
    }

    if (method === 'GET' && parsed.pathname === '/logs') {
      return response(200, manager.logs(parsed.searchParams.get('runner') || 'discover'));
    }

    if (method === 'POST' && parsed.pathname === '/start') {
      manager.start((body || {}).runner);
      return response(202, manager.status()[(body || {}).runner]);
    }

    if (method === 'GET' && parsed.pathname === '/ai/models') {
      const config = loadConfig();
      const gateway = config.aiProxyApiKey
        ? await listModels({ apiKey: config.aiProxyApiKey })
        : { ids: [], ok: false, status: 0 };
      return response(200, {
        gateway,
        models: annotateModelAvailability(listConfiguredAiModels(), gateway.ids),
      });
    }

    if (method === 'POST' && parsed.pathname === '/ai/test') {
      const config = loadConfig();
      if (!config.aiProxyApiKey) return response(424, missingProxyKey());
      return response(200, await testModel({
        provider: (body || {}).provider || config.aiProvider,
        model: (body || {}).model || config.aiModel,
        apiKey: config.aiProxyApiKey,
      }));
    }

    if (method === 'POST' && parsed.pathname === '/ai/test-cheap') {
      const config = loadConfig();
      if (!config.aiProxyApiKey) return response(424, missingProxyKey());
      return response(200, {
        results: await testCheapModels({ apiKey: config.aiProxyApiKey }),
      });
    }

    return response(404, { error: 'not_found' });
  };
}

function response(status, body) {
  return { status, body };
}

function missingProxyKey() {
  return {
    error: 'ai_proxy_key_missing',
    message: 'Save the CLIProxyAPI local auth key in the Operations tab or rerun start-local.ps1.',
  };
}
