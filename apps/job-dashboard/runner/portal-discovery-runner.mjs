#!/usr/bin/env node
import 'dotenv/config';

import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';

import { createRunnerClient } from './api-client.mjs';
import { buildPortalSearchPlan, keywordsFromProfile, supportedPortals } from './portal-config.mjs';
import { dedupeJobs, extractJobsFromPage } from './portal-extractor.mjs';

const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
const token = process.env.DASHBOARD_TOKEN || '';
const userDataDir = process.env.CAREER_OPS_BROWSER_PROFILE || '.career-ops-browser';
const maxJobs = Number(process.env.PORTAL_DISCOVERY_MAX_JOBS || 80);
const perPortalLimit = Number(process.env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL || 6);
const requestedPortals = (process.env.PORTAL_DISCOVERY_PORTALS || supportedPortals.join(','))
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(Boolean);

const client = createRunnerClient({ baseUrl: dashboardUrl, token });
const profile = await client.fetchProfile();
const plan = buildPortalSearchPlan({
  keywords: keywordsFromProfile(profile),
  portals: requestedPortals,
  perPortalLimit,
});

if (plan.length === 0) {
  console.log('No portal searches configured.');
  process.exit(0);
}

const rl = createInterface({ input, output });
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const imported = [];
const failed = [];

try {
  console.log(`Using persistent browser profile: ${userDataDir}`);
  console.log(`Scanning ${plan.length} portal search page(s). You can log in, solve 2FA, or accept cookies in the visible browser when prompted.`);

  for (const item of plan) {
    if (imported.length >= maxJobs) break;
    console.log(`\nOpening ${item.portal}: ${item.keyword}`);
    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      if (await needsHumanIntervention(page)) {
        await rl.question(`Manual step needed on ${item.portal}. Log in / solve CAPTCHA, then press Enter here to continue.`);
      }

      const jobs = dedupeJobs(await extractJobsFromPage(page, item));
      console.log(`Found ${jobs.length} candidate job(s).`);

      for (const job of jobs) {
        if (imported.length >= maxJobs) break;
        const created = await client.createJob({
          url: job.url,
          company: job.company,
          title: job.title,
          portal: job.portal,
          location: job.location,
          description: job.description,
          source: job.source,
        });
        imported.push(created);
        console.log(`  + ${created.fit?.score ?? created.fitScore ?? 0}% ${job.company || 'Unknown'} | ${job.title}`);
      }
    } catch (error) {
      failed.push({ ...item, error: error.message });
      console.log(`  ! ${item.portal} failed: ${error.message}`);
    }
  }
} finally {
  await rl.close();
  console.log('\nDiscovery complete. Browser profile is preserved for the next run.');
  console.log(`Imported/updated jobs: ${imported.length}`);
  if (failed.length > 0) {
    console.log(`Failed searches: ${failed.length}`);
    for (const item of failed) console.log(`  - ${item.portal} ${item.keyword}: ${item.error}`);
  }
  await context.close();
}

async function needsHumanIntervention(page) {
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  return /captcha|verify you are human|two-factor|2fa|sign in|log in|intra in cont|autentificare/i.test(text);
}
