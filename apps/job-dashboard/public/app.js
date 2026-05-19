const state = {
  profile: {},
  portals: [],
  jobs: [],
  packages: [],
  events: [],
  runnerStatus: {},
  runnerConfig: {},
  runnerCommands: [],
  aiModels: [],
  aiGateway: {},
};

let token = localStorage.getItem('careerOpsDashboardToken') || '';
const localRunnerUrl = localStorage.getItem('careerOpsLocalRunnerUrl') || 'http://127.0.0.1:48731';

document.querySelectorAll('.nav-button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-button').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.view').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(button.dataset.view).classList.add('active');
  });
});

document.getElementById('refreshButton').addEventListener('click', loadAll);
document.getElementById('newJobButton').addEventListener('click', () => document.getElementById('jobDialog').showModal());
document.getElementById('createJobButton').addEventListener('click', createJob);
document.getElementById('saveProfileButton').addEventListener('click', saveProfile);
document.getElementById('connectRunnerButton').addEventListener('click', () => loadRunnerStatus({ alertOnError: true }));
document.getElementById('saveRunnerConfigButton').addEventListener('click', saveRunnerConfig);
document.getElementById('runnerAiProvider').addEventListener('change', () => renderAiModelOptions(state.runnerConfig));
document.getElementById('runnerAiModelSelect').addEventListener('change', syncAiModelSelection);
document.getElementById('testSelectedAiModelButton').addEventListener('click', testSelectedAiModel);
document.getElementById('testCheapAiModelsButton').addEventListener('click', testCheapAiModels);
document.querySelectorAll('[data-start-runner]').forEach(button => {
  button.addEventListener('click', () => startRunner(button.dataset.startRunner));
});

await loadAll();
await loadRunnerStatus({ alertOnError: false });
setInterval(() => loadRunnerStatus({ alertOnError: false }), 5000);

async function loadAll() {
  const [profile, portals, jobs, packagesList, events] = await Promise.all([
    api('/api/profile'),
    api('/api/portals'),
    api('/api/jobs'),
    api('/api/packages'),
    api('/api/events'),
  ]);
  Object.assign(state, { profile, portals, jobs, packages: packagesList, events });
  renderJobs();
  renderProfile();
  renderPortals();
  renderPackages();
  renderEvents();
}

function renderJobs() {
  const target = document.getElementById('jobsTable');
  const rows = state.jobs.map(job => `
    <div class="row">
      <div class="score ${scoreClass(job.fitScore)}">${job.fitScore || 0}%</div>
      <div><strong>${escapeHtml(job.company || '')}</strong><br><span class="muted">${escapeHtml(job.portal || '')}</span></div>
      <div>${escapeHtml(job.title || '')}<br><span class="muted">${escapeHtml(job.location || '')}</span></div>
      <div>${escapeHtml(job.recommendation || 'review')}</div>
      <div>${escapeHtml(job.status || 'discovered')}</div>
      <button class="secondary-button" data-generate-job="${job.id}">Generate AI Draft</button>
    </div>
  `).join('');

  target.innerHTML = `
    <div class="row header">
      <div>Fit</div><div>Company</div><div>Role</div><div>Recommendation</div><div>Status</div><div>Action</div>
    </div>
    ${rows || '<div class="item"><h3>No jobs yet</h3><p>Add a job manually or import scanned jobs into the database.</p></div>'}
  `;

  target.querySelectorAll('[data-generate-job]').forEach(button => {
    button.addEventListener('click', () => generatePackage(button.dataset.generateJob, button));
  });
}

function renderProfile() {
  setValue('profileFullName', state.profile.fullName);
  setValue('profileEmail', state.profile.email);
  setValue('profilePhone', state.profile.phone);
  setValue('profileLocation', state.profile.location);
  setValue('profileLinkedin', state.profile.linkedin);
  setValue('profileGithub', state.profile.github);
  setValue('profileHeadline', state.profile.headline);
  setValue('profileTargetRoles', (state.profile.targetRoles || []).join('\n'));
  setValue('profileSkills', (state.profile.skills || []).join('\n'));
}

