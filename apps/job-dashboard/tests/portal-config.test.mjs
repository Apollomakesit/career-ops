import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPortalSearchPlan,
  defaultPortalRows,
  keywordsFromProfile,
  keywordSlug,
  normalizePortalRows,
  supportedPortals,
} from '../runner/portal-config.mjs';

test('builds Romanian portal search URLs from target keywords', () => {
  const plan = buildPortalSearchPlan({
    keywords: ['Full Stack Developer', 'Python/FastAPI Developer'],
    portals: ['ejobs', 'bestjobs', 'hipo', 'linkedin'],
    perPortalLimit: 2,
  });

  assert.equal(plan.length, 8);
  assert.ok(plan.some(item => item.portal === 'ejobs' && item.url === 'https://www.ejobs.ro/locuri-de-munca/full-stack-developer?judet=Ilfov&oras=Bucuresti&tip_job=remote,hibrid,la-birou'));
  assert.ok(plan.some(item => item.portal === 'bestjobs' && item.url === 'https://www.bestjobs.eu/ro/locuri-de-munca/full%2Bstack%2Bdeveloper?location=bucuresti&work_type=remote,hybrid,on-site'));
  assert.ok(plan.some(item => item.portal === 'hipo' && item.url === 'https://www.hipo.ro/locuri-de-munca/cautajob/Toate-Domeniile/Bucuresti/Full-Stack-Developer?type_munca=remote,hibrid,la-sediu'));
  assert.ok(plan.some(item => item.portal === 'linkedin' && item.url.includes('location=Bucharest%2C%20Romania')));
  assert.ok(plan.every(item => item.portal !== 'linkedin' || !item.url.includes('geoId=')));
  assert.ok(plan.some(item => item.portal === 'linkedin' && item.url.includes('f_WT=2%2C3%2C1')));
});

test('normalizes keyword slugs per portal style', () => {
  assert.equal(keywordSlug('Python/FastAPI Developer', 'ejobs'), 'python-fastapi-developer');
  assert.equal(keywordSlug('Technical Support', 'bestjobs'), 'technical%2Bsupport');
  assert.equal(keywordSlug('AI Automation Engineer', 'hipo'), 'AI-Automation-Engineer');
});

test('documents supported portals', () => {
  assert.deepEqual(supportedPortals, ['ejobs', 'bestjobs', 'hipo', 'linkedin']);
});

test('provides default editable Romanian portal rows', () => {
  assert.deepEqual(defaultPortalRows.map(portal => portal.portal), supportedPortals);
  assert.ok(defaultPortalRows.every(portal => portal.fieldHints.discovery.enabled === true));
});

test('builds searches from dashboard portal rows, merges fallback keywords, and skips disabled portals', () => {
  const portals = normalizePortalRows([
    {
      portal: 'ejobs',
      fieldHints: {
        discovery: {
          enabled: true,
          keywords: ['Backend Engineer', 'Python Developer'],
        },
      },
    },
    {
      portal: 'linkedin',
      fieldHints: {
        discovery: {
          enabled: false,
          keywords: ['Python'],
        },
      },
    },
  ]);

  const plan = buildPortalSearchPlan({ portals, keywords: ['Fallback'], perPortalLimit: 4 });
  assert.equal(plan.length, 3);
  assert.ok(plan.every(item => item.portal === 'ejobs'));
  assert.ok(plan.some(item => item.keyword === 'Backend Engineer'));
  assert.ok(plan.some(item => item.keyword === 'Fallback'));
});

test('derives discovery keywords from target roles and profile skills without support-role leakage', () => {
  const keywords = keywordsFromProfile({
    targetRoles: ['Backend Engineer'],
    skills: ['Python', 'FastAPI'],
  });

  assert.ok(keywords.includes('Backend Engineer'));
  assert.ok(keywords.includes('Programator Backend'));
  assert.ok(keywords.includes('Inginer Software'));
  assert.ok(keywords.includes('Python'));
  assert.ok(!keywords.includes('Technical Support'));
  assert.ok(!keywords.includes('Workspace ONE'));
});

test('defaults to ten keywords per portal so Romanian aliases fit', () => {
  const previous = process.env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL;
  delete process.env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL;
  const plan = buildPortalSearchPlan({
    keywords: Array.from({ length: 12 }, (_, index) => `Keyword ${index + 1}`),
    portals: ['ejobs'],
  });
  process.env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL = previous;

  assert.equal(plan.length, 10);
});
