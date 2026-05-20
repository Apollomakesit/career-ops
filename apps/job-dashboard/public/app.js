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
  accounts: [],
  cvMarkdown: '',
  runnerProgress: {},
  sort: { key: 'cvMatchScore', direction: 'desc' },
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
document.getElementById('closeJobDetailsButton').addEventListener('click', () => document.getElementById('jobDetailsDialog').close());
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
document.querySelectorAll('[data-runner-action]').forEach(button => {
  button.addEventListener('click', () => runnerAction(button.dataset.runnerAction));
});
['filterWorkModel', 'filterPortal', 'filterMinSalary', 'filterMaxSalary', 'filterCurrency', 'filterPostedWithin', 'filterMinMatch', 'filterSearch'].forEach(id => {
  const element = document.getElementById(id);
  element.addEventListener('input', applyFilters);
  element.addEventListener('change', applyFilters);
});
document.getElementById('saveCvButton').addEventListener('click', saveCv);
document.getElementById('rescoreCvButton').addEventListener('click', rescoreCv);
document.getElementById('cvEditor').addEventListener('input', () => {
  state.cvMarkdown = document.getElementById('cvEditor').value;
  renderCvPreview();
});
document.getElementById('refreshAccountsButton').addEventListener('click', loadAccounts);
document.getElementById('loginAnthropicButton').addEventListener('click', () => startAccountLogin('anthropic'));
document.getElementById('loginOpenaiButton').addEventListener('click', () => startAccountLogin('openai'));
document.querySelector('[data-view="accounts"]').addEventListener('click', loadAccounts);

hydrateFiltersFromLocation();
await loadAll();
await loadRunnerStatus({ alertOnError: false });
await loadRunnerProgress();
connectRunnerEvents();
setInterval(() => loadRunnerStatus({ alertOnError: false }), 5000);
setInterval(() => loadRunnerProgress(), 2000);

async function loadAll() {
  const [profile, portals, jobs, packagesList, events, cv] = await Promise.all([
    api('/api/profile'),
    api('/api/portals'),
    api(`/api/jobs${jobsQueryString()}`),
    api('/api/packages'),
    api('/api/events'),
    api('/api/cv').catch(() => ({ markdown: 'CV view is waiting for the dashboard API to reload. The canonical file is cv.md in the project root.' })),
  ]);
  Object.assign(state, { profile, portals, jobs, packages: packagesList, events, cvMarkdown: cv.markdown || '' });
  renderJobs();
  renderProfile();
  renderPortals();
  renderPackages();
  renderEvents();
  renderCv();
}

