import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDiscoveryBudgets,
  buildLocalMatchContext,
  markPartialDescription,
  needsDetailRescan,
  shouldImportJob,
} from '../runner/discovery-filter.mjs';

test('allocates a 1000-job discovery budget evenly across four portals', () => {
  const budgets = buildDiscoveryBudgets({
    totalMax: 1000,
    portals: ['ejobs', 'bestjobs', 'hipo', 'linkedin'],
  });

  assert.equal(budgets.totalMax, 1000);
  assert.equal(budgets.perPortalMax, 250);
  assert.deepEqual(budgets.remainingByPortal, {
    ejobs: 250,
    bestjobs: 250,
    hipo: 250,
    linkedin: 250,
  });
});

test('allows remote and Bucharest jobs that match resume skills', () => {
  const context = buildLocalMatchContext({
    profile: {
      targetRoles: ['Application Support Engineer', 'MDM Administrator'],
      skills: ['ServiceNow', 'Workspace ONE', 'Ivanti', 'Python', 'FastAPI'],
    },
  });

  const remote = shouldImportJob({
    title: 'Application Support Engineer',
    location: 'Remote Romania',
    description: 'ServiceNow incident handling, Workspace ONE MDM, Ivanti, and Python automation.',
  }, context);
  const bucharest = shouldImportJob({
    title: 'MDM Administrator',
    location: 'Bucharest hybrid',
    description: 'Android and iOS fleet support with Workspace ONE and SOTI.',
  }, context);

  assert.equal(remote.import, true);
  assert.equal(bucharest.import, true);
});

test('rejects clearly onsite non-Bucharest jobs and unrelated jobs', () => {
  const context = buildLocalMatchContext({
    profile: {
      targetRoles: ['Application Support Engineer'],
      skills: ['ServiceNow', 'MDM', 'Python'],
    },
  });

  const outsideBucharest = shouldImportJob({
    title: 'Application Support Engineer',
    location: 'Cluj-Napoca onsite',
    description: 'ServiceNow and MDM support.',
  }, context);
  const unrelated = shouldImportJob({
    title: 'Door to Door Sales Representative',
    location: 'Remote',
    description: 'Cold sales and field prospecting.',
  }, context);

  assert.equal(outsideBucharest.import, false);
  assert.equal(outsideBucharest.reason, 'location');
  assert.equal(unrelated.import, false);
  assert.equal(unrelated.reason, 'relevance');
});

test('rejects language-heavy customer support without technical ownership', () => {
  const context = buildLocalMatchContext({
    profile: {
      targetRoles: ['Technical Support Specialist', 'Application Support Engineer'],
      skills: ['ServiceNow', 'MDM', 'Workspace ONE', 'Python'],
    },
  });

  const decision = shouldImportJob({
    title: 'Customer Support with Italian - Office Based',
    location: 'Bucharest',
    description: 'Respond to customer questions in Italian and update customer records.',
  }, context);

  assert.equal(decision.import, false);
  assert.equal(decision.reason, 'relevance');

  const noisyPage = shouldImportJob({
    title: 'Customer Support with Italian - Office Based',
    location: 'Bucharest',
    description: 'Respond to customer questions in Italian. Similar jobs: Technical Support Specialist.',
  }, context);

  assert.equal(noisyPage.import, false);
  assert.equal(noisyPage.reason, 'relevance');

  for (const title of [
    'Client Support Representative with French',
    'Customer Care Representative with German',
    'Customer Care Agent with German',
  ]) {
    const decision = shouldImportJob({
      title,
      location: 'Bucharest',
      description: 'Handle customer requests, update account records, and communicate in a foreign language.',
    }, context);
    assert.equal(decision.import, false, title);
    assert.equal(decision.reason, 'relevance');
  }

  const noisyCustomerCare = shouldImportJob({
    title: 'Customer Care Representative with German',
    location: 'Bucharest',
    description: 'Handle customer requests in German. Similar jobs: Technical Support Specialist and IT Helpdesk.',
  }, context);
  assert.equal(noisyCustomerCare.import, false);
});

test('rejects sales and HORECA developer false positives from broad portal searches', () => {
  const context = buildLocalMatchContext({
    profile: {
      targetRoles: ['Full Stack Developer', 'Python Developer'],
      skills: ['Python', 'TypeScript', 'React', 'PostgreSQL'],
    },
  });

  for (const job of [
    {
      title: 'Business Developer HORECA - Brasov',
      company: 'Coca-Cola HBC Romania',
      location: 'Bucharest hybrid',
      sourceQuery: 'Full Stack Developer',
      description: 'Develop the HORECA sales channel, visit clients, negotiate listings, and grow revenue.',
    },
    {
      title: 'Sales Developer',
      location: 'Remote Romania',
      sourceQuery: 'Backend Engineer',
      description: 'Cold outreach, lead qualification, customer acquisition, and pipeline growth.',
    },
    {
      title: 'Business Development Representative',
      location: 'Bucharest',
      sourceQuery: 'Python Developer',
      description: 'Prospecting, CRM updates, sales targets, and booking meetings for account executives.',
    },
  ]) {
    const decision = shouldImportJob(job, context);
    assert.equal(decision.import, false, job.title);
    assert.equal(decision.reason, 'relevance', job.title);
  }
});

test('does not let the search keyword alone make an unrelated job relevant', () => {
  const context = buildLocalMatchContext({
    profile: {
      targetRoles: ['Full Stack Developer'],
      skills: ['React', 'TypeScript'],
    },
  });

  const decision = shouldImportJob({
    title: 'Office Manager',
    location: 'Bucharest',
    sourceQuery: 'Full Stack Developer',
    description: 'Coordinate office suppliers, invoices, reception, and facilities.',
  }, context);

  assert.equal(decision.import, false);
  assert.equal(decision.reason, 'relevance');
});

test('keeps real software developer jobs from the same broad searches', () => {
  const context = buildLocalMatchContext({
    profile: {
      targetRoles: ['Full Stack Developer', 'Python Developer'],
      skills: ['Python', 'TypeScript', 'React', 'PostgreSQL'],
    },
  });

  const decision = shouldImportJob({
    title: 'Software Developer - Python',
    location: 'Bucharest hybrid',
    sourceQuery: 'Full Stack Developer',
    description: 'Build Python APIs with PostgreSQL and React dashboards.',
  }, context);

  assert.equal(decision.import, true);
});

test('marks partial descriptions when detail pages cannot be read', () => {
  const marked = markPartialDescription({
    description: 'Application Support Engineer\nExampleSoft\nRemote',
    source: 'portal-discovery:ejobs',
  });

  assert.match(marked.description, /^\[Partial listing capture - detail page unavailable\]/);
  assert.equal(marked.source, 'portal-discovery:ejobs:partial-detail');
});

test('identifies old or incomplete jobs that need detail re-scan', () => {
  assert.equal(needsDetailRescan({
    source: 'portal-discovery:ejobs:partial-detail',
    description: '[Partial listing capture - detail page unavailable]\nRole title only',
  }), true);
  assert.equal(needsDetailRescan({
    source: 'portal-discovery:ejobs',
    description: 'Short listing card',
  }), true);
  assert.equal(needsDetailRescan({
    url: 'https://example.com/complete',
    title: 'Application Support Engineer',
    company: 'ExampleSoft',
    source: 'portal-discovery:ejobs:detail',
    description: 'Detailed posting '.repeat(80),
    cvMatchBreakdown: { requiredSkills: ['python'] },
  }), false);
});
