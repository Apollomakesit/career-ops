#!/usr/bin/env node
import 'dotenv/config';

import { chromium } from 'playwright';

import { createRunnerClient } from './api-client.mjs';
import { buildRequiredFields, fillKnownFields } from './form-filler.mjs';
import { envFromLocalConfig, loadLocalConfig } from './local-config.mjs';

const localEnv = envFromLocalConfig(loadLocalConfig());
const env = { ...localEnv, ...process.env };
const dashboardUrl = env.DASHBOARD_URL || 'http://localhost:3000';
const token = env.DASHBOARD_TOKEN || '';
const userDataDir = env.CAREER_OPS_BROWSER_PROFILE || '.career-ops-browser';

const client = createRunnerClient({ baseUrl: dashboardUrl, token });
const packages = await client.fetchApprovedPackages();
const profile = await client.fetchProfile().catch(() => ({}));
const portals = await client.fetchPortals().catch(() => []);

if (packages.length === 0) {
  console.log('No approved packages waiting for the local runner.');
  process.exit(0);
}

const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
const page = await context.newPage();

try {
  for (const pkg of packages) {
    const missingFields = {};
    const url = pkg.jobUrl;

    if (!url || !/^https?:\/\//i.test(url)) {
      await client.markRunnerStatus(pkg.id, {
        runnerStatus: 'needs_manual_url',
        missingFields: { url: 'A public job URL is required for browser filling.' },
      });
      continue;
    }

    console.log(`Opening ${pkg.company || 'company'} - ${pkg.title || 'role'}`);
    await client.markRunnerStatus(pkg.id, { runnerStatus: 'opening_portal', missingFields: {} });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const fields = buildRequiredFields({
      packageFields: pkg.requiredFields || {},
      profile,
      coverLetter: pkg.coverLetter || '',
    });
    const portalConfig = portals.find(item => item.portal === pkg.portal) || {};
    await fillKnownFields(page, fields, missingFields, {
      fieldHints: portalConfig.fieldHints || {},
    });

    await client.markRunnerStatus(pkg.id, {
      runnerStatus: Object.keys(missingFields).length > 0 ? 'needs_missing_fields' : 'ready_for_user_submit',
      missingFields,
    });

    console.log('Stopped before final submit. Review the browser window before applying.');
  }
} finally {
  console.log('Leaving browser open for user review. Close it manually when done.');
}
