import { jobFilterQueryString, sanitizeSearchQuery } from './filter-query.js';
import {
  DEFAULT_JOB_PAGE_SIZE,
  buildRunnerPayload,
  filterEvents,
  jobsToCsv,
  nextBulkSelection,
  nextTheme,
  paginateItems,
  parseJobImport,
  validatePortalConfig,
} from './dashboard-helpers.js';

const state = {
  profile: {},
  portals: [],
  jobs: [],
  packages: [],
  events: [],
  jobStats: { total: 0, incomplete: 0, byPortal: [] },
  runnerStatus: {},
  runnerConfig: {},
  runnerCommands: [],
  aiModels: [],
  aiGateway: {},
  accounts: [],
  cvMarkdown: '',
  runnerProgress: {},
  sort: { key: 'cvMatchScore', direction: 'desc' },
  jobPage: 1,
  jobPageSize: DEFAULT_JOB_PAGE_SIZE,
  jobTotal: 0,
  jobOffset: 0,
  selectedJobIds: new Set(),
  activityFilters: {},
  theme: localStorage.getItem('careerOpsTheme') || 'light',
};

let token = localStorage.getItem('careerOpsDashboardToken') || '';
const localRunnerUrl = localStorage.getItem('careerOpsLocalRunnerUrl') || 'http://127.0.0.1:48731';
let toastId = 0;

applyTheme();

document.querySelectorAll('.nav-button').forEach(button => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.view);
    if (!target) {
      showToast(`View "${button.dataset.view}" is not available.`, 'error');
      return;
    }
    document.querySelectorAll('.nav-button').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.view').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    target.classList.add('active');
  });
});

