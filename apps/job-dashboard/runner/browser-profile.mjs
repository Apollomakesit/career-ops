import { chromium } from 'playwright';

/**
 * Resolve which browser the local runners should drive.
 *
 * When BROWSER_USER_DATA_DIR points at an installed Chrome "User Data" folder
 * (with BROWSER_CHANNEL=chrome), the runners reuse the real Chrome profile so
 * existing logins on LinkedIn / eJobs / etc. are already in place. Otherwise
 * they fall back to a dedicated Playwright profile directory.
 */
export function resolveBrowserProfile(env = {}) {
  const channel = String(env.BROWSER_CHANNEL || '').trim();
  const profileDirectory = String(env.BROWSER_PROFILE_DIRECTORY || '').trim();
  const userDataDir = String(env.BROWSER_USER_DATA_DIR || '').trim()
    || String(env.CAREER_OPS_BROWSER_PROFILE || '').trim()
    || '.career-ops-browser';
  return { channel, profileDirectory, userDataDir };
}

export function describeBrowserProfile(env = {}) {
  const { channel, profileDirectory, userDataDir } = resolveBrowserProfile(env);
  if (channel) {
    return `${channel}${profileDirectory ? ` (profile "${profileDirectory}")` : ''} at ${userDataDir}`;
  }
  return `Playwright Chromium profile at ${userDataDir}`;
}

export async function launchBrowserContext(env = {}, { stealth = false } = {}) {
  const { channel, profileDirectory, userDataDir } = resolveBrowserProfile(env);
  const options = { headless: false, viewport: null };
  if (channel) options.channel = channel;
  if (profileDirectory) options.args = [`--profile-directory=${profileDirectory}`];
  const chromiumImpl = stealth ? await stealthChromium().catch(() => chromium) : chromium;

  try {
    return await chromiumImpl.launchPersistentContext(userDataDir, options);
  } catch (error) {
    if (channel) {
      throw new Error(
        `Could not open ${channel} with your profile. Close every ${channel} window `
        + `(check the system tray too) and run this again. Original error: ${error.message}`,
      );
    }
    throw error;
  }
}

async function stealthChromium() {
  const { chromium: chromiumStealth } = await import('playwright-extra');
  const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
  chromiumStealth.use(stealth());
  return chromiumStealth;
}
