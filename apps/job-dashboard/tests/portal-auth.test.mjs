import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPortalSession,
  portalLoginUrl,
} from '../runner/portal-auth.mjs';

test('detects LinkedIn Google sign-in as an automation-blocking login page', () => {
  const state = detectPortalSession({
    portal: 'linkedin',
    url: 'https://www.linkedin.com/login',
    title: 'LinkedIn Login',
    text: 'Sign in with Google Continue with Google Email or phone Password',
  });

  assert.equal(state.needsLogin, true);
  assert.equal(state.authenticated, false);
  assert.match(state.reason, /google/i);
});

test('recognizes a logged-in LinkedIn shell', () => {
  const state = detectPortalSession({
    portal: 'linkedin',
    url: 'https://www.linkedin.com/jobs/search',
    title: 'Jobs',
    text: 'My Network Jobs Messaging Notifications For Business Retry Premium',
  });

  assert.equal(state.needsLogin, false);
  assert.equal(state.authenticated, true);
});

test('does not bounce a logged-in LinkedIn page that still shows Join now / sign in CTAs', () => {
  // Real /jobs/search/ pages keep "Join now" and "Sign in to view" banners
  // even for authenticated users. As long as nav items prove auth, treat
  // the session as live.
  const state = detectPortalSession({
    portal: 'linkedin',
    url: 'https://www.linkedin.com/jobs/search/?keywords=technical%20support',
    title: 'Jobs | LinkedIn',
    text: 'My Network Notifications Sign in to view your saved jobs Join now Premium',
  });

  assert.equal(state.needsLogin, false);
  assert.equal(state.authenticated, true);
});

test('detects Romanian portal login screens without flagging ordinary search pages', () => {
  assert.equal(detectPortalSession({
    portal: 'ejobs',
    url: 'https://www.ejobs.ro/login',
    text: 'Intra in cont Email Parola Autentificare',
  }).needsLogin, true);

  assert.equal(detectPortalSession({
    portal: 'ejobs',
    url: 'https://www.ejobs.ro/locuri-de-munca/python?oras=Bucuresti',
    text: 'Locuri de munca Python Bucuresti Intra in cont Programator Python SOTEC SOFTWARE',
  }).needsLogin, false);

  assert.equal(detectPortalSession({
    portal: 'bestjobs',
    url: 'https://www.bestjobs.eu/ro/locuri-de-munca/python',
    text: 'Ioan Stefan Vlaicu Joburi Talente Software Engineer Python Aplică',
  }).authenticated, true);

  assert.equal(detectPortalSession({
    portal: 'bestjobs',
    url: 'https://www.bestjobs.eu/ro/locuri-de-munca/python',
    text: 'Joburi Talente Login Software Engineer Python CODA INTELLIGENCE',
  }).needsLogin, false);

  assert.equal(detectPortalSession({
    portal: 'hipo',
    url: 'https://www.hipo.ro/locuri-de-munca/cautajob/Toate-Domeniile/Bucuresti/Python',
    text: '187 Locuri de munca Python Developer din BUCURESTI Senior Python Developer VOIS Romania',
  }).needsLogin, false);

  assert.equal(detectPortalSession({
    portal: 'hipo',
    url: 'https://www.hipo.ro/locuri-de-munca/cautajob/Toate-Domeniile/Bucuresti/Python',
    text: 'Intra in cont Locuri de munca Python Developer din BUCURESTI',
  }).needsLogin, false);
});

test('provides login URLs for every Romanian portal', () => {
  assert.equal(portalLoginUrl('linkedin'), 'https://www.linkedin.com/login');
  assert.equal(portalLoginUrl('ejobs'), 'https://www.ejobs.ro/login');
  assert.equal(portalLoginUrl('bestjobs'), 'https://www.bestjobs.eu/ro/login');
  assert.equal(portalLoginUrl('hipo'), 'https://www.hipo.ro/locuri-de-munca/logincontcandidat');
});
