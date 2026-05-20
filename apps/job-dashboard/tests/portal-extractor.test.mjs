import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

import { extractGenericDetail } from '../runner/extractors/shared.mjs';
import {
  cleanJobDetailText,
  dedupeJobs,
  mergeJobDetail,
  normalizeExtractedLinks,
} from '../runner/portal-extractor.mjs';

test('extracts likely eJobs postings from anchor snapshots', () => {
  const jobs = normalizeExtractedLinks({
    portal: 'ejobs',
    sourceUrl: 'https://www.ejobs.ro/locuri-de-munca/technical-support',
    links: [
      {
        href: 'https://www.ejobs.ro/user/locuri-de-munca/application-support-engineer/1234567',
        text: 'Application Support Engineer\nExampleSoft\nBucuresti\nAplica rapid',
      },
      {
        href: 'https://www.ejobs.ro/locuri-de-munca/technical-support?page=2',
        text: 'Pagina urmatoare',
      },
    ],
  });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].portal, 'ejobs');
  assert.equal(jobs[0].title, 'Application Support Engineer');
  assert.equal(jobs[0].company, 'ExampleSoft');
  assert.equal(jobs[0].location, 'Bucuresti');
});

test('extracts LinkedIn postings and removes duplicate URLs', () => {
  const jobs = dedupeJobs(normalizeExtractedLinks({
    portal: 'linkedin',
    sourceUrl: 'https://ro.linkedin.com/jobs/search?keywords=Python',
    links: [
      {
        href: 'https://www.linkedin.com/jobs/view/123?trk=public_jobs',
        text: 'Python Developer\nAcme\nRomania',
      },
      {
        href: 'https://www.linkedin.com/jobs/view/123?trk=homepage',
        text: 'Python Developer\nAcme\nRomania',
      },
    ],
  }));

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].url, 'https://www.linkedin.com/jobs/view/123');
  assert.equal(jobs[0].title, 'Python Developer');
});

test('filters navigation, login, empty links, and search-only URLs', () => {
  const jobs = normalizeExtractedLinks({
    portal: 'bestjobs',
    sourceUrl: 'https://www.bestjobs.eu/ro/locuri-de-munca/technical%2Bsupport',
    links: [
      { href: 'https://www.bestjobs.eu/ro/login', text: 'Login' },
      { href: '#', text: 'Aplica' },
      { href: 'https://www.bestjobs.eu/ro/locuri-de-munca/support-engineer', text: 'Search results' },
      { href: 'https://www.bestjobs.eu/ro/job/support-engineer/123', text: 'Support Engineer\nCompany\nRemote' },
    ],
  });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, 'Company');
});

test('extracts current BestJobs loc-de-munca posting URLs', () => {
  const jobs = normalizeExtractedLinks({
    portal: 'bestjobs',
    sourceUrl: 'https://www.bestjobs.eu/ro/locuri-de-munca/technical+support',
    links: [
      {
        href: 'https://www.bestjobs.eu/loc-de-munca/technical-support-specialist-it-facilities',
        text: 'Technical Support Specialist (IT & Facilities)',
      },
    ],
  });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Technical Support Specialist (IT & Facilities)');
});

test('filters HiPo registration links and extracts company from HiPo job URLs', () => {
  const jobs = normalizeExtractedLinks({
    portal: 'hipo',
    sourceUrl: 'https://www.hipo.ro/locuri-de-munca/cautajob/Toate-Domeniile/Toate-Orasele/Technical-Support',
    links: [
      {
        href: 'https://www.hipo.ro/locuri-de-munca/locuri_de_munca/103395/Top-Talents-Romania/Inscrie-te-la-Top-Talents-Romania-2018',
        text: 'Inscriere',
      },
      {
        href: 'https://www.hipo.ro/locuri-de-munca/locuri_de_munca/266271/CGS-Nexus-Romania/Technical-Support-with-German---Brasov-/-Bucuresti-Hybrid',
        text: 'Technical Support with German - Brasov / Bucuresti Hybrid',
      },
    ],
  });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, 'CGS Nexus Romania');
  assert.equal(jobs[0].title, 'Technical Support with German - Brasov / Bucuresti Hybrid');
});