document.getElementById('refreshButton').addEventListener('click', event => withButtonLoading(event.currentTarget, 'Refreshing...', loadAll));
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
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
  button.addEventListener('click', () => startRunner(button.dataset.startRunner, {
    portal: button.dataset.portal || '',
    mode: button.dataset.runnerMode || '',
  }, button));
});
document.querySelectorAll('[data-runner-action]').forEach(button => {
  button.addEventListener('click', () => runnerAction(button.dataset.runnerAction, '', button));
});
['status-filter', 'filterWorkModel', 'filterPortal', 'filterMinSalary', 'filterMaxSalary', 'filterCurrency', 'filterPostedWithin', 'filterMinMatch', 'filterSearch'].forEach(id => {
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
document.getElementById('clearFiltersButton')?.addEventListener('click', clearFilters);
document.getElementById('selectVisibleJobsButton').addEventListener('click', selectVisibleJobs);
document.getElementById('clearJobSelectionButton').addEventListener('click', clearJobSelection);
document.getElementById('bulkAiScoreButton').addEventListener('click', bulkAiScore);
document.getElementById('bulkAppliedButton').addEventListener('click', () => bulkUpdateStatus('applied'));
document.getElementById('bulkRejectedButton').addEventListener('click', () => bulkUpdateStatus('rejected'));
document.getElementById('bulkDiscardedButton').addEventListener('click', () => bulkUpdateStatus('discarded'));
document.getElementById('bulkDeleteButton').addEventListener('click', bulkDeleteJobs);
document.getElementById('exportJobsButton').addEventListener('click', exportJobs);
document.getElementById('importJobsButton').addEventListener('click', () => document.getElementById('importJobsInput').click());
document.getElementById('importJobsInput').addEventListener('change', importJobs);
['activitySearch', 'activityType', 'activityPortal', 'activityFrom', 'activityTo'].forEach(id => {
  const element = document.getElementById(id);
  element.addEventListener('input', applyActivityFilters);
  element.addEventListener('change', applyActivityFilters);
});
document.getElementById('clearActivityFiltersButton').addEventListener('click', clearActivityFilters);

hydrateFiltersFromLocation();
await init();
await loadRunnerStatus({ alertOnError: false });
await loadRunnerProgress();
connectRunnerEvents();
setInterval(() => loadRunnerStatus({ alertOnError: false }), 5000);
setInterval(() => loadRunnerProgress(), 2000);

async function init() {
  showSkeletons();
  try {
    await loadAll();
  } finally {
    hideSkeletons();
  }
}

async function loadAll() {
  const [profile, portals, jobsResponse, jobStats, packagesList, events, cv] = await Promise.all([
    api('/api/profile'),
    api('/api/portals'),
    api(`/api/jobs${jobsQueryString()}`),
    api('/api/jobs/stats').catch(() => ({ total: 0, incomplete: 0, byPortal: [] })),
    api('/api/packages'),
    api('/api/events'),
    api('/api/cv').catch(() => ({ markdown: 'CV view is waiting for the dashboard API to reload. The canonical file is cv.md in the project root.' })),
  ]);
  const jobsPage = normalizeJobsResponse(jobsResponse);
  Object.assign(state, {
    profile,
    portals,
    jobs: jobsPage.jobs,
    jobTotal: jobsPage.total,
    jobOffset: jobsPage.offset,
    jobPageSize: jobsPage.limit || state.jobPageSize,
    jobStats,
    packages: packagesList,
    events,
    cvMarkdown: cv.markdown || '',
  });
  renderJobs();
  renderProfile();
  renderPortals();
  renderPackages();
  renderEvents();
  renderCv();
  renderJobStats();
}

function showSkeletons() {
  setSkeletonHtml('jobsTable', `
    <div class="row header" data-skeleton>
      <div>Pick</div>
      <div>CV Match</div>
      <div>AI Fit</div>
      <div>Title</div>
      <div>Company</div>
      <div>Work</div>
      <div>Salary</div>
      <div>Posted</div>
      <div>Status</div>
      <div>Actions</div>
    </div>
    ${Array.from({ length: 5 }, () => `
      <div class="row job-row skeleton-row" data-skeleton>
        <span class="skeleton-line skeleton-dot"></span>
        <span class="skeleton-line skeleton-short"></span>
        <span class="skeleton-line skeleton-short"></span>
        <span class="skeleton-line skeleton-title"></span>
        <span class="skeleton-line"></span>
        <span class="skeleton-line skeleton-chip"></span>
        <span class="skeleton-line skeleton-medium"></span>
        <span class="skeleton-line skeleton-short"></span>
        <span class="skeleton-line skeleton-chip"></span>
        <span class="skeleton-line skeleton-actions"></span>
      </div>
    `).join('')}
  `);
  setSkeletonHtml('jobsPagination', '<span class="skeleton-line skeleton-pagination" data-skeleton></span>');
  setSkeletonHtml('packagesList', skeletonCards(2, ['skeleton-title', 'skeleton-medium', 'skeleton-wide']));
  setSkeletonHtml('eventsList', skeletonCards(3, ['skeleton-medium', 'skeleton-wide', 'skeleton-short']));
  setSkeletonHtml('portalsList', skeletonCards(4, ['skeleton-title', 'skeleton-wide', 'skeleton-medium']));
  setSkeletonHtml('jobStatsSummary', Array.from({ length: 4 }, () => '<span class="skeleton-line skeleton-stat" data-skeleton></span>').join(''));
  setSkeletonHtml('portalProgressCards', skeletonCards(4, ['skeleton-title', 'skeleton-wide']));
  setSkeletonHtml('cvPreview', `
    <div data-skeleton>
      <span class="skeleton-line skeleton-title"></span>
      <span class="skeleton-line skeleton-wide"></span>
      <span class="skeleton-line skeleton-wide"></span>
      <span class="skeleton-line skeleton-medium"></span>
    </div>
  `);
}

function hideSkeletons() {
  document.querySelectorAll('[data-skeleton]').forEach(element => element.remove());
  ['jobsTable', 'jobsPagination', 'packagesList', 'eventsList', 'portalsList', 'jobStatsSummary', 'portalProgressCards', 'cvPreview'].forEach(id => {
    document.getElementById(id)?.removeAttribute('aria-busy');
  });
}

function setSkeletonHtml(id, html) {
  const target = document.getElementById(id);
  if (!target) return;
  target.setAttribute('aria-busy', 'true');
  target.innerHTML = html;
}

function skeletonCards(count, lines) {
  return Array.from({ length: count }, () => `
    <div class="item skeleton-card" data-skeleton>
      ${lines.map(className => `<span class="skeleton-line ${className}"></span>`).join('')}
    </div>
  `).join('');
}

function normalizeJobsResponse(jobsResponse) {
  if (Array.isArray(jobsResponse)) {
    return {
      jobs: jobsResponse,
      limit: state.jobPageSize,
      offset: 0,
      total: jobsResponse.length,
    };
  }
  const jobs = Array.isArray(jobsResponse?.jobs) ? jobsResponse.jobs : [];
  return {
    jobs,
    limit: Number(jobsResponse?.limit) || state.jobPageSize,
    offset: Number(jobsResponse?.offset) || 0,
    total: Number(jobsResponse?.total ?? jobs.length),
  };
}

function currentJobsPage() {
  const pageSize = Math.max(1, Number(state.jobPageSize) || DEFAULT_JOB_PAGE_SIZE);
  const total = Math.max(0, Number(state.jobTotal) || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(state.jobPage) || 1), totalPages);
  const offset = (page - 1) * pageSize;
  const items = sortedJobs(state.jobs);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    start: total === 0 ? 0 : offset + 1,
    end: Math.min(offset + items.length, total),
  };
}

