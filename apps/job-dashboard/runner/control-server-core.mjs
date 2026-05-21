import { annotateModelAvailability, listConfiguredAiModels } from './ai-models.mjs';
import { listGatewayModels, testAiGatewayModel, testCheapGatewayModels } from './ai-gateway.mjs';
import { runState as defaultRunState } from './run-state.mjs';

const defaultDashboardOrigins = ['http://127.0.0.1:3000', 'http://localhost:3000'];

export function controlCorsHeaders(origin = '', {
  allowedOrigins = localDashboardOrigins(),
} = {}) {
  const headers = {
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-private-network': 'true',
    vary: 'origin',
  };
  const normalizedOrigin = normalizeOrigin(origin);
  if (normalizedOrigin && allowedOrigins.includes(normalizedOrigin)) {
    headers['access-control-allow-origin'] = normalizedOrigin;
  }
  return headers;
}

export function createControlHandler({
  manager,
  loadConfig,
  saveConfig,
  redactConfig = value => value,
  listModels = listGatewayModels,
  testModel = testAiGatewayModel,
  testCheapModels = testCheapGatewayModels,
  fetchImpl = fetch,
  runState = defaultRunState,
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
        cliProxyManagementKey: incoming.cliProxyManagementKey === 'configured'
          ? current.cliProxyManagementKey
          : incoming.cliProxyManagementKey,
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
      const payload = body || {};
      const runner = payload.runner;
      const options = {
        portal: String(payload.portal || '').trim().toLowerCase(),
        mode: String(payload.mode || '').trim().toLowerCase(),
      };
      if (runner === 'discover') {
        if (options.portal && typeof runState.resetPortal === 'function') runState.resetPortal(options.portal);
        else if (typeof runState.reset === 'function') runState.reset();
      }
      manager.start(runner, options);
      return response(202, manager.status()[runner]);
    }

    if (method === 'POST' && parsed.pathname === '/pause') {
      const portal = String((body || {}).portal || '').trim().toLowerCase();
      return response(200, portal ? runState.pausePortal(portal) : runState.pauseGlobal());
    }

    if (method === 'POST' && parsed.pathname === '/resume') {
      const portal = String((body || {}).portal || '').trim().toLowerCase();
      return response(200, portal ? runState.resumePortal(portal) : runState.resumeGlobal());
    }

    if (method === 'POST' && parsed.pathname === '/stop') {
      const portal = String((body || {}).portal || '').trim().toLowerCase();
      const stateResult = portal ? runState.stopPortal(portal) : runState.stopGlobal();
      // Per-portal stop just flags the runner; a global stop also kills the
      // child process so the user sees Stop All take effect immediately
      // instead of waiting for the loop boundary to register the flag.
      let killed = [];
      if (!portal && manager && typeof manager.stopAll === 'function') {
        killed = manager.stopAll();
      }
      return response(200, { ...stateResult, stopped: killed });
    }

    if (method === 'GET' && parsed.pathname === '/progress') {
      return response(200, runState.snapshot());
    }

    if (method === 'GET' && parsed.pathname === '/events') {
      return response(200, runState.snapshot());
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

    // --- Linked AI accounts (CLIProxyAPI management API) ----------------------

    if (method === 'GET' && parsed.pathname === '/accounts') {
      return withManagement(loadConfig(), async management => {
        const payload = await management('GET', '/v0/management/auth-files');
        return response(200, { accounts: normalizeAccounts(payload) });
      });
    }

    if (method === 'POST' && parsed.pathname === '/accounts/login') {
      const provider = normalizeAccountProvider((body || {}).provider);
      if (!provider) return response(400, { error: 'unsupported_provider' });
      return withManagement(loadConfig(), async management => {
        // is_webui=1 makes CLIProxyAPI run its own callback forwarder so the
        // OAuth redirect is captured automatically - no manual code pasting.
        const path = provider === 'anthropic'
          ? '/v0/management/anthropic-auth-url?is_webui=1'
          : '/v0/management/codex-auth-url?is_webui=1';
        const payload = await management('GET', path);
        if (!payload || !payload.url) {
          return response(502, { error: 'login_url_unavailable', detail: payload });
        }
        return response(200, { provider, url: payload.url, state: payload.state || '' });
      });
    }

    if (method === 'GET' && parsed.pathname === '/accounts/login-status') {
      const state = parsed.searchParams.get('state') || '';
      if (!state) return response(400, { error: 'state_required' });
      return withManagement(loadConfig(), async management => {
        const payload = await management('GET', `/v0/management/get-auth-status?state=${encodeURIComponent(state)}`);
        return response(200, payload || { status: 'ok' });
      });
    }

    if (method === 'PATCH' && parsed.pathname === '/accounts/status') {
      const { name, disabled } = body || {};
      if (!name || typeof disabled !== 'boolean') {
        return response(400, { error: 'name_and_disabled_required' });
      }
      return withManagement(loadConfig(), async management => {
        await management('PATCH', '/v0/management/auth-files/status', { name, disabled });
        return response(200, { ok: true, name, disabled });
      });
    }

    return response(404, { error: 'not_found' });
  };

  // CLIProxyAPI management calls share auth + base-URL handling and a single
  // "is it configured / reachable" failure path.
  async function withManagement(config, fn) {
    const baseUrl = cliProxyBaseUrl(config);
    const key = config.cliProxyManagementKey || '';
    if (!key) {
      return response(424, {
        error: 'management_key_missing',
        message: 'Run the local launcher so CLIProxyAPI starts with account management enabled.',
      });
    }
    const management = async (httpMethod, path, payload) => {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method: httpMethod,
        headers: {
          authorization: `Bearer ${key}`,
          ...(payload ? { 'content-type': 'application/json' } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const text = await res.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text };
      }
      if (!res.ok) {
        const error = new Error(`CLIProxyAPI ${path} failed (${res.status})`);
        error.status = res.status;
        error.detail = parsed;
        throw error;
      }
      return parsed;
    };
    try {
      return await fn(management);
    } catch (error) {
      return response(error.status === 401 || error.status === 403 ? 424 : 502, {
        error: 'cli_proxy_unreachable',
        message: error.message,
        detail: error.detail,
      });
    }
  }
}

