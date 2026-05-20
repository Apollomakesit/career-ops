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
    keywords: ['Technical Support', 'Python/FastAPI Developer'],
    portals: ['ejobs', 'bestjobs', 'hipo', 'linkedin'],
    perPortalLimit: 2,
  });

  assert.equal(plan.length, 8);
  assert.ok(plan.some(item => item.portal === 'ejobs' && item.url === 'https://www.ejobs.ro/locuri-de-munca/technical-support'));
  assert.ok(plan.some(item => item.portal === 'bestjobs' && item.url === 'https://www.bestjobs.eu/ro/locuri-de-munca/technical%2Bsupport'));
  assert.ok(plan.some(item => item.portal === 'hipo' && item.url === 'https://www.hipo.ro/locuri-de-munca/cautajob/Toate-Domeniile/Toate-Orasele/Technical-Support'));
  assert.ok(plan.some(item => item.portal === 'linkedin' && item.url.includes('keywords=Technical%20Support')));
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
          keywords: ['Application Support', 'MDM'],
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
  assert.ok(plan.some(item => item.keyword === 'MDM'));
  assert.ok(plan.some(item => item.keyword === 'Fallback'));
});

test('derives discovery keywords from target roles and profile skills', () => {
  const keywords = keywordsFromProfile({
    targetRoles: ['Application Support Engineer'],
    skills: ['Workspace ONE', 'ServiceNow', 'FastAPI'],
  });

  assert.ok(keywords.includes('Application Support Engineer'));
  assert.ok(keywords.includes('Workspace ONE'));
  assert.ok(keywords.includes('ServiceNow'));
});
