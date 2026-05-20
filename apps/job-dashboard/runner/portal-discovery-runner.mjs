#!/usr/bin/env node
import 'dotenv/config';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { createRunnerClient } from './api-client.mjs';
import { describeBrowserProfile, launchBrowserContext } from './browser-profile.mjs';
import {
  buildDiscoveryBudgets,
  buildLocalMatchContext,
  markPartialDescription,
  shouldImportJob,
} from './discovery-filter.mjs';
import { envFromLocalConfig, loadLocalConfig } from './local-config.mjs';
import { detectPortalSession, portalLoginUrl } from './portal-auth.mjs';
import { buildPortalSearchPlan, defaultPortalRows, keywordsFromProfile, normalizePortalRows, supportedPortals } from './portal-config.mjs';
import {
  dedupeJobs,
  mergeJobDetail,
} from './portal-extractor.mjs';
import {
  allPortalBudgetsReached,
  canImportForPortal,
  createPortalCounters,
  recordPortalImport,
} from './portal-discovery-core.mjs';
import { runState } from './run-state.mjs';

const localEnv = envFromLocalConfig(loadLocalConfig());
const env = { ...localEnv, ...process.env };
const dashboardUrl = env.DASHBOARD_URL || 'http://localhost:3000';
const token = env.DASHBOARD_TOKEN || '';
const maxJobs = Number(env.PORTAL_DISCOVERY_MAX_JOBS || 1000);
const perPortalLimit = Number(env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL || 25);
const requestedPortals = (env.PORTAL_DISCOVERY_PORTALS || supportedPortals.join(','))
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(Boolean);
const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(runnerDir, '..', '..', '..');

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
const budgets = buildDiscoveryBudgets({
  totalMax: maxJobs,
  portals: portalRows.map(item => item.portal),
  perPortalMax: env.PORTAL_DISCOVERY_PER_PORTAL_MAX_JOBS,
});
const portalCounts = createPortalCounters(portalRows.map(item => item.portal));
const portalStats = createPortalStats(portalRows.map(item => item.portal));
const matchContext = buildLocalMatchContext({
  profile,
  textSources: [
    readOptionalFile(path.join(repoRoot, 'cv.md')),
    readOptionalFile(path.join(repoRoot, 'config', 'profile.yml')),
  ],
});

if (plan.length === 0) {
  console.log('No portal searches configured.');
  process.exit(0);
}

const rl = createInterface({ input, output });
const context = await launchBrowserContext(env, { stealth: portalRows.some(row => row.portal === 'hipo') });
const page = context.pages()[0] || await context.newPage();
const imported = [];
const failed = [];

