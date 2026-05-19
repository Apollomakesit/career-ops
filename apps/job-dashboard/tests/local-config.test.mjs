import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { defaultLocalConfig, loadLocalConfig, redactLocalConfig } from '../runner/local-config.mjs';

test('defaults to the local dashboard instead of the hosted Railway dashboard', () => {
  const previousUrl = process.env.DASHBOARD_URL;
  const previousToken = process.env.DASHBOARD_TOKEN;
  delete process.env.DASHBOARD_URL;
  delete process.env.DASHBOARD_TOKEN;
  try {
    assert.equal(defaultLocalConfig().dashboardUrl, 'http://127.0.0.1:3000');
    assert.equal(defaultLocalConfig().dashboardToken, '');
  } finally {
    if (previousUrl === undefined) delete process.env.DASHBOARD_URL;
    else process.env.DASHBOARD_URL = previousUrl;
    if (previousToken === undefined) delete process.env.DASHBOARD_TOKEN;
    else process.env.DASHBOARD_TOKEN = previousToken;
  }
});

test('loads local runner config files written with a UTF-8 BOM', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'career-ops-runner-'));
  try {
    const configPath = path.join(dir, 'runner.json');
    writeFileSync(configPath, `\uFEFF${JSON.stringify({
      aiProvider: 'anthropic',
      aiProxyApiKey: 'local-key',
      dashboardToken: 'dashboard-token',
    })}`);

    const config = loadLocalConfig(configPath);
    assert.equal(config.aiProvider, 'anthropic');
    assert.equal(redactLocalConfig(config).aiProxyApiKey, 'configured');
    assert.equal(redactLocalConfig(config).dashboardToken, 'configured');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
