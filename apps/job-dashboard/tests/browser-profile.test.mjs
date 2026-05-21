import test from 'node:test';
import assert from 'node:assert/strict';

import { openRunnerPage } from '../runner/browser-profile.mjs';

test('opens a fresh blank runner page for missing-detail rescans', async () => {
  const existingPage = pageDouble('https://example.com/smoke');
  const freshPage = pageDouble('about:blank');
  const context = {
    pages: () => [existingPage],
    async newPage() {
      return freshPage;
    },
  };

  const page = await openRunnerPage(context, { fresh: true, resetUrl: 'about:blank' });

  assert.equal(page, freshPage);
  assert.equal(existingPage.gotoCalls.length, 0);
  assert.deepEqual(freshPage.gotoCalls, [{
    url: 'about:blank',
    options: { waitUntil: 'domcontentloaded', timeout: 5000 },
  }]);
  assert.equal(freshPage.broughtToFront, true);
});

test('reuses the current runner page for normal discovery runs', async () => {
  const existingPage = pageDouble('https://example.com/search');
  const context = {
    pages: () => [existingPage],
    async newPage() {
      throw new Error('not expected');
    },
  };

  const page = await openRunnerPage(context);

  assert.equal(page, existingPage);
  assert.equal(existingPage.gotoCalls.length, 0);
});

function pageDouble(url) {
  return {
    url: () => url,
    gotoCalls: [],
    broughtToFront: false,
    async goto(nextUrl, options) {
      this.gotoCalls.push({ url: nextUrl, options });
    },
    async bringToFront() {
      this.broughtToFront = true;
    },
  };
}