function cliProxyBaseUrl(config = {}) {
  if (config.cliProxyUrl) return String(config.cliProxyUrl).replace(/\/$/, '');
  const base = String(config.aiBaseUrl || 'http://127.0.0.1:8317');
  const match = base.match(/^https?:\/\/[^/]+/i);
  return match ? match[0] : 'http://127.0.0.1:8317';
}

function normalizeAccounts(payload = {}) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  return files
    .map(file => ({
      id: file.id || file.name || '',
      name: file.name || file.id || '',
      provider: displayProvider(file.provider),
      rawProvider: String(file.provider || '').toLowerCase(),
      email: file.email || file.account || file.label || '',
      disabled: Boolean(file.disabled),
      failed: Number(file.failed || 0),
      lastError: file.lastError || file.last_error || file.error || '',
    }))
    .filter(account => account.name);
}

function displayProvider(provider) {
  const value = String(provider || '').toLowerCase();
  if (value === 'claude' || value === 'anthropic') return 'Anthropic';
  if (value === 'codex' || value === 'openai') return 'OpenAI';
  if (value === 'gemini') return 'Gemini';
  return provider || 'Unknown';
}

function normalizeAccountProvider(provider) {
  const value = String(provider || '').toLowerCase();
  if (value === 'anthropic' || value === 'claude') return 'anthropic';
  if (value === 'openai' || value === 'codex') return 'openai';
  return '';
}

function response(status, body) {
  return { status, body };
}

function localDashboardOrigins() {
  const dashboardUrl = normalizeOrigin(process.env.DASHBOARD_URL || 'http://127.0.0.1:3000');
  const configured = String(process.env.LOCAL_RUNNER_ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return [...new Set([dashboardUrl, ...defaultDashboardOrigins, ...configured].filter(Boolean))];
}

function normalizeOrigin(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return '';
  }
}

function missingProxyKey() {
  return {
    error: 'ai_proxy_key_missing',
    message: 'Save the CLIProxyAPI local auth key in the Operations tab or rerun start-local.ps1.',
  };
}
