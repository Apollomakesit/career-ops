#!/usr/bin/env node
// Opens the dedicated automation browser profile and points it at the job
// portals so you can sign in once. The session is saved in that profile and
// reused by every later discovery / form-filling run. Close the window when
// you are done.
import 'dotenv/config';

import { describeBrowserProfile, launchBrowserContext } from './browser-profile.mjs';
import { envFromLocalConfig, loadLocalConfig } from './local-config.mjs';
import { portalLoginUrl } from './portal-auth.mjs';

const env = { ...envFromLocalConfig(loadLocalConfig()), ...process.env };

const portals = [
  ['LinkedIn', portalLoginUrl('linkedin')],
  ['eJobs', portalLoginUrl('ejobs')],
  ['BestJobs', portalLoginUrl('bestjobs')],
  ['HiPo', portalLoginUrl('hipo')],
];

console.log(`Opening the automation login browser: ${describeBrowserProfile(env)}`);
const context = await launchBrowserContext(env);

try {
  const firstPage = context.pages()[0] || await context.newPage();
  await firstPage.goto(portals[0][1], { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  console.log(`  opened ${portals[0][0]}`);
  for (const [name, url] of portals.slice(1)) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    console.log(`  opened ${name}`);
  }
} catch (error) {
  console.log(`Could not open every portal tab: ${error.message}`);
}

console.log('Sign into each job site, then close the browser window. Your logins will be saved.');
await new Promise(resolve => context.on('close', resolve));
console.log('Login browser closed. The saved session is ready for discovery.');
process.exit(0);
