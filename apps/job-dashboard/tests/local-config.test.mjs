import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadLocalConfig, redactLocalConfig } from '../runner/local-config.mjs';

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
