import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dedupeJobs,
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
