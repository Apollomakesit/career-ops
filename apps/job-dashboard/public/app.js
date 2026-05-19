const state = {
  profile: {},
  portals: [],
  jobs: [],
  packages: [],
  events: [],
};

let token = localStorage.getItem('careerOpsDashboardToken') || '';

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

await loadAll();

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
      <button class="secondary-button" data-package-job="${job.id}">Draft</button>
    </div>
  `).join('');

  target.innerHTML = `
    <div class="row header">
      <div>Fit</div><div>Company</div><div>Role</div><div>Recommendation</div><div>Status</div><div>Action</div>
    </div>
    ${rows || '<div class="item"><h3>No jobs yet</h3><p>Add a job manually or import scanned jobs into the database.</p></div>'}
  `;

  target.querySelectorAll('[data-package-job]').forEach(button => {
    button.addEventListener('click', () => createPackage(button.dataset.packageJob));
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
  document.getElementById('portalsList').innerHTML = state.portals.map(portal => `
    <div class="item">
      <h3>${escapeHtml(portal.portal)}</h3>
      <p><strong>Email:</strong> ${escapeHtml(portal.usernameEmail || '')}</p>
      <p><strong>Profile:</strong> ${escapeHtml(portal.profileUrl || '')}</p>
      <p>${escapeHtml(portal.notes || '')}</p>
    </div>
  `).join('') || '<div class="item"><h3>No portals configured</h3><p>Add eJobs, BestJobs, Hipo, and LinkedIn portal hints from the profile setup.</p></div>';
}

function renderPackages() {
  document.getElementById('packagesList').innerHTML = state.packages.map(pkg => `
    <div class="item">
      <h3>${escapeHtml(pkg.company || 'Application package')} - ${escapeHtml(pkg.title || '')}</h3>
      <p><strong>Approval:</strong> ${escapeHtml(pkg.approvalState)} · <strong>Runner:</strong> ${escapeHtml(pkg.runnerStatus)}</p>
      <p><strong>Cover letter:</strong></p>
      <p>${escapeHtml((pkg.coverLetter || '').slice(0, 360))}</p>
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

async function createPackage(jobId) {
  const job = state.jobs.find(item => item.id === jobId);
  await api(`/api/jobs/${jobId}/package`, {
    method: 'POST',
    body: {
      coverLetter: `Draft cover letter for ${job?.company || 'the company'} based on Ioan's support, MDM, automation, and developer background.`,
      tailoredCvMd: '# Tailored CV\n\nUse cv.md and article-digest.md proof points for this role.',
      requiredFields: {},
      missingFields: {},
    },
  });
  await loadAll();
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
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function setValue(id, current) {
  document.getElementById(id).value = Array.isArray(current) ? current.join('\n') : (current || '');
}

function lines(id) {
  return value(id).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
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
