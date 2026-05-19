#!/usr/bin/env node
import 'dotenv/config';

import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { createRunnerClient } from './api-client.mjs';
import { describeBrowserProfile, launchBrowserContext } from './browser-profile.mjs';
import { envFromLocalConfig, loadLocalConfig } from './local-config.mjs';
import { buildPortalSearchPlan, defaultPortalRows, keywordsFromProfile, normalizePortalRows, supportedPortals } from './portal-config.mjs';
import { dedupeJobs, extractJobsFromPage } from './portal-extractor.mjs';

const localEnv = envFromLocalConfig(loadLocalConfig());
const env = { ...localEnv, ...process.env };
const dashboardUrl = env.DASHBOARD_URL || 'http://localhost:3000';
const token = env.DASHBOARD_TOKEN || '';
const maxJobs = Number(env.PORTAL_DISCOVERY_MAX_JOBS || 80);
const perPortalLimit = Number(env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL || 6);
const requestedPortals = (env.PORTAL_DISCOVERY_PORTALS || supportedPortals.join(','))
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(Boolean);

const client = createRunnerClient({ baseUrl: dashboardUrl, token });
const [profile, dashboardPortals] = await Promise.all([
  client.fetchProfile(),
  client.fetchPortals().catch(() => []),
]);
const portalRows = normalizePortalRows(dashboardPortals.length > 0 ? dashboardPortals : defaultPortalRows)
  .filter(item => requestedPortals.includes(item.portal));
const plan = buildPortalSearchPlan({
  keywords: keywordsFromProfile(profile),
  portals: portalRows,
  perPortalLimit,
});

if (plan.length === 0) {
  console.log('No portal searches configured.');
  process.exit(0);
}

const rl = createInterface({ input, output });
const context = await launchBrowserContext(env);
const page = context.pages()[0] || await context.newPage();
const imported = [];
const failed = [];

try {
  console.log(`Using browser: ${describeBrowserProfile(env)}`);
  console.log(`Scanning ${plan.length} portal search page(s). You can log in, solve 2FA, or accept cookies in the visible browser when prompted.`);

  for (const item of plan) {
    if (imported.length >= maxJobs) break;
    console.log(`\nOpening ${item.portal}: ${item.keyword}`);
    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      let jobs = dedupeJobs(await extractJobsFromPage(page, item));

      // Only treat the page as needing a manual step when extraction found
      // nothing - a normal results page has a "log in" link too. Never block on
      // stdin when there is no interactive terminal (e.g. started from the
      // dashboard); the runner would hang forever waiting for Enter.
      if (jobs.length === 0 && await needsHumanIntervention(page)) {
        if (input.isTTY) {
          await rl.question(`Manual step needed on ${item.portal}. Log in / solve CAPTCHA in the browser, then press Enter here to continue.`);
          jobs = dedupeJobs(await extractJobsFromPage(page, item));
        } else {
          console.log(`  ! ${item.portal} appears to need a manual login. Log into it in the open browser window, then run discovery again.`);
        }
      }
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