function renderPortals() {
  document.getElementById('portalsList').innerHTML = state.portals.map(portal => {
    const hints = portal.fieldHints || {};
    const discovery = hints.discovery || {};
    return `
    <div class="item portal-card" data-portal-card="${escapeHtml(portal.portal)}">
      <div class="item-head">
        <h3>${escapeHtml(portal.portal)}</h3>
        <button class="primary-button" data-save-portal="${escapeHtml(portal.portal)}">Save</button>
      </div>
      <div class="form-grid compact">
        <label>Enabled<input data-portal-enabled type="checkbox" ${discovery.enabled === false ? '' : 'checked'}></label>
        <label>Login email<input data-portal-email value="${escapeHtml(portal.usernameEmail || '')}"></label>
        <label class="wide">Profile URL<input data-portal-profile value="${escapeHtml(portal.profileUrl || '')}"></label>
        <label class="wide">Discovery keywords<textarea data-portal-keywords>${escapeHtml((discovery.keywords || []).join('\n'))}</textarea></label>
        <label class="wide">Field hints JSON<textarea data-portal-hints>${escapeHtml(JSON.stringify({ ...hints, discovery: undefined }, null, 2))}</textarea></label>
        <label class="wide">Notes<textarea data-portal-notes>${escapeHtml(portal.notes || '')}</textarea></label>
      </div>
    </div>
  `;
  }).join('') || '<div class="item"><h3>No portals configured</h3><p>Run the latest migration or refresh after deploy; eJobs, BestJobs, HiPo, and LinkedIn are seeded automatically.</p></div>';

  document.querySelectorAll('[data-save-portal]').forEach(button => {
    button.addEventListener('click', () => savePortal(button.dataset.savePortal, button));
  });
}

function renderPackages() {
  document.getElementById('packagesList').innerHTML = state.packages.map(pkg => `
    <div class="item">
      <h3>${escapeHtml(pkg.company || 'Application package')} - ${escapeHtml(pkg.title || '')}</h3>
      <p><strong>Approval:</strong> ${escapeHtml(pkg.approvalState)} · <strong>Runner:</strong> ${escapeHtml(pkg.runnerStatus)}</p>
      <p><strong>Cover letter:</strong></p>
      <p>${escapeHtml((pkg.coverLetter || '').slice(0, 360))}</p>
      <div class="field-block">
        <strong>Required fields</strong>
        ${renderKeyValues(pkg.requiredFields)}
      </div>
      <div class="field-block">
        <strong>Missing fields</strong>
        ${renderKeyValues(pkg.missingFields)}
      </div>
      <button class="primary-button" data-approve="${pkg.id}" ${pkg.approvalState === 'approved' ? 'disabled' : ''}>Approve for local runner</button>
    </div>
  `).join('') || '<div class="item"><h3>No packages yet</h3><p>Create a draft from an application row.</p></div>';

  document.querySelectorAll('[data-approve]').forEach(button => {
    button.addEventListener('click', async () => {
      await api(`/api/packages/${button.dataset.approve}/approve`, { method: 'POST' });
      await loadAll();
    });
  });
}

function renderEvents() {
  document.getElementById('eventsList').innerHTML = state.events.map(event => `
    <div class="item">
      <h3>${escapeHtml(event.eventType || '')}</h3>
      <p>${escapeHtml(event.message || '')}</p>
      <p>${escapeHtml(event.createdAt || '')}</p>
    </div>
  `).join('') || '<div class="item"><h3>No activity yet</h3><p>Dashboard events will appear here.</p></div>';
}

async function createJob(event) {
  event.preventDefault();
  await api('/api/jobs', {
    method: 'POST',
    body: {
      url: value('jobUrl') || `manual:${Date.now()}`,
      company: value('jobCompany'),
      title: value('jobTitle'),
      portal: value('jobPortal'),
      location: value('jobLocation'),
      description: value('jobDescription'),
    },
  });
  document.getElementById('jobDialog').close();
  await loadAll();
}

