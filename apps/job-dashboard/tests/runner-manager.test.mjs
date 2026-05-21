import test from 'node:test';
import assert from 'node:assert/strict';

import { createRunnerManager } from '../runner/run-manager.mjs';

test('starts a known runner command and records output', async () => {
  const spawned = [];
  const manager = createRunnerManager({
    spawnImpl: (command, args, options) => {
      spawned.push({ command, args, options });
      const listeners = {};
      return {
        pid: 123,
        stdout: { on(event, fn) { listeners[`stdout:${event}`] = fn; } },
        stderr: { on(event, fn) { listeners[`stderr:${event}`] = fn; } },
        on(event, fn) { listeners[event] = fn; },
        emitStdout(text) { listeners['stdout:data']?.(Buffer.from(text)); },
        emitClose(code) { listeners.close?.(code); },
      };
    },
  });

  const run = manager.start('discover');
  assert.equal(run.status, 'running');
  assert.equal(spawned[0].args.at(-1), 'portal-discovery-runner.mjs');

  run.process.emitStdout('Found 3 jobs\n');
  run.process.emitClose(0);

  const current = manager.status();
  assert.equal(current.discover.status, 'exited');
  assert.match(current.discover.logs.at(-1).message, /exited with code 0/);
});

test('starts the AI fit scorer runner', () => {
  const spawned = [];
  const manager = createRunnerManager({
    spawnImpl: (command, args) => {
      spawned.push({ command, args });
      return {
        pid: 456,
        stdout: { on() {} },
        stderr: { on() {} },
        on() {},
      };
    },
  });

  manager.start('score-ai');
  assert.equal(spawned[0].args.at(-1), 'ai-fit-runner.mjs');
  assert.equal(manager.status()['score-ai'].status, 'running');
});

test('starts discovery for a specific portal and mode through env overrides', () => {
  const spawned = [];
  const manager = createRunnerManager({
    spawnImpl: (command, args, options) => {
      spawned.push({ command, args, options });
      return {
        pid: 789,
        stdout: { on() {} },
        stderr: { on() {} },
        on() {},
      };
    },
  });

  manager.start('discover', { portal: 'linkedin', mode: 'missing' });

  assert.equal(spawned[0].args.at(-1), 'portal-discovery-runner.mjs');
  assert.equal(spawned[0].options.env.PORTAL_DISCOVERY_PORTALS, 'linkedin');
  assert.equal(spawned[0].options.env.PORTAL_DISCOVERY_MODE, 'missing');
});

test('clears inherited smoke URL env for missing-detail discovery rescans', () => {
  const previousSmokeUrl = process.env.PORTAL_DISCOVERY_SMOKE_URL;
  process.env.PORTAL_DISCOVERY_SMOKE_URL = 'https://example.com/smoke';
  const spawned = [];
  try {
    const manager = createRunnerManager({
      spawnImpl: (command, args, options) => {
        spawned.push({ command, args, options });
        return {
          pid: 790,
          stdout: { on() {} },
          stderr: { on() {} },
          on() {},
        };
      },
    });

    manager.start('discover', { mode: 'missing' });

    assert.equal(spawned[0].options.env.PORTAL_DISCOVERY_MODE, 'missing');
    assert.equal(spawned[0].options.env.PORTAL_DISCOVERY_SMOKE_URL, '');
  } finally {
    if (previousSmokeUrl === undefined) {
      delete process.env.PORTAL_DISCOVERY_SMOKE_URL;
    } else {
      process.env.PORTAL_DISCOVERY_SMOKE_URL = previousSmokeUrl;
    }
  }
});

test('rejects unknown runner names', () => {
  const manager = createRunnerManager({ spawnImpl: () => { throw new Error('not expected'); } });
  assert.throws(() => manager.start('unknown'), /Unknown runner/);
});
