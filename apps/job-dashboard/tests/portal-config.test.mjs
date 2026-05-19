import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPortalSearchPlan,
  keywordSlug,
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
