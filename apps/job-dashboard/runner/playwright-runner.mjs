#!/usr/bin/env node
import 'dotenv/config';

import { chromium } from 'playwright';

import { createRunnerClient } from './api-client.mjs';

const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
const token = process.env.DASHBOARD_TOKEN || '';

const client = createRunnerClient({ baseUrl: dashboardUrl, token });
const packages = await client.fetchApprovedPackages();

if (packages.length === 0) {
  console.log('No approved packages waiting for the local runner.');
  process.exit(0);
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
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

    await fillKnownFields(page, pkg.requiredFields || {}, missingFields);

    await client.markRunnerStatus(pkg.id, {
      runnerStatus: Object.keys(missingFields).length > 0 ? 'needs_missing_fields' : 'ready_for_user_submit',
      missingFields,
    });

    console.log('Stopped before final submit. Review the browser window before applying.');
  }
} finally {
  console.log('Leaving browser open for user review. Close it manually when done.');
}

async function fillKnownFields(page, fields, missingFields) {
  for (const [label, value] of Object.entries(fields)) {
    if (!value) {
      missingFields[label] = 'Required value is empty.';
      continue;
    }

    const filled = await tryFillByLabel(page, label, value);
    if (!filled) missingFields[label] = 'Could not locate a matching field on the page.';
  }
}

async function tryFillByLabel(page, label, value) {
  const candidates = [
    page.getByLabel(label),
    page.getByPlaceholder(label),
    page.locator(`[name="${cssEscape(label)}"]`),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count() > 0) {
        await locator.first().fill(String(value), { timeout: 2000 });
        return true;
      }
    } catch {
      // Try the next locator strategy.
    }
  }

  return false;
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}
