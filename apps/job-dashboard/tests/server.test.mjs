import test from 'node:test';
import assert from 'node:assert/strict';

import { createDashboardServer } from '../src/server.mjs';

test('serves health response through HTTP', async () => {
  const server = createDashboardServer({
    store: {
      async getProfile() { return {}; },
    },
  });

  await listen(server);
  try {
    const baseUrl = addressFor(server);
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
  } finally {
    await close(server);
  }
});

test('serves dashboard HTML', async () => {
  const server = createDashboardServer({
    store: {
      async getProfile() { return {}; },
    },
  });

  await listen(server);
  try {
    const response = await fetch(addressFor(server));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Career Ops Dashboard/);
  } finally {
    await close(server);
  }
});

test('serves dashboard shell while protecting API data when token is configured', async () => {
  const previousToken = process.env.DASHBOARD_TOKEN;
  process.env.DASHBOARD_TOKEN = 'secret';
  const server = createDashboardServer({
    store: {
      async getProfile() { return {}; },
    },
  });

  await listen(server);
  try {
    const baseUrl = addressFor(server);
    const htmlResponse = await fetch(baseUrl);
    assert.equal(htmlResponse.status, 200);
    assert.match(await htmlResponse.text(), /Career Ops Dashboard/);

    const apiResponse = await fetch(`${baseUrl}/api/profile`);
    assert.equal(apiResponse.status, 401);
  } finally {
    await close(server);
    if (previousToken === undefined) {
      delete process.env.DASHBOARD_TOKEN;
    } else {
      process.env.DASHBOARD_TOKEN = previousToken;
    }
  }
});

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

function addressFor(server) {
  const address = server.address();
  return `http://${address.address}:${address.port}`;
}