async function generatePackage(jobId, button) {
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = 'Generating...';
  try {
    await api(`/api/jobs/${jobId}/package/generate`, { method: 'POST', body: {} });
    await loadAll();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function saveProfile() {
  await api('/api/profile', {
    method: 'PUT',
    body: {
      fullName: value('profileFullName'),
      email: value('profileEmail'),
      phone: value('profilePhone'),
      location: value('profileLocation'),
      linkedin: value('profileLinkedin'),
      github: value('profileGithub'),
      headline: value('profileHeadline'),
      targetRoles: lines('profileTargetRoles'),
      skills: lines('profileSkills'),
      applicationDefaults: state.profile.applicationDefaults || {},
    },
  });
  await loadAll();
}

async function savePortal(portal, button) {
  const card = button.closest('[data-portal-card]');
  const hints = parseJson(card.querySelector('[data-portal-hints]').value, {});
  hints.discovery = {
    enabled: card.querySelector('[data-portal-enabled]').checked,
    keywords: textLines(card.querySelector('[data-portal-keywords]').value),
  };

  button.disabled = true;
  try {
    await api(`/api/portals/${portal}`, {
      method: 'PUT',
      body: {
        portal,
        profileUrl: card.querySelector('[data-portal-profile]').value.trim(),
        usernameEmail: card.querySelector('[data-portal-email]').value.trim(),
        notes: card.querySelector('[data-portal-notes]').value.trim(),
        fieldHints: hints,
      },
    });
    await loadAll();
  } finally {
    button.disabled = false;
  }
}

async function loadRunnerStatus({ alertOnError = false } = {}) {
  try {
    const [health, status, config, aiModels] = await Promise.all([
      localRunner('/health'),
      localRunner('/status'),
      localRunner('/config'),
      localRunner('/ai/models').catch(() => ({ models: [], gateway: {} })),
    ]);
    state.runnerStatus = status;
    state.runnerConfig = config;
    state.aiModels = aiModels.models || [];
    state.aiGateway = aiModels.gateway || {};
    document.getElementById('localRunnerStatus').textContent = `${health.service} connected`;
    renderRunnerConfig(config);
    renderRunnerStatus(status);
    await loadRunnerLogs();
  } catch (error) {
    const cloudState = await loadCloudRunnerState().catch(() => null);
    if (!cloudState) {
      document.getElementById('localRunnerStatus').textContent = 'Local runner offline';
      renderRunnerStatus({});
      if (alertOnError) alert('Local runner is not reachable yet. Start it with npm run runner:control --prefix apps/job-dashboard');
    }
  }
}

async function loadRunnerLogs(runner = 'discover') {
  try {
    const logs = await localRunner(`/logs?runner=${encodeURIComponent(runner)}`);
    document.getElementById('runnerLogs').innerHTML = `<code>${escapeHtml(logs.map(item => `[${item.at}] ${item.stream}: ${item.message}`).join('\n') || 'No logs yet.')}</code>`;
  } catch {
    renderCloudRunnerLogs(runner);
  }
}

async function loadCloudRunnerState() {
  const [runnerState, commands] = await Promise.all([
    api('/api/runner/state'),
    api('/api/runner/commands'),
  ]);
  state.runnerStatus = runnerState.status || {};
  state.runnerConfig = runnerState.config || {};
  state.runnerCommands = commands || [];
  state.aiModels = runnerState.aiModels || [];
  state.aiGateway = runnerState.aiGateway || {};
  const updated = runnerState.updatedAt ? `Synced ${new Date(runnerState.updatedAt).toLocaleTimeString()}` : 'Waiting for local sync';
  document.getElementById('localRunnerStatus').textContent = updated;
  renderRunnerConfig(state.runnerConfig);
  renderRunnerStatus(state.runnerStatus);
  renderCloudRunnerLogs();
  return runnerState;
}

function renderCloudRunnerLogs(runner = 'discover') {
  const command = state.runnerCommands.find(item => item.runner === runner)
    || state.runnerCommands.find(item => ['test-ai', 'test-cheap-ai'].includes(item.runner))
    || state.runnerCommands[0];
  const logs = command?.logs || [];
  document.getElementById('runnerLogs').innerHTML = `<code>${escapeHtml(logs.map(item => `[${item.at || command.updatedAt || ''}] ${item.stream || 'cloud'}: ${item.message || ''}${item.detail ? `\n${item.detail}` : ''}`).join('\n') || 'No runner logs yet.')}</code>`;
}

function renderRunnerConfig(config = {}) {
  setValue('runnerDashboardUrl', config.dashboardUrl || window.location.origin);
  setValue('runnerDashboardToken', config.dashboardToken || token || '');
  setValue('runnerAiProvider', config.aiProvider || 'openai');
  renderAiModelOptions(config);
  setValue('runnerAiBaseUrl', config.aiBaseUrl || 'http://127.0.0.1:8317/api/provider/openai/v1');
  setValue('runnerAiProxyApiKey', config.aiProxyApiKey || '');
  setValue('runnerAiFitLimit', config.aiFitLimit || '40');
  setValue('runnerAiDraftMinFit', config.aiDraftMinFit || '60');
  setValue('runnerAiDraftLimit', config.aiDraftLimit || '20');
}

function renderRunnerStatus(status = {}) {
  const names = ['discover', 'score-ai', 'draft-ai', 'applications'];
  document.getElementById('runnerCards').innerHTML = names.map(name => {
    const run = status[name] || { status: 'idle', logs: [] };
    return `
      <button class="runner-card" data-runner-logs="${name}">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(run.status || 'idle')}</span>
        <small>${escapeHtml(run.logs?.at(-1)?.message || '')}</small>
      </button>
    `;
  }).join('');

  document.querySelectorAll('[data-runner-logs]').forEach(button => {
    button.addEventListener('click', () => loadRunnerLogs(button.dataset.runnerLogs));
  });
}

function renderAiModelOptions(config = {}) {
  const select = document.getElementById('runnerAiModelSelect');
  const selectedProvider = value('runnerAiProvider') || config.aiProvider || 'openai';
  const models = state.aiModels.length > 0
    ? state.aiModels
    : fallbackAiModels(config);

  select.innerHTML = models.map(model => {
    const status = model.available ? 'available' : 'unavailable on gateway';
    const suffix = `${model.recommended ? ' · cheap' : ''} · ${status}`;
    const selected = model.available
      && model.provider === (config.aiProvider || selectedProvider)
      && [model.id, model.gatewayModel].includes(config.aiModel)
      ? 'selected'
      : '';
    const disabled = model.available ? '' : 'disabled';
    return `<option value="${escapeHtml(model.provider)}|${escapeHtml(model.id)}" data-provider="${escapeHtml(model.provider)}" data-gateway-model="${escapeHtml(model.gatewayModel || model.id)}" data-base-url="${escapeHtml(baseUrlFor(model.provider))}" ${disabled} ${selected}>${escapeHtml(model.label || model.id)}${escapeHtml(suffix)}</option>`;
  }).join('');

  const current = select.selectedOptions[0];
  if ((!select.value || current?.disabled) && select.options.length > 0) {
    const preferred = [...select.options].find(option => !option.disabled && option.dataset.provider === selectedProvider)
      || [...select.options].find(option => !option.disabled && option.dataset.provider === 'anthropic')
      || [...select.options].find(option => !option.disabled)
      || select.options[0];
    preferred.selected = true;
  }

  syncAiModelSelection();
}

function syncAiModelSelection() {
  const selected = selectedAiModel();
  if (!selected) return;
  setValue('runnerAiProvider', selected.provider);
  setValue('runnerAiBaseUrl', selected.baseUrl);
}

async function saveRunnerConfig() {
  const selected = selectedAiModel();
  const config = {
    dashboardUrl: value('runnerDashboardUrl') || window.location.origin,
    dashboardToken: value('runnerDashboardToken') || token || '',
    aiProvider: selected?.provider || value('runnerAiProvider'),
    aiModel: selected?.gatewayModel || '',
    aiBaseUrl: selected?.baseUrl || value('runnerAiBaseUrl'),
    aiProxyApiKey: value('runnerAiProxyApiKey'),
    aiFitLimit: value('runnerAiFitLimit') || '40',
    aiDraftMinFit: value('runnerAiDraftMinFit') || '60',
    aiDraftLimit: value('runnerAiDraftLimit') || '20',
  };
  try {
    await localRunner('/config', { method: 'PUT', body: config });
  } catch {
    await api('/api/runner/config', { method: 'PUT', body: config });
  }
  await loadRunnerStatus({ alertOnError: true });
}

async function testSelectedAiModel() {
  const selected = selectedAiModel();
  if (!selected) return;
  renderAiModelResults([{ ok: false, provider: '', model: '', detail: 'No model selected.' }]);
  try {
    const result = await localRunner('/ai/test', {
      method: 'POST',
      body: {
        provider: selected.provider,
        model: selected.gatewayModel,
      },
    });
    renderAiModelResults([result]);
  } catch {
    await api('/api/runner/commands', {
      method: 'POST',
      body: { runner: 'test-ai', payload: { provider: selected.provider, model: selected.gatewayModel } },
    });
    renderAiModelResults([{ ok: true, provider: selected.provider, model: selected.gatewayModel, detail: 'Queued on local runner.' }]);
    setTimeout(() => loadRunnerStatus({ alertOnError: false }), 4000);
  }
}

async function testCheapAiModels() {
  renderAiModelResults([{ ok: false, provider: '', model: '', detail: 'Testing...' }]);
  try {
    const result = await localRunner('/ai/test-cheap', { method: 'POST', body: {} });
    renderAiModelResults(result.results || []);
  } catch {
    await api('/api/runner/commands', { method: 'POST', body: { runner: 'test-cheap-ai' } });
    renderAiModelResults([{ ok: true, provider: 'AI', model: 'cheap set', detail: 'Queued on local runner.' }]);
    setTimeout(() => loadRunnerStatus({ alertOnError: false }), 4000);
  }
}

function renderAiModelResults(results = []) {
  const target = document.getElementById('aiModelResults');
  target.innerHTML = results.map(result => `
    <div class="model-result ${result.ok ? 'ok' : 'fail'}">
      <strong>${escapeHtml(result.provider || 'AI')} ${escapeHtml(result.model || '')}</strong>
      <span>${result.ok ? 'OK' : `Failed${result.status ? ` ${result.status}` : ''}`}${result.ms ? ` · ${result.ms}ms` : ''}</span>
      <small>${escapeHtml(cleanModelDetail(result.detail || ''))}</small>
    </div>
  `).join('');
}

async function startRunner(runner) {
  try {
    await localRunner('/start', { method: 'POST', body: { runner } });
  } catch {
    await api('/api/runner/commands', { method: 'POST', body: { runner } });
  }
  await loadRunnerStatus({ alertOnError: true });
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body) headers['content-type'] = 'application/json';
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 401) {
    token = prompt('Dashboard access token') || '';
    if (token) {
      localStorage.setItem('careerOpsDashboardToken', token);
      return api(path, options);
    }
  }
  if (!response.ok) {
    let message = `${response.status} ${path}`;
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // Keep the HTTP status fallback.
    }
    throw new Error(message);
  }
  return response.json();
}