try {
  console.log(`Using browser: ${describeBrowserProfile(env)}`);
  console.log(`Scanning ${plan.length} portal search page(s). Target: ${budgets.totalMax} jobs total, up to ${budgets.perPortalMax} per portal.`);
  console.log('Playwright will open each candidate detail page and capture the full description before import when the portal exposes it.');
  console.log('You can log in, solve 2FA, or accept cookies in the visible browser when prompted.');

  runState.reset();
  const queue = [...plan];
  while (queue.length > 0) {
    const item = queue.shift();
    if (imported.length >= budgets.totalMax || allPortalBudgetsReached(portalCounts, budgets)) break;
    if (runState.isCancelled(item.portal)) {
      runState.setStatus(item.portal, 'done');
      continue;
    }
    if (runState.isPaused(item.portal)) {
      queue.push(item);
      await delay(250);
      continue;
    }
    if (!canImportForPortal({ portal: item.portal, importedTotal: imported.length, counters: portalCounts, budgets })) {
      console.log(`\nSkipping ${item.portal}: per-portal budget reached.`);
      runState.setStatus(item.portal, 'done');
      continue;
    }
    console.log(`\nOpening ${item.portal}: ${item.keyword}`);
    runState.setStatus(item.portal, 'running');
    runState.setLastUrl(item.portal, item.url);
    try {
      const extractor = await loadExtractor(item.portal);
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const auth = await ensurePortalSession(page, item.portal, item.url, rl);
      if (auth.reloaded) await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await settleSearchResults(page);

      let jobs = dedupeJobs(await extractor.extractListPage(page, item));
      runState.incr(item.portal, 'discovered', jobs.length);

      // Only treat the page as needing a manual step when extraction found
      // nothing - a normal results page has a "log in" link too. Never block on
      // stdin when there is no interactive terminal (e.g. started from the
      // dashboard); the runner would hang forever waiting for Enter.
      if (jobs.length === 0 && await needsHumanIntervention(page)) {
        if (input.isTTY) {
          await rl.question(`Manual step needed on ${item.portal}. Log in / solve CAPTCHA in the browser, then press Enter here to continue.`);
          jobs = dedupeJobs(await extractor.extractListPage(page, item));
        } else {
          console.log(`  ! ${item.portal} appears to need a manual login. Log into it in the open browser window, then run discovery again.`);
        }
      }
      console.log(`Found ${jobs.length} candidate job(s). Enriching details and filtering locally...`);

      for (const job of jobs) {
        if (imported.length >= budgets.totalMax) break;
        if (!canImportForPortal({ portal: job.portal, importedTotal: imported.length, counters: portalCounts, budgets })) break;

        const enriched = await enrichJobWithDetail(page, job);
        if (enriched.authRequired) {
          incrementStat(portalStats, job.portal, 'authRequired');
          runState.incr(job.portal, 'errors');
          runState.setLastError(job.portal, enriched.authReason || 'Login required');
          console.log(`  ! login required: ${job.company || 'Unknown'} | ${job.title}`);
          continue;
        }
        const decision = shouldImportJob(enriched, matchContext);
        runState.incr(job.portal, 'matched');
        if (!decision.import) {
          incrementStat(portalStats, job.portal, decision.reason === 'location' ? 'skippedLocation' : 'skippedRelevance');
          console.log(`  - skipped ${decision.reason}: ${job.company || 'Unknown'} | ${job.title}`);
          continue;
        }

        const created = await client.createJob(enriched);
        imported.push(created);
        recordPortalImport(portalCounts, job.portal);
        runState.incr(job.portal, 'imported');
        incrementStat(portalStats, job.portal, 'imported');
        incrementStat(portalStats, job.portal, enriched.source?.includes(':detail') ? 'detailCaptured' : 'partialDetail');
        console.log(`  + ${portalCounts[job.portal]}/${budgets.remainingByPortal[job.portal]} ${created.fit?.score ?? created.fitScore ?? 0}% ${job.company || 'Unknown'} | ${job.title}`);
      }
    } catch (error) {
      failed.push({ ...item, error: error.message });
      incrementStat(portalStats, item.portal, 'failedSearches');
      runState.incr(item.portal, 'errors');
      runState.setLastError(item.portal, error.message);
      runState.setStatus(item.portal, 'error');
      console.log(`  ! ${item.portal} failed: ${error.message}`);
    }
  }
} finally {
  await rl.close();
  console.log('\nDiscovery complete. Browser profile is preserved for the next run.');
  console.log(`Imported/updated jobs: ${imported.length}`);
  console.log('Per-portal discovery counts:');
  for (const [portal, stats] of Object.entries(portalStats)) {
    console.log(`  - ${portal}: imported=${stats.imported}, detail=${stats.detailCaptured}, partial=${stats.partialDetail}, skipped_location=${stats.skippedLocation}, skipped_relevance=${stats.skippedRelevance}, auth_required=${stats.authRequired}, failed_searches=${stats.failedSearches}`);
  }
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

async function ensurePortalSession(page, portal, returnUrl, rl) {
  const session = await readPortalSession(page, portal);
  if (!session.needsLogin) {
    if (session.authenticated) console.log(`  auth ok: ${portal}`);
    return { ...session, reloaded: false };
  }

  const loginUrl = portalLoginUrl(portal);
  const message = `${portal} needs login (${session.reason}).`;
  runState.setLastError(portal, message);

  if (!input.isTTY || !loginUrl) {
    throw new Error(`${message} Open the Login Browser from the dashboard, finish signing into ${portal}, then run discovery again.`);
  }

  console.log(`  ! ${message} Opening the saved-profile login page now.`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await rl.question(`Finish signing into ${portal} in the browser, then press Enter here to continue.`);

  const afterLogin = await readPortalSession(page, portal);
  if (afterLogin.needsLogin) {
    throw new Error(`${portal} still appears logged out (${afterLogin.reason}).`);
  }

  await page.goto(returnUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return { ...afterLogin, reloaded: true };
}

async function readPortalSession(page, portal) {
  const [title, text] = await Promise.all([
    page.title().catch(() => ''),
    page.locator('body').innerText({ timeout: 5000 }).catch(() => ''),
  ]);
  return detectPortalSession({
    portal,
    url: page.url(),
    title,
    text,
  });
}

async function settleSearchResults(page) {
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 1800).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  }
}

async function enrichJobWithDetail(page, job) {
  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const auth = await readPortalSession(page, job.portal);
    if (auth.needsLogin) {
      return {
        ...job,
        authRequired: true,
        authReason: `${job.portal} detail page needs login (${auth.reason})`,
      };
    }
    const extractor = await loadExtractor(job.portal);
    const detail = await extractor.extractDetail(page);
    const detailText = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
    const merged = mergeJobDetail(job, detailText);
    const enriched = {
      ...(merged === job ? markPartialDescription(job) : merged),
      ...detail,
      description: detail.description || merged.description || job.description || '',
    };
    return enriched.description ? enriched : markPartialDescription(enriched);
  } catch {
    return markPartialDescription(job);
  }
}

async function loadExtractor(portal) {
  return import(`./extractors/${portal}.mjs`);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readOptionalFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function createPortalStats(portals) {
  return Object.fromEntries(portals.map(portal => [portal, {
    imported: 0,
    detailCaptured: 0,
    partialDetail: 0,
    skippedLocation: 0,
    skippedRelevance: 0,
    authRequired: 0,
    failedSearches: 0,
  }]));
}

function incrementStat(stats, portal, key) {
  if (!stats[portal]) return;
  stats[portal][key] = Number(stats[portal][key] || 0) + 1;
}