test('cleans detail page text while keeping responsibilities and requirements', () => {
  const cleaned = cleanJobDetailText(`
    Accept cookies
    Careers
    Login
    Application Support Engineer
    About the role
    You will support enterprise customers and internal teams.
    Responsibilities
    Own ServiceNow incidents and troubleshoot MDM device issues.
    Requirements
    Experience with Workspace ONE, Android, iOS, and customer escalations.
    Similar jobs
    Set job alert
  `);

  assert.match(cleaned, /Responsibilities/);
  assert.match(cleaned, /Requirements/);
  assert.match(cleaned, /Workspace ONE/);
  assert.doesNotMatch(cleaned, /Accept cookies/);
  assert.doesNotMatch(cleaned, /Set job alert/);
});

test('merges full detail text over listing snippets', () => {
  const merged = mergeJobDetail(
    {
      title: 'Application Support Engineer',
      description: 'Application Support Engineer\nExampleSoft\nRemote',
      source: 'portal-discovery:ejobs',
    },
    `
    Application Support Engineer
    About the role
    Support customers across ServiceNow, MDM, Android, and iOS.
    Responsibilities
    Investigate incidents, document fixes, and coordinate escalations.
    Requirements
    Workspace ONE, Ivanti, Jira, and Python automation experience.
    Benefits
    Remote-first setup.
    `,
  );

  assert.match(merged.description, /Responsibilities/);
  assert.match(merged.description, /Requirements/);
  assert.match(merged.description, /Benefits/);
  assert.equal(merged.source, 'portal-discovery:ejobs:detail');
});

test('detail extractor expands Romanian show-more controls before reading text', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <main id="job">
        <h1>Programator Python</h1>
        <p>Construieste automatizari interne.</p>
        <button type="button" onclick="document.querySelector('#hidden').hidden = false; this.remove()">Vezi mai mult</button>
        <section id="hidden" hidden>
          <h2>Cerințe</h2>
          <p>Experienta cu Python, TypeScript si PostgreSQL.</p>
          <h2>Responsabilități</h2>
          <p>Dezvolti API-uri si fluxuri Playwright pentru echipa.</p>
        </section>
      </main>
    `);

    const detail = await extractGenericDetail(page, { descriptionSelector: '#job' });

    assert.match(detail.description, /Python, TypeScript si PostgreSQL/);
    assert.match(detail.requirements_text, /TypeScript/);
    assert.match(detail.responsibilities_text, /Playwright/);
  } finally {
    await browser.close();
  }
});

test('detail extractor trims body fallback to the actual job section', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        <nav>Skip to main content Jobs Messaging Notifications</nav>
        <h1>Frontend Developer</h1>
        <section>
          <h2>About the job</h2>
          <p>Build React interfaces for internal platforms.</p>
          <h3>Responsibilities</h3>
          <p>Own TypeScript components and Playwright flows.</p>
          <h3>Requirements</h3>
          <p>React, TypeScript, PostgreSQL.</p>
        </section>
        <aside>
          <h2>About the company</h2>
          <p>Company follower counts and unrelated feed posts.</p>
        </aside>
        <section>Similar jobs</section>
      </body>
    `);

    const detail = await extractGenericDetail(page);

    assert.match(detail.description, /Build React interfaces/);
    assert.match(detail.description, /Playwright flows/);
    assert.doesNotMatch(detail.description, /Skip to main content/);
    assert.doesNotMatch(detail.description, /Company follower counts/);
    assert.match(detail.requirements_text, /PostgreSQL/);
    assert.match(detail.responsibilities_text, /TypeScript components/);
  } finally {
    await browser.close();
  }
});