function renderKeyValues(value) {
  const entries = Object.entries(value || {});
  if (entries.length === 0) return '<p class="muted">None</p>';
  return `<dl class="kv-list">${entries.map(([key, item]) => `
    <div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(item)}</dd></div>
  `).join('')}</dl>`;
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function setValue(id, current) {
  document.getElementById(id).value = Array.isArray(current) ? current.join('\n') : (current || '');
}

function lines(id) {
  return textLines(value(id));
}

function textLines(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function parseJson(text, fallback) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    alert('Field hints must be valid JSON.');
    return fallback;
  }
}

function selectedAiModel() {
  const select = document.getElementById('runnerAiModelSelect');
  const option = select.selectedOptions[0];
  if (!option) return null;
  return {
    provider: option.dataset.provider || value('runnerAiProvider'),
    gatewayModel: option.dataset.gatewayModel || option.value.split('|')[1] || '',
    baseUrl: option.dataset.baseUrl || baseUrlFor(option.dataset.provider),
  };
}

function fallbackAiModels(config = {}) {
  const provider = config.aiProvider || 'anthropic';
  const model = config.aiModel || (provider === 'anthropic' ? 'SubscriptionGateway/claude-haiku-4-5-20251001' : 'gpt-5.4-mini');
  return [{
    provider,
    id: model,
    gatewayModel: model,
    label: model,
    recommended: false,
    available: false,
  }];
}

function baseUrlFor(provider) {
  return `http://127.0.0.1:8317/api/provider/${provider === 'anthropic' ? 'anthropic' : 'openai'}/v1`;
}

function cleanModelDetail(detail) {
  return String(detail || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .slice(0, 220);
}

async function localRunner(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['content-type'] = 'application/json';
  const response = await fetch(`${localRunnerUrl}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(`Local runner ${response.status}`);
  return response.json();
}

function scoreClass(score) {
  if (score >= 80) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}