function renderJobs() {
  const target = document.getElementById('jobsTable');
  const page = currentJobsPage();
  state.jobPage = page.page;
  const visibleIds = page.items.map(job => String(job.id));
  const rows = page.items.map(job => {
    const jobId = String(job.id);
    return `
    <div class="row job-row">
      <label class="check-cell"><input type="checkbox" data-select-job="${escapeHtml(jobId)}" ${state.selectedJobIds.has(jobId) ? 'checked' : ''}><span>Select</span></label>
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
  `;
  }).join('');

  target.innerHTML = `
    <div class="row header">
      <button type="button" data-select-visible>Pick</button>
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

  target.querySelector('[data-select-visible]')?.addEventListener('click', selectVisibleJobs);
  target.querySelectorAll('[data-select-job]').forEach(input => {
    input.addEventListener('change', () => {
      state.selectedJobIds = nextBulkSelection(state.selectedJobIds, [input.dataset.selectJob], 'toggle');
      renderBulkToolbar(visibleIds);
    });
  });
  target.querySelectorAll('[data-score-ai-job]').forEach(button => {
    button.addEventListener('click', () => scoreWithAi(button.dataset.scoreAiJob, button));
  });
  target.querySelectorAll('[data-details-job]').forEach(button => {
    button.addEventListener('click', () => showJobDetails(button.dataset.detailsJob));
  });
  target.querySelectorAll('[data-sort-key]').forEach(button => {
    button.addEventListener('click', () => sortJobs(button.dataset.sortKey));
  });
  renderBulkToolbar(visibleIds);
  renderJobsPagination(page);
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
      <div class="field-errors" data-portal-errors></div>
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

function packageForJob(jobId) {
  return state.packages.find(pkg => String(pkg.jobId) === String(jobId)) || null;
}

function upsertPackageState(pkg) {
  if (!pkg) return;
  const index = state.packages.findIndex(existing => (
    (pkg.id && String(existing.id) === String(pkg.id))
    || (pkg.jobId && String(existing.jobId) === String(pkg.jobId))
  ));
  if (index >= 0) state.packages.splice(index, 1, pkg);
  else state.packages.unshift(pkg);
}

function findJobPackageSection(jobId) {
  return [...document.querySelectorAll('[data-job-package-section]')]
    .find(section => String(section.dataset.jobPackageSection) === String(jobId));
}

function renderEvents() {
  renderActivityTypeOptions();
  const events = filterEvents(state.events, state.activityFilters);
  document.getElementById('eventsList').innerHTML = events.map(event => `
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
  const cvBreakdown = job.cvMatchBreakdown || {};
  document.getElementById('jobDetailsTitle').textContent = job.title || 'Job details';
  document.getElementById('jobDetailsMeta').textContent = [job.company, portalLabel(job.portal), job.location, job.workModel].filter(Boolean).join(' - ');
  document.getElementById('jobDetailsBody').innerHTML = `
    <section class="details-grid">
      <article>
        <h3>CV Match</h3>
        <div class="score-large ${scoreClass(job.cvMatchScore)}">${job.cvMatchScore || 0}%</div>
        ${renderBreakdown(job.cvMatchBreakdown)}
        ${renderCvScoreNotes(cvBreakdown)}
      </article>
      <article>
        <h3>Actions</h3>
        ${job.url ? `<a class="primary-button action-link" href="${escapeHtml(job.url)}" target="_blank" rel="noopener">Open original posting</a>` : '<p class="muted">No job URL captured.</p>'}
        <button class="secondary-button detail-ai-button" data-score-ai-job="${job.id}">Score with AI</button>
      </article>
      ${renderJobPackageCard(job, packageForJob(job.id))}
    </section>
    <section class="details-grid">
      <article>
        <h3>Required skills detected</h3>
        ${renderRequiredSkillCoverage(job, cvBreakdown)}
      </article>
      <article>
        <h3>Matched skills</h3>
        ${renderTags(job.cvMatchedSkills, 'tag-good')}
        ${renderEvidenceList(cvBreakdown.matchedSkillDetails)}
      </article>
      <article>
        <h3>Missing skills</h3>
        ${renderTags(job.cvMissingSkills, 'tag-bad')}
        ${renderEvidenceList(cvBreakdown.missingSkillDetails)}
      </article>
      <article>
        <h3>Matched projects</h3>
        ${renderTags(job.cvMatchedProjects, 'tag-project')}
        ${renderEvidenceList(cvBreakdown.matchedProjectDetails)}
      </article>
      <article>
        <h3>Exceeds / extra strengths</h3>
        ${renderEvidenceBlock(cvBreakdown.exceedingSkills, cvBreakdown.exceedingSignals, 'tag-extra')}
      </article>
      <article>
        <h3>AI fit data</h3>
        ${renderAiFitData(job)}
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
  bindDetailPackageButtons();
  const dialog = document.getElementById('jobDetailsDialog');
  if (!dialog.open) dialog.showModal();
}

function renderJobPackageCard(job, pkg = packageForJob(job.id)) {
  const packageBody = pkg ? `
    <dl class="mini-kv">
      <div><dt>Approval</dt><dd>${escapeHtml(pkg.approvalState || 'draft')}</dd></div>
      <div><dt>Runner</dt><dd>${escapeHtml(pkg.runnerStatus || 'not_started')}</dd></div>
    </dl>
    <div class="evidence-block">
      <strong>Cover letter</strong>
      <p>${escapeHtml(pkg.coverLetter || 'No cover letter text returned yet.')}</p>
    </div>
    <div class="evidence-block">
      <strong>Tailored CV excerpt</strong>
      <div class="markdown-preview">${markdown(pkg.tailoredCvMd || 'No tailored CV excerpt returned yet.')}</div>
    </div>
    <div class="field-block">
      <strong>Required fields</strong>
      ${renderKeyValues(pkg.requiredFields)}
    </div>
    <div class="field-block">
      <strong>Missing fields</strong>
      ${renderKeyValues(pkg.missingFields)}
    </div>
  ` : '<p class="muted">No AI draft has been generated for this job yet.</p>';

  return `
    <article data-job-package-section="${escapeHtml(job.id)}">
      <h3>Application Package</h3>
      ${packageBody}
      <button class="secondary-button detail-package-button" data-generate-package-job="${job.id}">Generate AI Draft</button>
      <div class="field-errors" data-package-error></div>
    </article>
  `;
}

function bindDetailPackageButtons(root = document) {
  root.querySelectorAll('.detail-package-button').forEach(button => {
    button.addEventListener('click', () => generatePackage(button.dataset.generatePackageJob, button));
  });
}

function renderJobPackageSection(jobId, pkg = packageForJob(jobId)) {
  const section = findJobPackageSection(jobId);
  if (!section) return;
  const job = state.jobs.find(item => String(item.id) === String(jobId)) || { id: jobId };
  section.outerHTML = renderJobPackageCard(job, pkg);
  bindDetailPackageButtons();
}

async function createJob(event) {
  event.preventDefault();
  const button = document.getElementById('createJobButton');
  await withButtonLoading(button, 'Creating...', async () => {
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
    showToast('Job added.', 'success');
  });
}

async function generatePackage(jobId, button) {
  const previousText = button?.textContent;
  const errorTarget = button?.closest('[data-job-package-section]')?.querySelector('[data-package-error]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Generating...';
  }
  if (errorTarget) errorTarget.textContent = '';
  try {
    const pkg = await withRetry(() => api(`/api/jobs/${jobId}/package/generate`, { method: 'POST', body: {} }));
    upsertPackageState(pkg);
    renderPackages();
    renderJobPackageSection(jobId, pkg);
    showToast('Draft generated.', 'success');
  } catch (error) {
    const message = error.message || 'Could not generate an AI draft.';
    if (errorTarget) errorTarget.innerHTML = `<p class="error-text">${escapeHtml(message)}</p>`;
    showToast(message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

async function scoreWithAi(jobId, button) {
  const ok = await confirmAction({
    title: 'AI Score Job',
    message: 'This will send 1 job to OpenAI for scoring. Continue?',
    okText: 'Score',
  });
  if (!ok) return;
  await withButtonLoading(button, 'Scoring...', async () => {
    await withRetry(() => api(`/api/jobs/${jobId}/fit/generate`, { method: 'POST', body: {} }));
    await loadAll();
    const dialog = document.getElementById('jobDetailsDialog');
    if (dialog?.open) await showJobDetails(jobId);
    showToast('AI score updated.', 'success');
  });
}

async function saveProfile() {
  await withButtonLoading(document.getElementById('saveProfileButton'), 'Saving...', async () => {
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
    showToast('Profile saved.', 'success');
  });
}

async function saveCv() {
  await withButtonLoading(document.getElementById('saveCvButton'), 'Saving...', async () => {
    await api('/api/cv', {
      method: 'PUT',
      body: { markdown: document.getElementById('cvEditor').value },
    });
    await loadAll();
    showToast('CV saved.', 'success');
  });
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
    showToast(`Re-scored ${result.updated || 0} job(s).`, 'success');
    setTimeout(() => { button.textContent = previous; }, 1600);
  } catch (error) {
    showToast(error.message, 'error');
    button.textContent = previous;
  } finally {
    button.disabled = false;
  }
}

async function savePortal(portal, button) {
  const card = button.closest('[data-portal-card]');
  const validation = validatePortalConfig({
    profileUrl: card.querySelector('[data-portal-profile]').value,
    usernameEmail: card.querySelector('[data-portal-email]').value,
    fieldHintsText: card.querySelector('[data-portal-hints]').value,
  });
  renderPortalErrors(card, validation.errors);
  if (!validation.valid) {
    showToast('Fix portal settings before saving.', 'error');
    return;
  }
  const hints = validation.fieldHints;
  hints.discovery = {
    enabled: card.querySelector('[data-portal-enabled]').checked,
    keywords: textLines(card.querySelector('[data-portal-keywords]').value),
  };

  await withButtonLoading(button, 'Saving...', async () => {
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
    showToast(`${portalLabel(portal)} saved.`, 'success');
  });
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
      if (alertOnError) showToast('Local runner is not reachable yet. Start it with npm run runner:control --prefix apps/job-dashboard', 'error');
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
  await withButtonLoading(document.getElementById('saveRunnerConfigButton'), 'Saving...', async () => {
    try {
      await localRunner('/config', { method: 'PUT', body: config });
    } catch {
      await api('/api/runner/config', { method: 'PUT', body: config });
    }
    await loadRunnerStatus({ alertOnError: true });
    showToast('Local runner config saved.', 'success');
  });
}

async function testSelectedAiModel() {
  const selected = selectedAiModel();
  if (!selected) return;
  renderAiModelResults([{ ok: false, provider: '', model: '', detail: 'No model selected.' }]);
  await withButtonLoading(document.getElementById('testSelectedAiModelButton'), 'Testing...', async () => {
    try {
      const result = await localRunner('/ai/test', {
        method: 'POST',
        body: {
          provider: selected.provider,
          model: selected.gatewayModel,
        },
      });
      renderAiModelResults([result]);
      showToast(result.ok ? 'AI model connection works.' : 'AI model test failed.', result.ok ? 'success' : 'error');
    } catch {
      await api('/api/runner/commands', {
        method: 'POST',
        body: { runner: 'test-ai', payload: { provider: selected.provider, model: selected.gatewayModel } },
      });
      renderAiModelResults([{ ok: true, provider: selected.provider, model: selected.gatewayModel, detail: 'Queued on local runner.' }]);
      showToast('AI model test queued on the local runner.', 'success');
      setTimeout(() => loadRunnerStatus({ alertOnError: false }), 4000);
    }
  });
}

async function testCheapAiModels() {
  renderAiModelResults([{ ok: false, provider: '', model: '', detail: 'Testing...' }]);
  await withButtonLoading(document.getElementById('testCheapAiModelsButton'), 'Testing...', async () => {
    try {
      const result = await localRunner('/ai/test-cheap', { method: 'POST', body: {} });
      renderAiModelResults(result.results || []);
      showToast('Cheap model test finished.', 'success');
    } catch {
      await api('/api/runner/commands', { method: 'POST', body: { runner: 'test-cheap-ai' } });
      renderAiModelResults([{ ok: true, provider: 'AI', model: 'cheap set', detail: 'Queued on local runner.' }]);
      showToast('Cheap model test queued on the local runner.', 'success');
      setTimeout(() => loadRunnerStatus({ alertOnError: false }), 4000);
    }
  });
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

async function startRunner(runner, options = {}, button = null) {
  const payload = buildRunnerPayload(runner, options);
  const label = payload.mode === 'missing'
    ? 'Re-scan queued'
    : `${runner} runner started`;
  await withButtonLoading(button, 'Starting...', async () => {
    try {
      await localRunner('/start', { method: 'POST', body: payload });
    } catch {
      await api('/api/runner/commands', { method: 'POST', body: { runner, payload: options } });
    }
    await loadRunnerStatus({ alertOnError: true });
    await loadRunnerProgress();
    await loadAll();
    showToast(label, 'success');
  });
}

async function runnerAction(action, portal = '', button = null) {
  if (action === 'stop') {
    const ok = await confirmAction({
      title: portal ? `Stop ${portalLabel(portal)}` : 'Stop all runners',
      message: portal ? `Stop the active ${portalLabel(portal)} runner?` : 'Stop every active runner?',
      okText: 'Stop',
      danger: true,
    });
    if (!ok) return;
  }
  await withButtonLoading(button, 'Working...', async () => {
    await api(`/api/runner/${action}`, {
      method: 'POST',
      body: portal ? { portal } : {},
    });
    await loadRunnerProgress();
    showToast(`${action} sent.`, 'success');
  });
}

function renderPortalProgress() {
  const perPortal = state.runnerProgress.perPortal || {};
  const target = document.getElementById('portalProgressCards');
  if (!target) return;
  const statsByPortal = statsMap();
  target.innerHTML = ['ejobs', 'bestjobs', 'hipo', 'linkedin'].map(portal => {
    const item = perPortal[portal] || {};
    const stats = statsByPortal.get(portal) || { total: 0, incomplete: 0 };
    return `
      <article class="portal-progress-card">
        <div class="item-head">
          <h3>${escapeHtml(portalLabel(portal))}</h3>
          ${badge(item.status || 'idle')}
        </div>
        <div class="portal-totals">
          <span><strong>${stats.total || 0}</strong> total jobs</span>
          <span><strong>${stats.incomplete || 0}</strong> incomplete</span>
        </div>
        ${Number(item.queued || 0) > 0 ? `
          <div class="portal-totals">
            <span><strong>${item.processed || 0}/${item.queued || 0}</strong> re-scan processed</span>
          </div>
        ` : ''}
        <div class="progress-counts">
          <span><strong>${item.discovered || 0}</strong> discovered</span>
          <span><strong>${item.matched || 0}</strong> matched</span>
          <span><strong>${item.imported || 0}</strong> imported</span>
          <span><strong>${item.errors || 0}</strong> errors</span>
        </div>
        <p class="muted truncate">${escapeHtml(item.lastUrl || '')}</p>
        ${item.lastError ? `<p class="error-text truncate">${escapeHtml(item.lastError)}</p>` : ''}
        <div class="button-row">
          <button class="secondary-button" data-portal-start="${portal}">Start</button>
          <button class="secondary-button" data-portal-rescan="${portal}">Rescan incomplete</button>
          <button class="secondary-button" data-portal-action="pause" data-portal="${portal}">Pause</button>
          <button class="secondary-button" data-portal-action="resume" data-portal="${portal}">Resume</button>
          <button class="secondary-button danger" data-portal-action="stop" data-portal="${portal}">Stop</button>
        </div>
      </article>
    `;
  }).join('');
  target.querySelectorAll('[data-portal-action]').forEach(button => {
    button.addEventListener('click', () => runnerAction(button.dataset.portalAction, button.dataset.portal, button));
  });
  target.querySelectorAll('[data-portal-start]').forEach(button => {
    button.addEventListener('click', () => startRunner('discover', { portal: button.dataset.portalStart }, button));
  });
  target.querySelectorAll('[data-portal-rescan]').forEach(button => {
    button.addEventListener('click', () => startRunner('discover', { portal: button.dataset.portalRescan, mode: 'missing' }, button));
  });
}

function renderJobStats() {
  const target = document.getElementById('jobStatsSummary');
  if (!target) return;
  const stats = state.jobStats || {};
  target.innerHTML = `
    <span><strong>${stats.total || 0}</strong> total jobs detected</span>
    <span><strong>${stats.incomplete || 0}</strong> need data re-scan</span>
  `;
}

function renderBulkToolbar(visibleIds = []) {
  const selectedCount = state.selectedJobIds.size;
  document.getElementById('bulkCount').textContent = `${selectedCount} selected`;
  const hasSelection = selectedCount > 0;
  ['bulkAiScoreButton', 'bulkAppliedButton', 'bulkRejectedButton', 'bulkDiscardedButton', 'bulkDeleteButton', 'clearJobSelectionButton'].forEach(id => {
    document.getElementById(id).disabled = !hasSelection;
  });
  document.getElementById('selectVisibleJobsButton').disabled = visibleIds.length === 0;
}

function renderJobsPagination(page) {
  const target = document.getElementById('jobsPagination');
  if (!target) return;
  target.innerHTML = `
    <span>${page.start}-${page.end} of ${page.total}</span>
    <button class="secondary-button" data-page-prev ${page.page <= 1 ? 'disabled' : ''}>Previous</button>
    <strong>Page ${page.page} / ${page.totalPages}</strong>
    <button class="secondary-button" data-page-next ${page.page >= page.totalPages ? 'disabled' : ''}>Next</button>
  `;
  target.querySelector('[data-page-prev]')?.addEventListener('click', () => setJobPage(page.page - 1));
  target.querySelector('[data-page-next]')?.addEventListener('click', () => setJobPage(page.page + 1));
}

function setJobPage(page) {
  state.jobPage = Math.max(1, Number(page) || 1);
  updatePageParam();
  loadAll();
}

function selectVisibleJobs() {
  const page = currentJobsPage();
  state.selectedJobIds = nextBulkSelection(state.selectedJobIds, page.items.map(job => job.id), 'select-visible');
  renderJobs();
}

function clearJobSelection() {
  state.selectedJobIds = nextBulkSelection(state.selectedJobIds, [], 'clear-all');
  renderJobs();
}

async function bulkAiScore() {
  const ids = selectedJobIds();
  if (ids.length === 0) return;
  const ok = await confirmAction({
    title: 'AI Score Jobs',
    message: `This will send ${ids.length} job(s) to OpenAI for scoring. Continue?`,
    okText: 'Score',
  });
  if (!ok) return;
  const button = document.getElementById('bulkAiScoreButton');
  await withButtonLoading(button, 'Scoring...', async () => {
    for (const id of ids) {
      await withRetry(() => api(`/api/jobs/${id}/fit/generate`, { method: 'POST', body: {} }));
    }
    await loadAll();
    showToast(`AI scored ${ids.length} selected job(s).`, 'success');
  });
}

async function bulkUpdateStatus(status) {
  const ids = selectedJobIds();
  if (ids.length === 0) return;
  const ok = await confirmAction({
    title: `Mark ${status}`,
    message: `Update ${ids.length} selected job(s) to ${status}?`,
    okText: 'Update',
    danger: ['rejected', 'discarded'].includes(status),
  });
  if (!ok) return;
  await withButtonLoading(document.getElementById(`bulk${capitalizeStatus(status)}Button`), 'Updating...', async () => {
    await api('/api/jobs/bulk', {
      method: 'PATCH',
      body: { ids, status },
    });
    state.selectedJobIds = new Set();
    await loadAll();
    showToast(`Updated ${ids.length} job(s).`, 'success');
  });
}

async function bulkDeleteJobs() {
  const ids = selectedJobIds();
  if (ids.length === 0) return;
  const ok = await confirmAction({
    title: 'Delete jobs',
    message: `Delete ${ids.length} selected job(s)?`,
    okText: 'Delete',
    danger: true,
  });
  if (!ok) return;
  await withButtonLoading(document.getElementById('bulkDeleteButton'), 'Deleting...', async () => {
    await api('/api/jobs/bulk', {
      method: 'DELETE',
      body: { ids },
    });
    state.selectedJobIds = new Set();
    await loadAll();
    showToast(`Deleted ${ids.length} job(s).`, 'success');
  });
}

function selectedJobIds() {
  return [...state.selectedJobIds].filter(Boolean);
}

function capitalizeStatus(status) {
  return {
    applied: 'Applied',
    rejected: 'Rejected',
    discarded: 'Discarded',
  }[status] || '';
}

function exportJobs() {
  const ids = new Set(selectedJobIds());
  const jobs = ids.size > 0 ? state.jobs.filter(job => ids.has(String(job.id))) : state.jobs;
  downloadText(`career-ops-jobs-${new Date().toISOString().slice(0, 10)}.csv`, jobsToCsv(jobs), 'text/csv');
  showToast(`Exported ${jobs.length} job(s).`, 'success');
}

async function importJobs(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const text = await file.text();
  let jobs;
  try {
    jobs = parseJobImport(text);
  } catch (error) {
    showToast(error.message, 'error');
    return;
  }
  if (jobs.length === 0) {
    showToast('No jobs found in import file.', 'error');
    return;
  }
  const ok = await confirmAction({
    title: 'Import jobs',
    message: `Import ${jobs.length} job(s)? Existing URLs will be updated.`,
    okText: 'Import',
  });
  if (!ok) return;
  for (const job of jobs) {
    await api('/api/jobs', { method: 'POST', body: job });
  }
  await loadAll();
  showToast(`Imported ${jobs.length} job(s).`, 'success');
}

function applyActivityFilters() {
  state.activityFilters = {
    q: value('activitySearch'),
    type: value('activityType'),
    portal: value('activityPortal'),
    from: value('activityFrom'),
    to: value('activityTo'),
  };
  renderEvents();
}

function clearActivityFilters() {
  ['activitySearch', 'activityType', 'activityPortal', 'activityFrom', 'activityTo'].forEach(id => setValue(id, ''));
  applyActivityFilters();
}

function renderActivityTypeOptions() {
  const select = document.getElementById('activityType');
  const current = select.value;
  const types = [...new Set(state.events.map(event => event.eventType).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Any</option>' + types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
  select.value = current;
}

function renderPortalErrors(card, errors = {}) {
  const target = card.querySelector('[data-portal-errors]');
  if (!target) return;
  target.innerHTML = Object.values(errors).map(error => `<p class="error-text">${escapeHtml(error)}</p>`).join('');
}

function statsMap() {
  return new Map((state.jobStats.byPortal || []).map(item => [item.portal, item]));
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

async function withButtonLoading(button, loadingText, fn) {
  const previousText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = loadingText;
  }
  try {
    return await fn();
  } catch (error) {
    showToast(error.message || 'Operation failed.', 'error');
    return undefined;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

async function withRetry(fn, { retries = 2, delayMs = 600 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === retries) break;
      await delay(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

function isTransientError(error) {
  return /429|rate|timeout|temporar|network|fetch|502|503|504/i.test(error?.message || '');
}

function showToast(message, type = 'info') {
  const target = document.getElementById('toastRegion');
  if (!target) return;
  const id = `toast-${++toastId}`;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.id = id;
  toast.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" aria-label="Dismiss">x</button>`;
  toast.querySelector('button').addEventListener('click', () => toast.remove());
  target.appendChild(toast);
  setTimeout(() => document.getElementById(id)?.remove(), 5000);
}