function renderJobs() {
  const target = document.getElementById('jobsTable');
  const rows = sortedJobs(state.jobs).map(job => `
    <div class="row job-row">
      <div class="score ${scoreClass(job.cvMatchScore)}">${job.cvMatchScore || 0}%</div>
      <div class="score ${scoreClass(job.fitScore)}">${job.fitScore ? `${job.fitScore}%` : '-'}</div>
      <div>
        ${job.url ? `<a class="job-title-link" href="${escapeHtml(job.url)}" target="_blank" rel="noopener">${escapeHtml(job.title || '')}</a>` : escapeHtml(job.title || '')}
        <br><span class="portal-chip">${escapeHtml(portalLabel(job.portal || ''))}</span> <span class="muted">${escapeHtml(job.location || '')}</span>
      </div>
      <div><strong>${escapeHtml(job.company || '')}</strong></div>
      <div>${badge(job.workModel || 'unknown')}</div>
      <div>${formatSalary(job)}</div>
      <div>${formatRelative(job.postedDate)}</div>
      <div>${escapeHtml(job.status || 'discovered')}</div>
      <div class="row-actions">
        <button class="secondary-button" data-details-job="${job.id}">Details</button>
        ${job.url ? `<a class="secondary-button action-link" href="${escapeHtml(job.url)}" target="_blank" rel="noopener">Open</a>` : ''}
        <button class="secondary-button" data-score-ai-job="${job.id}">AI Score</button>
      </div>
    </div>
  `).join('');

  target.innerHTML = `
    <div class="row header">
      <button data-sort-key="cvMatchScore">CV Match</button>
      <button data-sort-key="fitScore">AI Fit</button>
      <button data-sort-key="title">Title</button>
      <button data-sort-key="company">Company</button>
      <button data-sort-key="workModel">Work</button>
      <button data-sort-key="salaryMin">Salary</button>
      <button data-sort-key="postedDate">Posted</button>
      <button data-sort-key="status">Status</button>
      <div>Actions</div>
    </div>
    ${rows || '<div class="item"><h3>No jobs yet</h3><p>Add a job manually or import scanned jobs into the database.</p></div>'}
  `;

  target.querySelectorAll('[data-score-ai-job]').forEach(button => {
    button.addEventListener('click', () => scoreWithAi(button.dataset.scoreAiJob, button));
  });
  target.querySelectorAll('[data-details-job]').forEach(button => {
    button.addEventListener('click', () => showJobDetails(button.dataset.detailsJob));
  });
  target.querySelectorAll('[data-sort-key]').forEach(button => {
    button.addEventListener('click', () => sortJobs(button.dataset.sortKey));
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

function renderCv() {
  document.getElementById('cvEditor').value = state.cvMarkdown || '';
  renderCvPreview();
}

async function showJobDetails(jobId) {
  const job = await api(`/api/jobs/${jobId}/detail`).catch(() => state.jobs.find(item => item.id === jobId));
  if (!job) return;
  document.getElementById('jobDetailsTitle').textContent = job.title || 'Job details';
  document.getElementById('jobDetailsMeta').textContent = [job.company, portalLabel(job.portal), job.location, job.workModel].filter(Boolean).join(' - ');
  document.getElementById('jobDetailsBody').innerHTML = `
    <section class="details-grid">
      <article>
        <h3>CV Match</h3>
        <div class="score-large ${scoreClass(job.cvMatchScore)}">${job.cvMatchScore || 0}%</div>
        ${renderBreakdown(job.cvMatchBreakdown)}
      </article>
      <article>
        <h3>Actions</h3>
        ${job.url ? `<a class="primary-button action-link" href="${escapeHtml(job.url)}" target="_blank" rel="noopener">Open original posting</a>` : '<p class="muted">No job URL captured.</p>'}
        <button class="secondary-button detail-ai-button" data-score-ai-job="${job.id}">Score with AI</button>
      </article>
    </section>
    <section class="details-grid">
      <article>
        <h3>Matched skills</h3>
        ${renderTags(job.cvMatchedSkills, 'tag-good')}
      </article>
      <article>
        <h3>Missing skills</h3>
        ${renderTags(job.cvMissingSkills, 'tag-bad')}
      </article>
      <article>
        <h3>Matched projects</h3>
        ${renderTags(job.cvMatchedProjects, 'tag-project')}
      </article>
      <article>
        <h3>AI reasons</h3>
        ${renderList(job.fitReasons)}
      </article>
    </section>
    <section>
      <details open><summary>Description</summary><div class="markdown-preview">${markdown(job.description || 'No description captured yet.')}</div></details>
      <details><summary>Requirements</summary><div class="markdown-preview">${markdown(job.requirementsText || 'No requirements section captured yet.')}</div></details>
      <details><summary>Responsibilities</summary><div class="markdown-preview">${markdown(job.responsibilitiesText || 'No responsibilities section captured yet.')}</div></details>
    </section>
  `;
  document.querySelectorAll('.detail-ai-button').forEach(button => {
    button.addEventListener('click', () => scoreWithAi(button.dataset.scoreAiJob, button));
  });
  document.getElementById('jobDetailsDialog').showModal();
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

async function scoreWithAi(jobId, button) {
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = 'Scoring...';
  try {
    await api(`/api/jobs/${jobId}/fit/generate`, { method: 'POST', body: {} });
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

async function saveCv() {
  await api('/api/cv', {
    method: 'PUT',
    body: { markdown: document.getElementById('cvEditor').value },
  });
  await loadAll();
}

async function rescoreCv() {
  const button = document.getElementById('rescoreCvButton');
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Re-scoring...';
  try {
    const result = await api('/api/cv/rescore-all', { method: 'POST', body: {} });
    await loadAll();
    button.textContent = `Re-scored ${result.updated || 0}`;
    setTimeout(() => { button.textContent = previous; }, 1600);
  } catch (error) {
    alert(error.message);
    button.textContent = previous;
  } finally {
    button.disabled = false;
  }
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

async function loadRunnerProgress() {
  try {
    state.runnerProgress = await api('/api/runner/progress');
  } catch {
    state.runnerProgress = {};
  }
  renderPortalProgress();
}

function connectRunnerEvents() {
  if (!window.EventSource) return;
  const events = new EventSource('/api/runner/events');
  events.addEventListener('progress', event => {
    state.runnerProgress = JSON.parse(event.data || '{}');
    renderPortalProgress();
  });
  events.onerror = () => events.close();
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
  await loadRunnerProgress();
}

async function runnerAction(action, portal = '') {
  await api(`/api/runner/${action}`, {
    method: 'POST',
    body: portal ? { portal } : {},
  });
  await loadRunnerProgress();
}

function renderPortalProgress() {
  const perPortal = state.runnerProgress.perPortal || {};
  const target = document.getElementById('portalProgressCards');
  if (!target) return;
  target.innerHTML = ['ejobs', 'bestjobs', 'hipo', 'linkedin'].map(portal => {
    const item = perPortal[portal] || {};
    return `
      <article class="portal-progress-card">
        <div class="item-head">
          <h3>${escapeHtml(portalLabel(portal))}</h3>
          ${badge(item.status || 'idle')}
        </div>
        <div class="progress-counts">
          <span><strong>${item.discovered || 0}</strong> discovered</span>
          <span><strong>${item.matched || 0}</strong> matched</span>
          <span><strong>${item.imported || 0}</strong> imported</span>
          <span><strong>${item.errors || 0}</strong> errors</span>
        </div>
        <p class="muted truncate">${escapeHtml(item.lastUrl || '')}</p>
        ${item.lastError ? `<p class="error-text truncate">${escapeHtml(item.lastError)}</p>` : ''}
        <div class="button-row">
          <button class="secondary-button" data-portal-action="pause" data-portal="${portal}">Pause</button>
          <button class="secondary-button" data-portal-action="resume" data-portal="${portal}">Resume</button>
          <button class="secondary-button danger" data-portal-action="stop" data-portal="${portal}">Stop</button>
        </div>
      </article>
    `;
  }).join('');
  target.querySelectorAll('[data-portal-action]').forEach(button => {
    button.addEventListener('click', () => runnerAction(button.dataset.portalAction, button.dataset.portal));
  });
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

function renderList(items = []) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (values.length === 0) return '<p class="muted">No score reasons recorded yet.</p>';
  return `<ul class="detail-list">${values.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderTags(items = [], extraClass = '') {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (values.length === 0) return '<p class="muted">None recorded.</p>';
  return `<div class="tag-list">${values.map(item => `<span class="tag ${extraClass}">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function renderBreakdown(breakdown = {}) {
  const items = [
    ['Skills', breakdown.skills || 0],
    ['Projects', breakdown.projects || 0],
    ['Role', breakdown.role || 0],
  ];
  return `<div class="breakdown">${items.map(([label, value]) => `
    <label>${label}<meter min="0" max="100" value="${Number(value) || 0}"></meter><span>${Number(value) || 0}%</span></label>
  `).join('')}</div>`;
}

function sortedJobs(jobs) {
  const { key, direction } = state.sort;
  const sign = direction === 'asc' ? 1 : -1;
  return [...jobs].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    if (typeof av === 'number' || typeof bv === 'number') return (Number(av || 0) - Number(bv || 0)) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

function sortJobs(key) {
  state.sort = {
    key,
    direction: state.sort.key === key && state.sort.direction === 'desc' ? 'asc' : 'desc',
  };
  renderJobs();
}

async function applyFilters() {
  updateLocationQuery();
  await loadAll();
}

function jobsQueryString() {
  const params = new URLSearchParams(window.location.search);
  const selected = new URLSearchParams();
  for (const key of ['workModel', 'portal', 'minSalary', 'maxSalary', 'currency', 'postedWithinDays', 'minMatch', 'q']) {
    const value = params.get(key);
    if (value) selected.set(key, value);
  }
  const text = selected.toString();
  return text ? `?${text}` : '';
}

function updateLocationQuery() {
  const params = new URLSearchParams(window.location.search);
  setParam(params, 'workModel', selectedValues('filterWorkModel').join(','));
  setParam(params, 'portal', selectedValues('filterPortal').join(','));
  setParam(params, 'minSalary', value('filterMinSalary'));
  setParam(params, 'maxSalary', value('filterMaxSalary'));
  setParam(params, 'currency', value('filterCurrency'));
  setParam(params, 'postedWithinDays', value('filterPostedWithin'));
  setParam(params, 'minMatch', value('filterMinMatch') === '0' ? '' : value('filterMinMatch'));
  setParam(params, 'q', value('filterSearch'));
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function hydrateFiltersFromLocation() {
  const params = new URLSearchParams(window.location.search);
  setSelectedValues('filterWorkModel', (params.get('workModel') || '').split(',').filter(Boolean));
  setSelectedValues('filterPortal', (params.get('portal') || '').split(',').filter(Boolean));
  setValue('filterMinSalary', params.get('minSalary') || '');
  setValue('filterMaxSalary', params.get('maxSalary') || '');
  setValue('filterCurrency', params.get('currency') || '');
  setValue('filterPostedWithin', params.get('postedWithinDays') || '');
  setValue('filterMinMatch', params.get('minMatch') || '0');
  setValue('filterSearch', params.get('q') || '');
}

function selectedValues(id) {
  return [...document.getElementById(id).selectedOptions].map(option => option.value);
}

function setSelectedValues(id, values) {
  const wanted = new Set(values);
  [...document.getElementById(id).options].forEach(option => {
    option.selected = wanted.has(option.value);
  });
}

function setParam(params, key, value) {
  if (value) params.set(key, value);
  else params.delete(key);
}

function formatSalary(job) {
  if (!job.salaryMin && !job.salaryMax) return '<span class="muted">-</span>';
  const min = job.salaryMin || job.salaryMax;
  const max = job.salaryMax || job.salaryMin;
  const range = min === max ? String(min) : `${min}-${max}`;
  return `${escapeHtml(range)} ${escapeHtml(job.salaryCurrency || '')}${job.salaryPeriod ? ` / ${escapeHtml(job.salaryPeriod)}` : ''}`;
}

function formatRelative(value) {
  if (!value) return '<span class="muted">-</span>';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  const days = Math.round((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  return formatter.format(days, 'day');
}

function badge(value) {
  const clean = String(value || 'unknown');
  return `<span class="badge badge-${escapeHtml(clean)}">${escapeHtml(clean)}</span>`;
}

function portalLabel(portal) {
  return { ejobs: 'eJobs', bestjobs: 'BestJobs', hipo: 'HiPo', linkedin: 'LinkedIn' }[portal] || portal || '';
}

function renderCvPreview() {
  document.getElementById('cvPreview').innerHTML = markdown(state.cvMarkdown || 'No CV loaded yet.');
}

function markdown(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[huol])/gm, '<p>')
    .replace(/\n/g, '<br>');
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

// --- AI accounts -------------------------------------------------------------

async function controlFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['content-type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${localRunnerUrl}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: { message: 'Local runner is offline. Launch career-ops.cmd.' } };
  }
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { ok: response.ok, status: response.status, data };
}

async function loadAccounts() {
  const target = document.getElementById('accountsList');
  target.innerHTML = '<p class="muted">Loading accounts...</p>';
  const { ok, data } = await controlFetch('/accounts');
  if (!ok) {
    target.innerHTML = `<p class="error-text">${escapeHtml(data.message || 'Could not load accounts.')}</p>`;
    return;
  }
  state.accounts = data.accounts || [];
  renderAccounts();
}

function renderAccounts() {
  const target = document.getElementById('accountsList');
  const accounts = state.accounts || [];
  if (accounts.length === 0) {
    target.innerHTML = '<p class="muted">No accounts linked yet. Add one above.</p>';
    return;
  }
  target.innerHTML = accounts.map(account => `
    <article class="item account-row">
      <div>
        <strong>${escapeHtml(account.email || account.name)}</strong>
        <span class="tag ${account.rawProvider === 'claude' ? 'tag-anthropic' : 'tag-openai'}">${escapeHtml(account.provider)}</span>
        <span class="badge ${account.disabled ? 'badge-off' : 'badge-on'}">${account.disabled ? 'disabled' : 'active'}</span>
        ${account.failed > 0 ? `<span class="badge badge-warn">${account.failed} recent failures</span>` : ''}
      </div>
      <button class="secondary-button" data-account-toggle="${escapeHtml(account.name)}" data-disabled="${account.disabled}">
        ${account.disabled ? 'Enable' : 'Disable'}
      </button>
    </article>
  `).join('');
  target.querySelectorAll('[data-account-toggle]').forEach(button => {
    button.addEventListener('click', () => toggleAccount(
      button.dataset.accountToggle,
      button.dataset.disabled !== 'true',
    ));
  });
}

async function toggleAccount(name, disabled) {
  const { ok, data } = await controlFetch('/accounts/status', {
    method: 'PATCH',
    body: { name, disabled },
  });
  if (!ok) {
    alert(data.message || 'Could not update the account.');
    return;
  }
  await loadAccounts();
}

async function startAccountLogin(provider) {
  const statusEl = document.getElementById('accountLoginStatus');
  statusEl.className = 'login-status active';
  statusEl.textContent = `Requesting ${provider} login...`;

  const { ok, data } = await controlFetch('/accounts/login', { method: 'POST', body: { provider } });
  if (!ok || !data.url) {
    statusEl.className = 'login-status error';
    statusEl.textContent = data.message || 'Could not start the login flow.';
    return;
  }

  window.open(data.url, '_blank', 'noopener');
  statusEl.innerHTML = `A login window opened for <strong>${escapeHtml(provider)}</strong>. `
    + `Finish signing in there. <a href="${escapeHtml(data.url)}" target="_blank" rel="noopener">Reopen login</a>`;

  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2500));
    const poll = await controlFetch(`/accounts/login-status?state=${encodeURIComponent(data.state)}`);
    const status = poll.data?.status;
    if (status === 'ok') {
      statusEl.className = 'login-status success';
      statusEl.textContent = `${provider} account linked.`;
      await loadAccounts();
      return;
    }
    if (status === 'error') {
      statusEl.className = 'login-status error';
      statusEl.textContent = `Login failed: ${poll.data.error || 'unknown error'}`;
      return;
    }
  }
  statusEl.className = 'login-status error';
  statusEl.textContent = 'Login timed out. Try again.';
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
