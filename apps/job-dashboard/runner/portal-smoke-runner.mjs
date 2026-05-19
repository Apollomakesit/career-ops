#!/usr/bin/env node
import 'dotenv/config';

import { chromium } from 'playwright';

import { buildPortalSearchPlan, supportedPortals } from './portal-config.mjs';
import { dedupeJobs, extractJobsFromPage } from './portal-extractor.mjs';

const keyword = process.env.PORTAL_SMOKE_KEYWORD || 'Technical Support';
const portals = (process.env.PORTAL_SMOKE_PORTALS || supportedPortals.join(','))
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(Boolean);
const headless = process.env.PORTAL_SMOKE_HEADLESS !== 'false';
const plan = buildPortalSearchPlan({ keywords: [keyword], portals, perPortalLimit: 1 });

const browser = await chromium.launch({ headless });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const results = [];

try {
  for (const item of plan) {
    const started = Date.now();
    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const title = await page.title().catch(() => '');
      const jobs = dedupeJobs(await extractJobsFromPage(page, item));
      const result = {
        portal: item.portal,
        ok: jobs.length > 0,
        jobs: jobs.length,
        title,
        first: jobs[0] ? {
          title: jobs[0].title,
          company: jobs[0].company,
          url: jobs[0].url,
        } : null,
        ms: Date.now() - started,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    } catch (error) {
      const result = {
        portal: item.portal,
        ok: false,
        jobs: 0,
        error: error.message,
        ms: Date.now() - started,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
} finally {
  await browser.close();
}

if (results.every(result => result.jobs === 0)) process.exit(1);