function confirmAction({ title = 'Confirm', message = '', okText = 'Continue', danger = false } = {}) {
  const dialog = document.getElementById('confirmDialog');
  if (!dialog?.showModal) return Promise.resolve(window.confirm(message || title));
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const okButton = document.getElementById('confirmOkButton');
  okButton.textContent = okText;
  okButton.classList.toggle('danger-button', danger);
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}

function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toggleTheme() {
  state.theme = nextTheme(state.theme);
  localStorage.setItem('careerOpsTheme', state.theme);
  applyTheme();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const button = document.getElementById('themeToggle');
  if (button) button.textContent = state.theme === 'dark' ? 'Light' : 'Dark';
}

function modelForProvider(provider) {
  const normalized = provider === 'claude' ? 'anthropic' : provider === 'codex' ? 'openai' : provider;
  const model = state.aiModels.find(item => item.provider === normalized && item.available)
    || fallbackAiModels({ aiProvider: normalized })[0];
  return model ? {
    provider: normalized,
    gatewayModel: model.gatewayModel || model.id,
  } : null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderKeyValues(value) {
  const entries = Object.entries(value || {});
  if (entries.length === 0) return '<p class="muted">None</p>';
  return `<dl class="kv-list">${entries.map(([key, item]) => `
    <div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(item)}</dd></div>
  `).join('')}</dl>`;
}

function renderList(items = []) {
  const values = stringItems(items);
  if (values.length === 0) return '<p class="muted">No score reasons recorded yet.</p>';
  return `<ul class="detail-list">${values.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderEvidenceList(items = []) {
  const values = stringItems(items);
  return values.length > 0 ? renderList(values) : '';
}

function renderTags(items = [], extraClass = '') {
  const values = stringItems(items);
  if (values.length === 0) return '<p class="muted">None recorded.</p>';
  return `<div class="tag-list">${values.map(item => `<span class="tag ${extraClass}">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function renderEvidenceBlock(tags = [], notes = [], extraClass = '') {
  const tagValues = stringItems(tags);
  const noteValues = stringItems(notes);
  if (tagValues.length === 0 && noteValues.length === 0) return '<p class="muted">None recorded.</p>';
  return `
    ${tagValues.length > 0 ? `<div class="tag-list">${tagValues.map(item => `<span class="tag ${extraClass}">${escapeHtml(item)}</span>`).join('')}</div>` : ''}
    ${noteValues.length > 0 ? renderList(noteValues) : ''}
  `;
}

function renderRequiredSkillCoverage(job, breakdown = {}) {
  const required = stringItems(breakdown.requiredSkills);
  if (required.length === 0) return '<p class="muted">No required skills detected from the posting.</p>';
  const matched = new Set(stringItems(job.cvMatchedSkills).map(normalizeDisplay));
  const missing = new Set(stringItems(job.cvMissingSkills).map(normalizeDisplay));
  return `<div class="tag-list">${required.map(skill => {
    const key = normalizeDisplay(skill);
    const className = matched.has(key) ? 'tag-good' : missing.has(key) ? 'tag-bad' : '';
    return `<span class="tag ${className}">${escapeHtml(skill)}</span>`;
  }).join('')}</div>`;
}

function renderAiFitData(job) {
  return `
    <dl class="mini-kv">
      <div><dt>Score</dt><dd>${job.fitScore ? `${escapeHtml(job.fitScore)}%` : 'Not scored yet'}</dd></div>
      <div><dt>Recommendation</dt><dd>${escapeHtml(job.recommendation || 'review')}</dd></div>
    </dl>
    <div class="evidence-block">
      <strong>Matched by AI</strong>
      ${renderTags(job.matchedSkills, 'tag-good')}
    </div>
    <div class="evidence-block">
      <strong>Missing by AI</strong>
      ${renderTags(job.missingSkills, 'tag-bad')}
    </div>
    <div class="evidence-block">
      <strong>Risk flags</strong>
      ${renderTags(job.riskFlags, 'tag-bad')}
    </div>
    <div class="evidence-block">
      <strong>Score notes</strong>
      ${renderList(job.fitReasons)}
    </div>
  `;
}

function renderBreakdown(breakdown = {}) {
  const items = [
    ['Skills', breakdown.skills || 0],
    ['Projects', breakdown.projects || 0],
    ['Role', breakdown.role || 0],
    ['Data', breakdown.dataQuality || 0],
  ];
  return `<div class="breakdown">${items.map(([label, value]) => `
    <label>${label}<meter min="0" max="100" value="${Number(value) || 0}"></meter><span>${Number(value) || 0}%</span></label>
  `).join('')}</div>`;
}

function renderCvScoreNotes(breakdown = {}) {
  const notes = [
    breakdown.confidence ? `Confidence: ${breakdown.confidence}` : '',
    breakdown.rescanRecommended ? 'Re-scan recommended for stronger evidence.' : '',
    breakdown.scoreFormula ? `Score formula: ${breakdown.scoreFormula}` : '',
    ...stringItems(breakdown.penalties),
  ].filter(Boolean);
  return notes.length > 0 ? `<div class="score-notes">${renderList(notes)}</div>` : '';
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
  state.jobPage = 1;
  updateLocationQuery();
  await loadAll();
}

function jobsQueryString() {
  const selected = new URLSearchParams(jobFilterQueryString(window.location.search).replace(/^\?/, ''));
  selected.set('limit', String(state.jobPageSize));
  selected.set('offset', String((state.jobPage - 1) * state.jobPageSize));
  const text = selected.toString();
  return text ? `?${text}` : '';
}

function updateLocationQuery() {
  const params = new URLSearchParams(window.location.search);
  setParam(params, 'status', value('status-filter'));
  setParam(params, 'workModel', selectedValues('filterWorkModel').join(','));
  setParam(params, 'portal', selectedValues('filterPortal').join(','));
  setParam(params, 'minSalary', value('filterMinSalary'));
  setParam(params, 'maxSalary', value('filterMaxSalary'));
  setParam(params, 'currency', value('filterCurrency'));
  setParam(params, 'postedWithinDays', value('filterPostedWithin'));
  setParam(params, 'minMatch', value('filterMinMatch') === '0' ? '' : value('filterMinMatch'));
  const rawSearch = value('filterSearch');
  const cleanSearch = sanitizeSearchQuery(rawSearch);
  if (cleanSearch !== rawSearch) setValue('filterSearch', cleanSearch);
  setParam(params, 'q', cleanSearch);
  setParam(params, 'page', state.jobPage > 1 ? String(state.jobPage) : '');
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function updatePageParam() {
  const params = new URLSearchParams(window.location.search);
  setParam(params, 'page', state.jobPage > 1 ? String(state.jobPage) : '');
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function hydrateFiltersFromLocation() {
  const params = new URLSearchParams(window.location.search);
  setValue('status-filter', params.get('status') || '');
  setSelectedValues('filterWorkModel', (params.get('workModel') || '').split(',').filter(Boolean));
  setSelectedValues('filterPortal', (params.get('portal') || '').split(',').filter(Boolean));
  setValue('filterMinSalary', params.get('minSalary') || '');
  setValue('filterMaxSalary', params.get('maxSalary') || '');
  setValue('filterCurrency', params.get('currency') || '');
  setValue('filterPostedWithin', params.get('postedWithinDays') || '');
  setValue('filterMinMatch', params.get('minMatch') || '0');
  // Browsers can autofill search boxes with account emails or the current URL.
  // Those values hide every job, so keep only real title/description searches.
  const rawQ = params.get('q') || '';
  const cleanQ = sanitizeSearchQuery(rawQ);
  setValue('filterSearch', cleanQ);
  state.jobPage = Math.max(1, Number(params.get('page')) || 1);
  if (cleanQ !== rawQ) updateLocationQuery();
}

function clearFilters() {
  setValue('status-filter', '');
  setSelectedValues('filterWorkModel', []);
  setSelectedValues('filterPortal', []);
  setValue('filterMinSalary', '');
  setValue('filterMaxSalary', '');
  setValue('filterCurrency', '');
  setValue('filterPostedWithin', '');
  setValue('filterMinMatch', '0');
  setValue('filterSearch', '');
  state.jobPage = 1;
  applyFilters();
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
        ${account.lastError ? `<small class="error-text">${escapeHtml(account.lastError)}</small>` : ''}
      </div>
      <div class="button-row">
        <button class="secondary-button" data-account-test="${escapeHtml(account.rawProvider)}">Test</button>
        <button class="secondary-button" data-account-toggle="${escapeHtml(account.name)}" data-disabled="${account.disabled}">
          ${account.disabled ? 'Enable' : 'Disable'}
        </button>
      </div>
    </article>
  `).join('');
  target.querySelectorAll('[data-account-test]').forEach(button => {
    button.addEventListener('click', () => testAccountConnection(button.dataset.accountTest, button));
  });
  target.querySelectorAll('[data-account-toggle]').forEach(button => {
    button.addEventListener('click', () => toggleAccount(
      button.dataset.accountToggle,
      button.dataset.disabled !== 'true',
    ));
  });
}

async function toggleAccount(name, disabled) {
  if (disabled) {
    const ok = await confirmAction({
      title: 'Disable account',
      message: 'Disable this AI account for local model routing?',
      okText: 'Disable',
      danger: true,
    });
    if (!ok) return;
  }
  const { ok, data } = await controlFetch('/accounts/status', {
    method: 'PATCH',
    body: { name, disabled },
  });
  if (!ok) {
    showToast(data.message || 'Could not update the account.', 'error');
    return;
  }
  await loadAccounts();
  showToast(disabled ? 'Account disabled.' : 'Account enabled.', 'success');
}

async function testAccountConnection(provider, button) {
  const model = modelForProvider(provider);
  if (!model) {
    showToast('No model is available for this account provider.', 'error');
    return;
  }
  await withButtonLoading(button, 'Testing...', async () => {
    const result = await localRunner('/ai/test', {
      method: 'POST',
      body: { provider: model.provider, model: model.gatewayModel },
    });
    renderAiModelResults([result]);
    showToast(result.ok ? `${model.provider} connection works.` : `${model.provider} connection failed.`, result.ok ? 'success' : 'error');
  });
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
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.message || data.error || `Local runner ${response.status}`);
  return data;
}

function scoreClass(score) {
  if (score >= 80) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

function stringItems(items = []) {
  return Array.isArray(items) ? items.filter(Boolean).map(item => String(item)) : [];
}

function normalizeDisplay(value) {
  return String(value || '').trim().toLowerCase();
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
